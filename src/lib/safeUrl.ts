// ===== 外部URLの安全化ユーティリティ =====
// 共有URL・localStorage・AI応答など「信頼できない入力」から来た画像URLを
// そのまま <img src> に流さないためのガード。
// 画像は全てプロキシ経由で取得するため、APIキーはURLに現れない。
import { photoUrl, streetViewUrl, API_BASE } from './apiClient';

// 画像として読み込みを許可するホスト
const ALLOWED_IMAGE_HOSTS = new Set([
    'places.googleapis.com',
    'maps.googleapis.com',
    'maps.gstatic.com',
    'lh3.googleusercontent.com',
    'streetviewpixels-pa.googleapis.com',
    'images.unsplash.com',
]);

// プロキシ自身のホストも画像取得先として許可する
function allowedHosts(): Set<string> {
    const hosts = new Set(ALLOWED_IMAGE_HOSTS);
    try {
        hosts.add(new URL(API_BASE).hostname);
    } catch { /* ignore */ }
    return hosts;
}

/**
 * 信頼できない画像URLを検証する。
 * - https のみ許可（javascript: / data: / http: は拒否）
 * - ホストがallowlistに含まれるもののみ許可
 * 許可されない場合は undefined を返す（呼び出し側でプレースホルダにフォールバック）。
 */
export function safeImageUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return undefined;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:') return undefined;
        if (!allowedHosts().has(url.hostname)) return undefined;
        return url.toString();
    } catch {
        return undefined;
    }
}

/**
 * Google Places の photo reference を検証する。
 * 想定形式: places/{place_id}/photos/{photo_reference}
 * パス区切りとクエリの混入（URL改ざん）を防ぐ。
 */
export function safePhotoRef(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return undefined;
    // 英数字・ハイフン・アンダースコア・スラッシュのみ。'..' やクエリ・エンコード文字は拒否
    if (!/^[A-Za-z0-9_\-/]+$/.test(raw)) return undefined;
    if (raw.includes('..') || raw.startsWith('/')) return undefined;
    return raw;
}

/** プロキシ経由の写真URLを組み立てる（refが不正なら undefined） */
export function buildPlacePhotoUrl(photoRef: unknown, maxWidthPx: number): string | undefined {
    const ref = safePhotoRef(photoRef);
    if (!ref) return undefined;
    return photoUrl(ref, maxWidthPx);
}

/** プロキシ経由のストリートビューURLを組み立てる（座標が不正なら undefined） */
export function buildStreetViewUrl(lat: unknown, lng: unknown): string | undefined {
    if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return undefined;
    if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return undefined;
    return streetViewUrl(lat, lng);
}
