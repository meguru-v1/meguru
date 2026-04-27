import LZString from 'lz-string';
import type { Course } from '../types';

const SHARE_PARAM = 'share';

/** コースをURLに圧縮エンコードして返す */
export function encodeCourseToUrl(course: Course): string {
    try {
        const json = JSON.stringify(course);
        const compressed = LZString.compressToEncodedURIComponent(json);
        const base = `${window.location.origin}${window.location.pathname}`;
        return `${base}?${SHARE_PARAM}=${compressed}`;
    } catch {
        return '';
    }
}

/** URLからコースを復元する。失敗時はnull */
export function decodeShareUrl(): Course | null {
    try {
        const params = new URLSearchParams(window.location.search);
        const compressed = params.get(SHARE_PARAM);
        if (!compressed) return null;
        const json = LZString.decompressFromEncodedURIComponent(compressed);
        if (!json) return null;
        return JSON.parse(json) as Course;
    } catch {
        return null;
    }
}

/** URLのshareパラメータを除去してブラウザ履歴を整理 */
export function clearShareParam(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete(SHARE_PARAM);
    window.history.replaceState({}, '', url.toString());
}

/** クリップボードにコピー（フォールバック付き） */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        // フォールバック
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        return true;
    } catch {
        return false;
    }
}
