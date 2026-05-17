import { describe, it, expect } from 'vitest';
import {
    getStayTimeByType,
    isDining,
    isCafeOnly,
    ratingScore,
    separateConsecutiveMeals,
    nearestNeighborSort,
    twoOptImprove,
    buildSmartItinerary,
} from '../routeAlgorithms';
import type { Spot } from '../../types';

const makeSpot = (id: string, lat: number, lon: number, opts: Partial<Spot> = {}): Spot => ({
    id, lat, lon, name: id, category: 'point_of_interest', tags: {}, ...opts,
});

describe('getStayTimeByType', () => {
    it('博物館は 90分', () => {
        expect(getStayTimeByType('museum')).toBe(90);
    });
    it('カフェは 30分', () => {
        expect(getStayTimeByType('cafe')).toBe(30);
    });
    it('レストランは 60分', () => {
        expect(getStayTimeByType('restaurant')).toBe(60);
    });
    it('未知カテゴリはデフォルト 40分', () => {
        expect(getStayTimeByType('unknown_xyz')).toBe(40);
    });
});

describe('isDining', () => {
    it('レストランは dining', () => {
        expect(isDining(makeSpot('r', 0, 0, { category: 'restaurant' }))).toBe(true);
    });
    it('カフェも dining', () => {
        expect(isDining(makeSpot('c', 0, 0, { category: 'cafe' }))).toBe(true);
    });
    it('美術館は dining ではない', () => {
        expect(isDining(makeSpot('m', 0, 0, { category: 'museum' }))).toBe(false);
    });
    it('tags.types からも判定できる', () => {
        const s = makeSpot('s', 0, 0, { category: 'point', tags: { types: ['cafe', 'food'] } });
        expect(isDining(s)).toBe(true);
    });
});

describe('isCafeOnly', () => {
    it('カフェのみは true', () => {
        expect(isCafeOnly(makeSpot('c', 0, 0, { category: 'cafe' }))).toBe(true);
    });
    it('レストラン併設のカフェは false', () => {
        const s = makeSpot('s', 0, 0, { category: 'cafe', tags: { types: ['cafe', 'restaurant'] } });
        expect(isCafeOnly(s)).toBe(false);
    });
});

describe('ratingScore', () => {
    it('評価が高くレビュー多いほど高スコア', () => {
        const high = makeSpot('h', 0, 0, { rating: 4.5, user_ratings_total: 1000 });
        const low = makeSpot('l', 0, 0, { rating: 3.5, user_ratings_total: 10 });
        expect(ratingScore(high)).toBeGreaterThan(ratingScore(low));
    });
    it('評価未定義でもクラッシュしない (log(1)=0 で 0 を返す)', () => {
        expect(ratingScore(makeSpot('x', 0, 0))).toBe(0);
    });
});

describe('separateConsecutiveMeals', () => {
    it('連続した食事スポットを観光スポットで分離', () => {
        const spots = [
            makeSpot('R1', 0, 0, { category: 'restaurant' }),
            makeSpot('R2', 0, 0, { category: 'cafe' }),
            makeSpot('M1', 0, 0, { category: 'museum' }),
        ];
        const result = separateConsecutiveMeals(spots);
        // 連続した食事 (R1, R2) の間に museum が入る
        expect(isDining(result[0]) && isDining(result[1])).toBe(false);
    });
    it('分離不可能な場合は元の順序を維持', () => {
        const spots = [
            makeSpot('R1', 0, 0, { category: 'restaurant' }),
            makeSpot('R2', 0, 0, { category: 'cafe' }),
        ];
        const result = separateConsecutiveMeals(spots);
        expect(result).toHaveLength(2);
    });
});

describe('nearestNeighborSort', () => {
    it('開始点に近いスポットから訪れる順に並ぶ', () => {
        const spots = [
            makeSpot('A', 35.0, 135.0),
            makeSpot('D', 35.05, 135.05),
            makeSpot('B', 35.01, 135.01),
            makeSpot('C', 35.02, 135.02),
        ];
        const result = nearestNeighborSort(spots);
        expect(result[0].id).toBe('A');
        expect(result[1].id).toBe('B');
        expect(result[2].id).toBe('C');
        expect(result[3].id).toBe('D');
    });
    it('1件以下はそのまま返す', () => {
        expect(nearestNeighborSort([])).toEqual([]);
        const single = [makeSpot('a', 0, 0)];
        expect(nearestNeighborSort(single)).toEqual(single);
    });
});

describe('twoOptImprove', () => {
    it('交差ルートを改善 (総距離が短くなる)', () => {
        // 意図的に交差した順序: A → C → B → D
        const spots = [
            makeSpot('A', 0, 0),
            makeSpot('C', 0, 0.02),
            makeSpot('B', 0, 0.01),
            makeSpot('D', 0, 0.03),
        ];
        const distM = (a: Spot, b: Spot) => {
            const dx = (a.lat - b.lat) * 111000;
            const dy = (a.lon - b.lon) * 111000;
            return Math.sqrt(dx * dx + dy * dy);
        };
        const totalDist = (route: Spot[]) =>
            route.slice(1).reduce((acc, s, i) => acc + distM(route[i], s), 0);
        const before = totalDist(spots);
        const after = totalDist(twoOptImprove(spots));
        expect(after).toBeLessThanOrEqual(before);
    });
    it('3件以下なら何もしない', () => {
        const spots = [makeSpot('a', 0, 0), makeSpot('b', 0, 0)];
        expect(twoOptImprove(spots)).toEqual(spots);
    });
});

describe('buildSmartItinerary (ABTR)', () => {
    it('単一スポットはそのまま返す', () => {
        const spots = [makeSpot('a', 35.0, 135.0)];
        expect(buildSmartItinerary(spots, { startTimeMin: 600, durationMin: 120 })).toEqual(spots);
    });

    it('十分な滞在時間があれば食事スポットを含める', () => {
        const spots: Spot[] = [
            makeSpot('Museum', 35.0, 135.0, { category: 'museum' }),
            makeSpot('Park', 35.001, 135.001, { category: 'park' }),
            makeSpot('Lunch', 35.0005, 135.0005, { category: 'restaurant', rating: 4.5, user_ratings_total: 500 }),
        ];
        const result = buildSmartItinerary(spots, { startTimeMin: 10 * 60, durationMin: 360 });
        // ランチが含まれる
        expect(result.some(s => s.id === 'Lunch')).toBe(true);
    });

    it('短時間なら食事スポットを除外する場合がある', () => {
        const spots: Spot[] = [
            makeSpot('Museum', 35.0, 135.0, { category: 'museum' }),
            makeSpot('Dinner', 35.001, 135.001, { category: 'restaurant', rating: 4.0, user_ratings_total: 100 }),
        ];
        // 60分の短時間 → ランチアンカー条件 (durationMin >= 120) を満たさない
        const result = buildSmartItinerary(spots, { startTimeMin: 14 * 60, durationMin: 60 });
        expect(result.some(s => s.id === 'Dinner')).toBe(false);
    });
});
