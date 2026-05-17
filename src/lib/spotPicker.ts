import type { Spot } from '../types';
import { isDining } from './routeAlgorithms';

const distM = (a: Spot, b: Spot): number => {
    const dx = (a.lat - b.lat) * 111000;
    const dy = (a.lon - b.lon) * 111000 * Math.cos(a.lat * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
};

const sharesType = (a: Spot, b: Spot): number => {
    const at = (a.tags?.types as string[] | undefined) || [];
    const bt = (b.tags?.types as string[] | undefined) || [];
    if (at.length === 0 || bt.length === 0) return 0;
    const setB = new Set(bt);
    return at.filter(t => setB.has(t)).length;
};

const usedSet = (courseSpots: Spot[]): Set<string> =>
    new Set(courseSpots.map(s => String(s.id)));

const pickWithJitter = <T,>(scored: Array<{ spot: T; score: number }>): T | null => {
    if (scored.length === 0) return null;
    scored.sort((a, b) => b.score - a.score);
    // 上位3件からランダム選択（連打時のバリエーション確保）
    const top = scored.slice(0, Math.min(3, scored.length));
    return top[Math.floor(Math.random() * top.length)].spot;
};

/**
 * 差し替え候補: 同じ dining/non-dining、似たカテゴリ、近距離を優先
 */
export function pickReplacementSpot(target: Spot, courseSpots: Spot[], candidates: Spot[]): Spot | null {
    const used = usedSet(courseSpots);
    const isDiningTarget = isDining(target);

    // まず同種別（食事/非食事）のみで探す
    let pool = candidates.filter(c => !used.has(String(c.id)) && isDining(c) === isDiningTarget);
    if (pool.length === 0) {
        // 同種別がなければ全候補から
        pool = candidates.filter(c => !used.has(String(c.id)));
    }
    if (pool.length === 0) return null;

    const scored = pool.map(c => ({
        spot: c,
        // 種別一致を最重視、次に近距離、最後に評価
        score: sharesType(target, c) * 1000 - distM(target, c) + (c.rating ?? 3.5) * 100,
    }));
    return pickWithJitter(scored);
}

/**
 * 挿入候補: 前後スポットの中間に近く、コースに未使用、観光スポット優先
 */
export function pickInsertionSpot(
    prevSpot: Spot,
    nextSpot: Spot | null,
    courseSpots: Spot[],
    candidates: Spot[]
): Spot | null {
    const used = usedSet(courseSpots);
    const pool = candidates.filter(c => !used.has(String(c.id)));
    if (pool.length === 0) return null;

    const midLat = nextSpot ? (prevSpot.lat + nextSpot.lat) / 2 : prevSpot.lat;
    const midLon = nextSpot ? (prevSpot.lon + nextSpot.lon) / 2 : prevSpot.lon;
    const anchor: Spot = { ...prevSpot, lat: midLat, lon: midLon };

    const scored = pool.map(c => ({
        spot: c,
        // 近距離 + 高評価 - 食事ペナルティ (食事の偏りを避けるため)
        score: -distM(anchor, c) + (c.rating ?? 3.5) * 100 - (isDining(c) ? 200 : 0),
    }));
    return pickWithJitter(scored);
}
