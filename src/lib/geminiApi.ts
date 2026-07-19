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
