import { describe, it, expect } from 'vitest';
import { safeImageUrl, safePhotoRef } from '../safeUrl';
import { sanitizeSharedCourse } from '../shareLink';

describe('safeImageUrl', () => {
    it('allowlistホストのhttpsのみ許可する', () => {
        expect(safeImageUrl('https://places.googleapis.com/v1/places/x/photos/y/media'))
            .toBe('https://places.googleapis.com/v1/places/x/photos/y/media');
    });

    it('未知のホストを拒否する', () => {
        expect(safeImageUrl('https://evil.example.com/beacon.png')).toBeUndefined();
    });

    it('javascript: / data: / http: を拒否する', () => {
        expect(safeImageUrl('javascript:alert(1)')).toBeUndefined();
        expect(safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeUndefined();
        expect(safeImageUrl('http://places.googleapis.com/x')).toBeUndefined();
    });

    it('文字列以外を拒否する', () => {
        expect(safeImageUrl(null)).toBeUndefined();
        expect(safeImageUrl({ toString: () => 'https://places.googleapis.com/x' })).toBeUndefined();
    });
});

describe('safePhotoRef', () => {
    it('正常な photo reference を通す', () => {
        expect(safePhotoRef('places/ChIJabc/photos/AelY_xyz')).toBe('places/ChIJabc/photos/AelY_xyz');
    });

    it('クエリ・パストラバーサル・先頭スラッシュを拒否する', () => {
        expect(safePhotoRef('places/x/photos/y?key=leak')).toBeUndefined();
        expect(safePhotoRef('../../../etc/passwd')).toBeUndefined();
        expect(safePhotoRef('/absolute/path')).toBeUndefined();
        expect(safePhotoRef('places/x@evil.com/photos/y')).toBeUndefined();
    });
});

describe('sanitizeSharedCourse', () => {
    const validSpot = { lat: 35.0, lon: 139.0, name: '清水寺', category: '寺社仏閣', tags: {} };

    it('正常なコースを復元する', () => {
        const c = sanitizeSharedCourse({
            id: 'c1', title: 'テスト', description: 'desc', totalTime: 120,
            spots: [validSpot], travelMode: 'walk',
        });
        expect(c?.spots).toHaveLength(1);
        expect(c?.travelMode).toBe('walk');
    });

    it('悪意ある画像URLを除去する', () => {
        const c = sanitizeSharedCourse({
            spots: [{ ...validSpot, tags: { photo: 'https://evil.example.com/track.gif' } }],
        });
        expect(c?.spots[0].tags.photo).toBeUndefined();
    });

    it('座標が範囲外・非数値のスポットを落とす', () => {
        expect(sanitizeSharedCourse({ spots: [{ ...validSpot, lat: 999 }] })).toBeNull();
        expect(sanitizeSharedCourse({ spots: [{ ...validSpot, lat: '35' }] })).toBeNull();
    });

    it('未知のtravelModeを無視する', () => {
        const c = sanitizeSharedCourse({ spots: [validSpot], travelMode: 'teleport' });
        expect(c?.travelMode).toBeUndefined();
    });

    it('想定外の入力でnullを返す', () => {
        expect(sanitizeSharedCourse(null)).toBeNull();
        expect(sanitizeSharedCourse('string')).toBeNull();
        expect(sanitizeSharedCourse({ spots: [] })).toBeNull();
        expect(sanitizeSharedCourse({ spots: 'not-array' })).toBeNull();
    });

    it('スポット数を上限で打ち切る', () => {
        const c = sanitizeSharedCourse({ spots: Array(200).fill(validSpot) });
        expect(c?.spots.length).toBeLessThanOrEqual(60);
    });
});
