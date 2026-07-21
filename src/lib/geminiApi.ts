// Cloud Functions エンドポイント（APIキーはサーバー側で管理）
import { apiPost, API_BASE } from './apiClient';

export const PROXY_URL = API_BASE;

// Cloud Functions 経由でAI生成を実行
export const callGeminiProxy = async (
    prompt: string,
    model: string,
    jsonMode: boolean = false
): Promise<string> => {
    const data = await apiPost<{ text: string }>('/gemini', { prompt, model, jsonMode });
    return data.text;
};

// 待機用
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// <thinking>ブロックの除去（Gemini 2.5系が出力することがある）
export const stripThinkingBlock = (text: string): string => {
    return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
};

// モデル別最終リクエスト時刻管理
const lastRequestTimes: Record<string, number> = {
    'gemini-2.5-flash-lite': 0,
    'gemini-2.5-flash': 0,
};

// レート制限待機用
export const waitRateLimit = async (modelName: string, intervalMs: number) => {
    const now = Date.now();
    const elapsed = now - (lastRequestTimes[modelName] || 0);
    if (elapsed < intervalMs) {
        const wait = intervalMs - elapsed;
        console.log(`[RateLimit] Waiting ${wait}ms for model: ${modelName}`);
        await sleep(wait);
    }
    lastRequestTimes[modelName] = Date.now();
};

const MAX_RETRIES = 3;
const FALLBACK_MODEL = 'gemini-2.5-flash';

/**
 * 時間をおけば同じモデルで通る種類のエラーか。
 * 429（レート制限）と 5xx（一時的な過負荷）が該当する。
 */
export const isTransientError = (err: unknown): boolean => {
    const e = err as Error & { status?: number };
    if (e?.status && [429, 500, 502, 503, 504].includes(e.status)) return true;
    const message = e?.message || '';
    return /\b(429|500|502|503|504)\b/.test(message)
        || message.includes('RESOURCE_EXHAUSTED')
        || message.includes('UNAVAILABLE');
};

/**
 * リトライ付きで Gemini を呼ぶ。
 *
 * 一時的な過負荷でモデルを変えても状況は改善しないので、その場合は
 * 待ってから同じモデルで叩き直す。以前は 5xx でも即座に高いモデルへ
 * 切り替えており、待ち時間ゼロで無駄な課金が発生していた。
 */
export const callGeminiWithRetry = async (
    prompt: string,
    model: string,
    label: string
): Promise<string> => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // モデル切替は「そのモデルが応答を返せない」ときだけ
        const useFallback = attempt > 0 && !isTransientError(lastError);
        const currentModel = useFallback ? FALLBACK_MODEL : model;
        try {
            await waitRateLimit(currentModel, 2000);
            return await callGeminiProxy(prompt, currentModel, attempt > 0);
        } catch (err) {
            lastError = err;
            if (attempt >= MAX_RETRIES) break;

            if (isTransientError(err)) {
                const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30000);
                console.warn(`[${label}] 一時的なエラー。${backoffMs}ms 後に再試行 (${attempt + 1}/${MAX_RETRIES})`);
                await sleep(backoffMs);
            } else {
                console.warn(`[${label}] 失敗。フォールバックモデルで再試行 (${attempt + 1}/${MAX_RETRIES})`, err);
            }
        }
    }

    console.error(`[${label}] ${MAX_RETRIES + 1}回すべて失敗`);
    throw lastError;
};

// 【07】 モデル動的選択
// 3時間以下の散策 → flash-lite (高速・低コスト), それ以上 → flash
export const selectModel = (durationMinutes: number): string => {
    return durationMinutes <= 180 ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
};

// AI応答テキストから JSON 部分のみを抽出する (```json ... ``` 形式・素の{}どちらも対応)
export const extractJsonString = (raw: string): string => {
    let jsonStr = stripThinkingBlock(raw);
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1];
    } else {
        const firstBrace = jsonStr.indexOf('{');
        const firstBracket = jsonStr.indexOf('[');
        const start = (firstBrace !== -1 && firstBracket !== -1)
            ? Math.min(firstBrace, firstBracket)
            : Math.max(firstBrace, firstBracket);
        const lastBrace = jsonStr.lastIndexOf('}');
        const lastBracket = jsonStr.lastIndexOf(']');
        const end = Math.max(lastBrace, lastBracket);
        if (start !== -1 && end !== -1 && start < end) {
            jsonStr = jsonStr.substring(start, end + 1);
        }
    }
    // trailing comma を許容
    return jsonStr.replace(/,\s*([\]}])/g, '$1');
};
