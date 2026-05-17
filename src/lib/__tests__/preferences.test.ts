import { describe, it, expect } from 'vitest';
import { buildPreferenceContext } from '../preferences';
import type { Course, Spot } from '../../types';

const makeSpot = (types: string[] = [], opts: Partial<Spot> = {}): Spot => ({
    id: Math.random().toString(36).slice(2),
    lat: 0, lon: 0, name: 'X', category: 'poi',
    tags: { types },
    ...opts,
});

const makeCourse = (spots: Spot[], theme?: string): Course => ({
    id: Math.random().toString(36).slice(2),
    title: 't',
    description: 'd',
    totalTime: 60,
    spots,
    theme,
});

describe('buildPreferenceContext', () => {
    it('空配列なら空文字を返す', () => {
        expect(buildPreferenceContext([])).toBe('');
    });

    it('tags.types の頻度を集計してプロンプトに含める (旧バグ: spot.types 参照を修正)', () => {
        const courses = [
            makeCourse([makeSpot(['museum']), makeSpot(['cafe'])]),
            makeCourse([makeSpot(['museum']), makeSpot(['art_gallery'])]),
        ];
        const result = buildPreferenceContext(courses);
        expect(result).toMatch(/美術館/);
    });

    it('頻度2以上は ×N 表記', () => {
        const courses = [
            makeCourse([makeSpot(['museum'])]),
            makeCourse([makeSpot(['museum'])]),
            makeCourse([makeSpot(['museum'])]),
        ];
        const result = buildPreferenceContext(courses);
        expect(result).toMatch(/美術館×3/);
    });

    it('theme の "<emoji> XXX:" 部分を抽出して傾向化', () => {
        const courses = [
            makeCourse([makeSpot(['museum'])], '🎨 Art & Soul: アートとクリエイティブ'),
            makeCourse([makeSpot(['museum'])], '🎨 Art & Soul: アートとクリエイティブ'),
        ];
        const result = buildPreferenceContext(courses);
        expect(result).toMatch(/好むテーマ/);
        expect(result).toMatch(/Art & Soul/);
    });

    it('cultural_property を集計', () => {
        const courses = [
            makeCourse([makeSpot(['museum'], { cultural_property: '国宝' })]),
            makeCourse([makeSpot(['shrine'], { cultural_property: '世界遺産' })]),
        ];
        const result = buildPreferenceContext(courses);
        expect(result).toMatch(/文化財/);
    });

    it('集計対象がなければ空文字', () => {
        const courses = [makeCourse([])];
        expect(buildPreferenceContext(courses)).toBe('');
    });

    it('未知の type もフォールバックで表示', () => {
        const courses = [makeCourse([makeSpot(['unknown_xyz', 'unknown_xyz'])])];
        const result = buildPreferenceContext(courses);
        expect(result).toMatch(/unknown_xyz/);
    });
});
