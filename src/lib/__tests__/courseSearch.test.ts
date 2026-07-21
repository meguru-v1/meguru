import { describe, it, expect } from 'vitest';
import { approxDistanceM, assertFeasible } from '../courseSearch';

// 東京駅 / 東京タワー / 大阪駅
const TOKYO_STATION = { lat: 35.6812, lon: 139.7671 };
const TOKYO_TOWER = { lat: 35.6586, lon: 139.7454 };
const OSAKA_STATION = { lat: 34.7025, lon: 135.4959 };

describe('approxDistanceM', () => {
    it('同じ地点なら0', () => {
        expect(approxDistanceM(TOKYO_STATION, TOKYO_STATION)).toBe(0);
    });

    it('東京駅〜東京タワーは実測3.3km前後', () => {
        const d = approxDistanceM(TOKYO_STATION, TOKYO_TOWER);
        expect(d).toBeGreaterThan(3000);
        expect(d).toBeLessThan(3800);
    });

    it('東京〜大阪は約400km', () => {
        const d = approxDistanceM(TOKYO_STATION, OSAKA_STATION);
        expect(d).toBeGreaterThan(380_000);
        expect(d).toBeLessThan(420_000);
    });

    it('向きを入れ替えても同じ距離', () => {
        expect(approxDistanceM(TOKYO_STATION, OSAKA_STATION))
            .toBeCloseTo(approxDistanceM(OSAKA_STATION, TOKYO_STATION), 5);
    });
});

describe('assertFeasible', () => {
    it('徒歩3km・120分は通る', () => {
        expect(() => assertFeasible(3000, 120, 'walk')).not.toThrow();
    });

    it('徒歩50km・60分は弾く', () => {
        expect(() => assertFeasible(50_000, 60, 'walk')).toThrow(/徒歩では無理な距離/);
    });

    it('同じ条件でも自転車なら許容範囲が広がる', () => {
        // 15km / 30分 = 30km/h → 徒歩(上限20)は不可、自転車(上限40)は可
        expect(() => assertFeasible(15_000, 30, 'walk')).toThrow();
        expect(() => assertFeasible(15_000, 30, 'bicycle')).not.toThrow();
    });

    it('車なら東京〜大阪は1日あれば通る', () => {
        const d = approxDistanceM(TOKYO_STATION, OSAKA_STATION);
        expect(() => assertFeasible(d, 540, 'car')).not.toThrow();
    });

    it('エラーメッセージに距離と必要速度が入る', () => {
        expect(() => assertFeasible(50_000, 60, 'walk')).toThrow(/50\.0km/);
        expect(() => assertFeasible(50_000, 60, 'walk')).toThrow(/50km\/h/);
    });
});
