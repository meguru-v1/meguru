import LZString from 'lz-string';
import type { Course, Spot, TravelMode } from '../types';
import { safeImageUrl } from './safeUrl';

const SHARE_PARAM = 'share';

// ===== 共有URLの入力検証 =====
// 共有URLのペイロードは第三者が自由に作れる。デコード結果をそのまま state / localStorage に
// 流し込むと、任意のURLを画像として読み込ませる等の悪用ができるため、ここで形を強制する。
const MAX_COMPRESSED_LEN = 200_000;
const MAX_SPOTS = 60;
const MAX_STR = 500;
const VALID_TRAVEL_MODES: TravelMode[] = ['walk', 'bicycle', 'car', 'transit'];

const str = (v: unknown, max = MAX_STR): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined;

const num = (v: unknown, min: number, max: number): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;

const sanitizeSpot = (raw: unknown): Spot | null => {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Record<string, unknown>;

    const lat = num(s.lat, -90, 90);
    const lon = num(s.lon, -180, 180);
    const name = str(s.name, 200);
    // 座標と名前が壊れているスポットは描画・URL生成で破綻するので落とす
    if (lat === undefined || lon === undefined || !name) return null;

    const rawTags = (s.tags && typeof s.tags === 'object') ? s.tags as Record<string, unknown> : {};

    // tags は [key: string]: unknown を許す型なので、既知キーだけを明示的に拾い直す
    const spot: Spot = {
        id: typeof s.id === 'string' || typeof s.id === 'number' ? s.id : `${lat},${lon}`,
        lat,
        lon,
        name,
        category: str(s.category, 100) ?? 'spot',
        tags: {
            description: str(rawTags.description, 1000),
            opening_hours: str(rawTags.opening_hours, 200),
            // 画像URLはallowlist済みホストのhttpsのみ通す
            photo: safeImageUrl(rawTags.photo),
        },
    };

    const stayTime = num(s.stayTime, 0, 24 * 60);
    if (stayTime !== undefined) spot.stayTime = stayTime;
    const estimatedStayTime = num(s.estimatedStayTime, 0, 24 * 60);
    if (estimatedStayTime !== undefined) spot.estimatedStayTime = estimatedStayTime;
    const travel = num(s.travel_time_minutes, 0, 24 * 60);
    if (travel !== undefined) spot.travel_time_minutes = travel;

    const aiDescription = str(s.aiDescription, 2000);
    if (aiDescription) spot.aiDescription = aiDescription;
    const mustSee = str(s.must_see, 1000);
    if (mustSee) spot.must_see = mustSee;
    const proTip = str(s.pro_tip, 1000);
    if (proTip) spot.pro_tip = proTip;
    const trivia = str(s.trivia, 1000);
    if (trivia) spot.trivia = trivia;
    const cultural = str(s.cultural_property, 200);
    if (cultural) spot.cultural_property = cultural;
    const placeId = str(s.place_id, 200);
    if (placeId) spot.place_id = placeId;

    return spot;
};

/** デコード済みの未検証データを Course 型に正規化する。復元不能なら null */
export function sanitizeSharedCourse(raw: unknown): Course | null {
    if (!raw || typeof raw !== 'object') return null;
    const c = raw as Record<string, unknown>;

    if (!Array.isArray(c.spots)) return null;
    const spots = c.spots.slice(0, MAX_SPOTS).map(sanitizeSpot).filter((s): s is Spot => s !== null);
    if (spots.length === 0) return null;

    const course: Course = {
        id: str(c.id, 100) ?? `shared-${spots.length}`,
        title: str(c.title, 200) ?? '共有されたコース',
        description: str(c.description, 2000) ?? '',
        totalTime: num(c.totalTime, 0, 60 * 24 * 7) ?? 0,
        spots,
    };

    const theme = str(c.theme, 200);
    if (theme) course.theme = theme;
    const totalDistance = num(c.totalDistance, 0, 100_000);
    if (totalDistance !== undefined) course.totalDistance = totalDistance;
    if (typeof c.travelMode === 'string' && VALID_TRAVEL_MODES.includes(c.travelMode as TravelMode)) {
        course.travelMode = c.travelMode as TravelMode;
    }

    return course;
}

/** コースをURLに圧縮エンコードして返す */
export function encodeCourseToUrl(course: Course): string {
    try {
        // 【最適化】共有URLの短縮化のために、不要なデータ（画像URLや長文レビュー等）を削除する
        const prunedCourse: Course = {
            ...course,
            spots: course.spots.map(spot => {
                const { 
                    photos, reviews, editorial_summary, tags, 
                    user_ratings_total, rating, business_status, 
                    ...keep 
                } = spot as any;
                return keep as Spot;
            })
        };

        const json = JSON.stringify(prunedCourse);
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
        if (compressed.length > MAX_COMPRESSED_LEN) return null;
        const json = LZString.decompressFromEncodedURIComponent(compressed);
        if (!json) return null;
        // 第三者が作った可能性のあるデータなので、必ず検証してから返す
        return sanitizeSharedCourse(JSON.parse(json));
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
