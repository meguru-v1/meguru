// ===== APIプロキシ クライアント =====
// Google系API・Gemini への呼び出しは全てこのモジュール経由でプロキシに送る。
// APIキーはサーバー側にのみ存在し、クライアントバンドルには含まれない。
import { getAppCheckHeaders } from './appCheck';

const RAW_BASE = (import.meta.env.VITE_API_PROXY_URL as string)
    || (import.meta.env.VITE_GEMINI_PROXY_URL as string)
    || 'https://asia-northeast1-project-6f8c0b7f-7452-4e63-a48.cloudfunctions.net/gemini-proxy';

/** 末尾スラッシュを除いたプロキシのベースURL */
export const API_BASE = RAW_BASE.replace(/\/+$/, '');

if (import.meta.env.DEV && !import.meta.env.VITE_API_PROXY_URL && !import.meta.env.VITE_GEMINI_PROXY_URL) {
    console.warn('[Meguru] VITE_API_PROXY_URL not set — using fallback production endpoint.');
}

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
    const appCheckHeaders = await getAppCheckHeaders();
    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...appCheckHeaders,
            ...(init.headers || {}),
        },
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(data?.error || `Request failed: ${response.status}`, response.status);
    }
    return response.json() as Promise<T>;
}

export const apiPost = <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const apiGet = <T>(path: string, params: Record<string, string | number>): Promise<T> => {
    const query = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    return request<T>(`${path}?${query}`, { method: 'GET' });
};

/** <img src> 用のURL。App Checkヘッダを付けられないため Referer でサーバー側が判定する */
export const photoUrl = (ref: string, maxWidthPx: number): string =>
    `${API_BASE}/photo?ref=${encodeURIComponent(ref)}&maxWidthPx=${maxWidthPx}`;

export const streetViewUrl = (lat: number, lng: number): string =>
    `${API_BASE}/streetview?lat=${lat}&lng=${lng}`;
