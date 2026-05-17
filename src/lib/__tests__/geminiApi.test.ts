import { describe, it, expect } from 'vitest';
import { selectModel, stripThinkingBlock, extractJsonString } from '../geminiApi';

describe('selectModel', () => {
    it('3時間以下なら flash-lite を選択', () => {
        expect(selectModel(60)).toBe('gemini-2.5-flash-lite');
        expect(selectModel(180)).toBe('gemini-2.5-flash-lite');
    });
    it('3時間超なら flash を選択', () => {
        expect(selectModel(181)).toBe('gemini-2.5-flash');
        expect(selectModel(720)).toBe('gemini-2.5-flash');
    });
});

describe('stripThinkingBlock', () => {
    it('<thinking>ブロックを除去', () => {
        const input = '<thinking>考え中...</thinking>\n本文';
        expect(stripThinkingBlock(input)).toBe('本文');
    });
    it('複数の<thinking>も全て除去', () => {
        const input = '<thinking>a</thinking>X<thinking>b</thinking>Y';
        expect(stripThinkingBlock(input)).toBe('XY');
    });
    it('<thinking>がなければそのまま', () => {
        expect(stripThinkingBlock('plain text')).toBe('plain text');
    });
    it('前後の空白をトリム', () => {
        expect(stripThinkingBlock('  hello  ')).toBe('hello');
    });
});

describe('extractJsonString', () => {
    it('```json ... ``` のコードフェンスから抽出', () => {
        const input = '前置き\n```json\n{"a":1}\n```\n後置き';
        expect(extractJsonString(input)).toBe('{"a":1}');
    });
    it('``` 単体のコードフェンスからも抽出', () => {
        const input = '```\n{"b":2}\n```';
        expect(extractJsonString(input)).toBe('{"b":2}');
    });
    it('フェンスなしの素の JSON も抽出', () => {
        const input = 'これは説明 {"c": 3} です';
        expect(extractJsonString(input)).toBe('{"c": 3}');
    });
    it('trailing comma を除去', () => {
        const input = '{"a": [1, 2,]}';
        expect(extractJsonString(input)).toBe('{"a": [1, 2]}');
    });
    it('<thinking>ブロックを除去した上で抽出', () => {
        const input = '<thinking>考え中</thinking>\n```json\n{"x":1}\n```';
        expect(extractJsonString(input)).toBe('{"x":1}');
    });
});
