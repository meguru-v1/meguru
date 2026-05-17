import { describe, it, expect } from 'vitest';
import { parseTimeToMinutes, checkOpenStatus } from '../openingHours';

describe('parseTimeToMinutes', () => {
    it('HH:MM 形式を分単位に変換', () => {
        expect(parseTimeToMinutes('09:30')).toBe(9 * 60 + 30);
        expect(parseTimeToMinutes('00:00')).toBe(0);
        expect(parseTimeToMinutes('23:59')).toBe(23 * 60 + 59);
    });
    it('全角コロンも受け付ける', () => {
        expect(parseTimeToMinutes('14：00')).toBe(14 * 60);
    });
    it('無効な文字列はデフォルト 10:00 を返す', () => {
        expect(parseTimeToMinutes('')).toBe(10 * 60);
        expect(parseTimeToMinutes('invalid')).toBe(10 * 60);
    });
});

describe('checkOpenStatus', () => {
    const tuesdayBusiness = [
        '日曜日: 定休日',
        '月曜日: 10:00～18:00',
        '火曜日: 10:00～18:00',
        '水曜日: 10:00～18:00',
        '木曜日: 10:00～18:00',
        '金曜日: 10:00～18:00',
        '土曜日: 10:00～20:00',
    ];

    it('descriptions が未定義なら unknown', () => {
        expect(checkOpenStatus(undefined, 2, 600, 720).status).toBe('unknown');
        expect(checkOpenStatus([], 2, 600, 720).status).toBe('unknown');
    });

    it('定休日を closed として検出', () => {
        const result = checkOpenStatus(tuesdayBusiness, 0, 600, 720); // 日曜
        expect(result.status).toBe('closed');
        expect(result.label).toBe('定休日');
    });

    it('営業時間内なら open', () => {
        const result = checkOpenStatus(tuesdayBusiness, 2, 11 * 60, 13 * 60);
        expect(result.status).toBe('open');
    });

    it('閉店後の訪問は closed', () => {
        const result = checkOpenStatus(tuesdayBusiness, 2, 19 * 60, 20 * 60);
        expect(result.status).toBe('closed');
    });

    it('24時間営業は open / 24時間ラベル', () => {
        const result = checkOpenStatus(['月曜日: 24時間営業'], 1, 22 * 60, 23 * 60);
        expect(result.status).toBe('open');
        expect(result.label).toBe('24時間');
    });

    it('翌日跨ぎ (18:00～02:00) を扱える', () => {
        const result = checkOpenStatus(['金曜日: 18:00～02:00'], 5, 23 * 60, 24 * 60 + 60);
        expect(result.status).toBe('open');
    });
});
