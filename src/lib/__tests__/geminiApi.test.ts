import { describe, it, expect } from 'vitest';
import { selectModel, stripThinkingBlock, extractJsonString, isTransientError } from '../geminiApi';

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

describe('isTransientError', () => {
    const err = (message: string, status?: number) =>
        Object.assign(new Error(message), status !== undefined ? { status } : {});

    it('503（過負荷）は再試行対象。計測で全体の11%を占めていた', () => {
        expect(isTransientError(err('AI service temporarily unavailable', 503))).toBe(true);
    });

    it('429（レート制限）は再試行対象', () => {
        expect(isTransientError(err('rate limited', 429))).toBe(true);
        expect(isTransientError(err('RESOURCE_EXHAUSTED'))).toBe(true);
    });

    it('500系はすべて再試行対象', () => {
        for (const status of [500, 502, 503, 504]) {
            expect(isTransientError(err('server error', status))).toBe(true);
        }
    });

    it('status がなくてもメッセージから判定できる', () => {
        expect(isTransientError(err('Request failed: 503'))).toBe(true);
        expect(isTransientError(err('UNAVAILABLE'))).toBe(true);
    });

    it('400系のクライアントエラーは再試行しない', () => {
        expect(isTransientError(err('Invalid request', 400))).toBe(false);
        expect(isTransientError(err('Forbidden', 403))).toBe(false);
        expect(isTransientError(err('Not found', 404))).toBe(false);
    });

    it('エラー以外の値を渡しても落ちない', () => {
        expect(isTransientError(null)).toBe(false);
        expect(isTransientError(undefined)).toBe(false);
        expect(isTransientError('文字列')).toBe(false);
    });
});
