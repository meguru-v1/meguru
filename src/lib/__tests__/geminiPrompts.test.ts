import { describe, it, expect } from 'vitest';
import {
    buildWeatherDirective,
    getExploreModeTemplate,
    getDiningRule,
    getRecommendedSpotCount,
    getMinSpotCount,
} from '../geminiPrompts';

describe('buildWeatherDirective', () => {
    it('雨天は屋内優先の指示を含む', () => {
        const r = buildWeatherDirective('雨', 'rainy', 18);
        expect(r).toMatch(/屋外スポット/);
        expect(r).toMatch(/屋内/);
    });
    it('猛暑は冷房屋内中心の指示', () => {
        const r = buildWeatherDirective('晴れ', 'hot', 33);
        expect(r).toMatch(/猛暑/);
    });
    it('気温が null なら気温行を省略', () => {
        const r = buildWeatherDirective('晴れ', 'normal', null);
        expect(r).not.toMatch(/気温:/);
    });
    it('気温があれば°C 表示で含める', () => {
        const r = buildWeatherDirective('晴れ', 'normal', 22);
        expect(r).toMatch(/22°C/);
    });
});

describe('getExploreModeTemplate', () => {
    it('quick はクイック散策の指示', () => {
        expect(getExploreModeTemplate('quick')).toMatch(/クイック散策/);
    });
    it('fullday はランチ必須の指示', () => {
        expect(getExploreModeTemplate('fullday')).toMatch(/ランチ/);
    });
    it('multiday は連泊プランの指示', () => {
        expect(getExploreModeTemplate('multiday')).toMatch(/連泊/);
    });
    it('未指定なら空文字', () => {
        expect(getExploreModeTemplate()).toBe('');
    });
});

describe('getDiningRule', () => {
    it('時間が長いほど食事件数が多い', () => {
        expect(getDiningRule(60)).toMatch(/最大1件/);
        expect(getDiningRule(180)).toMatch(/最大2件/);
        expect(getDiningRule(300)).toMatch(/必ず1〜2件/);
        expect(getDiningRule(600)).toMatch(/必ず2〜3件/);
    });
});

describe('getRecommendedSpotCount', () => {
    it('時間に応じてスポット数推奨が増える', () => {
        expect(getRecommendedSpotCount(120)).toMatch(/1〜2件/);
        expect(getRecommendedSpotCount(480)).toMatch(/4〜5件/);
        expect(getRecommendedSpotCount(1000)).toMatch(/6〜8件/);
    });
});

describe('getMinSpotCount', () => {
    it('120分は最低1件', () => expect(getMinSpotCount(120)).toBe(1));
    it('540分は最低5件', () => expect(getMinSpotCount(540)).toBe(5));
    it('1000分は最低6件', () => expect(getMinSpotCount(1000)).toBe(6));
});
