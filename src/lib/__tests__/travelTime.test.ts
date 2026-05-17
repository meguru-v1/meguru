import { describe, it, expect } from 'vitest';
import { applyTravelTimes, getSpeed } from '../travelTime';
import type { Spot } from '../../types';

const makeSpot = (id: string, lat: number, lon: number): Spot => ({
    id, lat, lon, name: id, category: 'point_of_interest', tags: {},
});

describe('getSpeed', () => {
    it('徒歩は 80m/min', () => {
        expect(getSpeed('walk')).toBe(80);
    });
    it('自転車は 250m/min', () => {
        expect(getSpeed('bicycle')).toBe(250);
    });
    it('車・公共交通は 600m/min', () => {
        expect(getSpeed('car')).toBe(600);
        expect(getSpeed('transit')).toBe(600);
    });
    it('未指定なら徒歩扱い', () => {
        expect(getSpeed()).toBe(80);
    });
});

describe('applyTravelTimes', () => {
    it('1件目の travel_time_minutes は必ず 0', () => {
        const spots = [makeSpot('a', 35.0, 135.0), makeSpot('b', 35.001, 135.001)];
        const result = applyTravelTimes(spots, 'walk');
        expect(result[0].travel_time_minutes).toBe(0);
    });

    it('最低でも 1 分が保証される (Math.max ガード)', () => {
        const spots = [
            makeSpot('a', 35.0, 135.0),
            makeSpot('b', 35.00001, 135.00001), // 数mしか離れていない
        ];
        const result = applyTravelTimes(spots, 'walk');
        expect(result[1].travel_time_minutes).toBeGreaterThanOrEqual(1);
    });

    it('徒歩より自転車の方が短い時間になる', () => {
        const spots = [makeSpot('a', 35.0, 135.0), makeSpot('b', 35.01, 135.01)];
        const walk = applyTravelTimes(spots, 'walk');
        const bike = applyTravelTimes(spots, 'bicycle');
        expect(bike[1].travel_time_minutes!).toBeLessThan(walk[1].travel_time_minutes!);
    });

    it('元の Spot プロパティを保持する', () => {
        const spots: Spot[] = [
            { ...makeSpot('a', 35.0, 135.0), rating: 4.5 },
            { ...makeSpot('b', 35.01, 135.01), rating: 3.8 },
        ];
        const result = applyTravelTimes(spots, 'walk');
        expect(result[0].rating).toBe(4.5);
        expect(result[1].rating).toBe(3.8);
    });

    it('空配列なら空配列を返す', () => {
        expect(applyTravelTimes([], 'walk')).toEqual([]);
    });
});
