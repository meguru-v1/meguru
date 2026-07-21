import { describe, it, expect } from 'vitest';
import { fitToTimeBudget, computeTotalMinutes, getStayMinutes } from '../routeAlgorithms';
import { applyTravelTimes } from '../travelTime';
import type { Spot } from '../../types';

const spot = (id: string, lat: number, lon: number, stay: number, rating = 4.0): Spot => ({
    id, lat, lon, name: id, category: 'tourist_attraction', tags: {},
    stayTime: stay, rating, user_ratings_total: 100,
});

const walk = (spots: Spot[]) => applyTravelTimes(spots, 'walk');

describe('computeTotalMinutes', () => {
    it('滞在時間と移動時間を合算する', () => {
        const spots = walk([spot('a', 35.68, 139.76, 60), spot('b', 35.685, 139.765, 45)]);
        // 1件目は移動0、2件目に移動時間が乗る
        expect(computeTotalMinutes(spots)).toBe(105 + (spots[1].travel_time_minutes || 0));
    });

    it('空のコースは0分', () => {
        expect(computeTotalMinutes([])).toBe(0);
    });
});

describe('getStayMinutes', () => {
    it('stayTime を最優先で使う', () => {
        expect(getStayMinutes(spot('a', 35, 139, 90))).toBe(90);
    });

    it('未指定ならカテゴリ推定にフォールバックする', () => {
        const s: Spot = { id: 'x', lat: 35, lon: 139, name: 'x', category: 'tourist_attraction', tags: {} };
        expect(getStayMinutes(s)).toBeGreaterThan(0);
    });
});

describe('fitToTimeBudget', () => {
    it('時間枠に収まっていれば何も削らない', () => {
        const spots = [spot('a', 35.68, 139.76, 30), spot('b', 35.681, 139.761, 30)];
        expect(fitToTimeBudget(spots, 240, walk).length).toBe(2);
    });

    it('大幅に超過したら削って収める', () => {
        // 各120分×5件=600分。120分枠には到底収まらない
        const spots = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
            spot(id, 35.68 + i * 0.001, 139.76 + i * 0.001, 120)
        );
        const fitted = fitToTimeBudget(spots, 120, walk);
        expect(fitted.length).toBeLessThan(5);
        expect(computeTotalMinutes(fitted)).toBeLessThanOrEqual(120 * 1.15);
    });

    it('最低スポット数は下回らない', () => {
        const spots = ['a', 'b', 'c', 'd'].map((id, i) =>
            spot(id, 35.68 + i * 0.01, 139.76 + i * 0.01, 300)
        );
        const fitted = fitToTimeBudget(spots, 60, walk, 3);
        expect(fitted.length).toBe(3);
    });

    it('評価の低いスポットから落とす', () => {
        const spots = [
            spot('start', 35.680, 139.760, 100, 4.5),
            spot('低評価', 35.681, 139.761, 100, 2.0),
            spot('高評価', 35.682, 139.762, 100, 4.8),
        ];
        const fitted = fitToTimeBudget(spots, 200, walk, 1);
        expect(fitted.map(s => s.id)).not.toContain('低評価');
        expect(fitted.map(s => s.id)).toContain('高評価');
    });

    it('ルート検索の発着地点は削らない', () => {
        const spots: Spot[] = [
            { ...spot('出発', 35.680, 139.760, 10), category: 'starting_point' },
            spot('途中1', 35.681, 139.761, 300, 2.0),
            spot('途中2', 35.682, 139.762, 300, 2.1),
            { ...spot('目的地', 35.683, 139.763, 10), category: 'destination' },
        ];
        const fitted = fitToTimeBudget(spots, 60, walk, 1);
        const ids = fitted.map(s => s.id);
        expect(ids).toContain('出発');
        expect(ids).toContain('目的地');
    });

    it('先頭は常に残る', () => {
        const spots = ['a', 'b'].map((id, i) => spot(id, 35.68 + i * 0.01, 139.76 + i * 0.01, 500, 1.0));
        expect(fitToTimeBudget(spots, 30, walk, 1)[0].id).toBe('a');
    });
});
