// Cloud Functions エンドポイント（Gemini APIキーはサーバー側で管理）
export const PROXY_URL = (import.meta.env.VITE_GEMINI_PROXY_URL as string)
    || 'https://asia-northeast1-project-6f8c0b7f-7452-4e63-a48.cloudfunctions.net/gemini-proxy';

if (import.meta.env.DEV && !import.meta.env.VITE_GEMINI_PROXY_URL) {
    console.warn('[Meguru] VITE_GEMINI_PROXY_URL not set — using fallback production endpoint.');
}

// Cloud Functions 経由でAI生成を実行
export const callGeminiProxy = async (
    prompt: string,
    model: string,
    jsonMode: boolean = false
): Promise<string> => {
    const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, jsonMode }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const err = new Error(errorData.error || `Proxy error: ${response.status}`) as Error & { status?: number };
        err.status = response.status;
        throw err;
    }
    const data = await response.json();
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
