import { describe, it, expect } from 'vitest';
import { pickReplacementSpot, pickInsertionSpot } from '../spotPicker';
import type { Spot } from '../../types';

const makeSpot = (id: string, lat: number, lon: number, opts: Partial<Spot> = {}): Spot => ({
    id, lat, lon, name: id, category: 'museum', tags: { types: ['museum'] }, ...opts,
});

describe('pickReplacementSpot', () => {
    it('現在のコースに含まれるスポットは選ばない', () => {
        const target = makeSpot('A', 35.0, 135.0);
        const course = [target, makeSpot('B', 35.01, 135.01)];
        const candidates = [target, makeSpot('B', 35.01, 135.01), makeSpot('C', 35.02, 135.02)];
        const result = pickReplacementSpot(target, course, candidates);
        expect(result?.id).toBe('C');
    });

    it('候補なしなら null', () => {
        const target = makeSpot('A', 0, 0);
        expect(pickReplacementSpot(target, [target], [target])).toBeNull();
    });

    it('食事スポット差し替えは食事スポットを優先', () => {
        const target = makeSpot('R', 0, 0, { category: 'restaurant', tags: { types: ['restaurant'] } });
        const candidates = [
            makeSpot('M', 0.0001, 0.0001, { category: 'museum', tags: { types: ['museum'] } }),
            makeSpot('R2', 0.001, 0.001, { category: 'restaurant', tags: { types: ['restaurant'] } }),
        ];
        const result = pickReplacementSpot(target, [target], candidates);
        expect(result?.id).toBe('R2');
    });

    it('同種別がなければ別種別で代替', () => {
        const target = makeSpot('R', 0, 0, { category: 'restaurant', tags: { types: ['restaurant'] } });
        const candidates = [makeSpot('M', 0.001, 0.001, { category: 'museum', tags: { types: ['museum'] } })];
        const result = pickReplacementSpot(target, [target], candidates);
        expect(result?.id).toBe('M');
    });
});

describe('pickInsertionSpot', () => {
    it('使用済みは選ばず未使用のみから選ぶ', () => {
        const a = makeSpot('A', 35.0, 135.0);
        const b = makeSpot('B', 35.02, 135.02);
        const used = makeSpot('USED', 35.01, 135.01);
        const fresh = makeSpot('FRESH', 35.01, 135.01);
        const result = pickInsertionSpot(a, b, [a, b, used], [used, fresh]);
        expect(result?.id).toBe('FRESH');
    });

    it('次のスポットなしでも prev 周辺から選べる', () => {
        const a = makeSpot('A', 35.0, 135.0);
        const c = makeSpot('C', 35.001, 135.001);
        const result = pickInsertionSpot(a, null, [a], [c]);
        expect(result?.id).toBe('C');
    });

    it('候補がすべて使用済みなら null', () => {
        const a = makeSpot('A', 0, 0);
        const b = makeSpot('B', 0, 0.01);
        expect(pickInsertionSpot(a, b, [a, b], [a, b])).toBeNull();
    });

    it('観光4件 + 食事1件のとき食事は top3 から外れる', () => {
        const a = makeSpot('A', 0, 0);
        const b = makeSpot('B', 0, 0.001);
        // score: 観光は park rating 3.5 * 100 = 350 - dist。食事は 350 - 200 (ペナルティ) - dist。
        // 観光のスコアが食事より常に 200 高いので、観光が4件あれば食事は top3 圏外
        const candidates = [
            makeSpot('CAFE', 0, 0.0005, { category: 'cafe', tags: { types: ['cafe'] } }),
            makeSpot('P1', 0, 0.0005, { category: 'park', tags: { types: ['park'] } }),
            makeSpot('P2', 0, 0.0006, { category: 'park', tags: { types: ['park'] } }),
            makeSpot('P3', 0, 0.0007, { category: 'park', tags: { types: ['park'] } }),
            makeSpot('P4', 0, 0.0008, { category: 'park', tags: { types: ['park'] } }),
        ];
        for (let i = 0; i < 20; i++) {
            const r = pickInsertionSpot(a, b, [a, b], candidates);
            expect(r?.id).not.toBe('CAFE');
        }
    });
});
