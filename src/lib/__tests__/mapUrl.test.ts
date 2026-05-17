import { describe, it, expect } from 'vitest';
import { getGoogleMapsUrl } from '../mapUrl';
import type { Course, Spot } from '../../types';

const makeSpot = (name: string): Spot => ({
    id: name, lat: 0, lon: 0, name, category: 'poi', tags: {},
});

const baseCourse: Course = {
    id: 'c1',
    title: 't',
    description: 'd',
    totalTime: 60,
    spots: [makeSpot('A'), makeSpot('B'), makeSpot('C')],
};

describe('getGoogleMapsUrl', () => {
    it('スポットなしなら # を返す', () => {
        expect(getGoogleMapsUrl({ ...baseCourse, spots: [] })).toBe('#');
    });

    it('origin と destination を URL に含める', () => {
        const url = getGoogleMapsUrl(baseCourse);
        expect(url).toMatch(/origin=A/);
        expect(url).toMatch(/destination=C/);
    });

    it('中間スポットは waypoints として含まれる', () => {
        const url = getGoogleMapsUrl(baseCourse);
        expect(url).toMatch(/waypoints=B/);
    });

    it('travelMode に応じた travelmode パラメータ', () => {
        expect(getGoogleMapsUrl({ ...baseCourse, travelMode: 'walk' })).toMatch(/travelmode=walking/);
        expect(getGoogleMapsUrl({ ...baseCourse, travelMode: 'bicycle' })).toMatch(/travelmode=bicycling/);
        expect(getGoogleMapsUrl({ ...baseCourse, travelMode: 'car' })).toMatch(/travelmode=driving/);
        expect(getGoogleMapsUrl({ ...baseCourse, travelMode: 'transit' })).toMatch(/travelmode=transit/);
    });

    it('スポット名の括弧以降を削除', () => {
        const c: Course = {
            ...baseCourse,
            spots: [makeSpot('名所(地名)'), makeSpot('別名（注記）')],
        };
        const url = getGoogleMapsUrl(c);
        // 括弧以降が除去されているため URL に "(" は含まれない
        expect(url).not.toMatch(/%28|%EF%BC%88/);
    });
});
