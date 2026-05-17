// Google Places の weekdayDescriptions は日本語: "月曜日: 09:00～17:00" 等
// dayOfWeek: 0=日, 1=月, ..., 6=土
export const WEEKDAY_NAMES = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

export interface OpenStatus {
    status: 'open' | 'closed' | 'unknown';
    label?: string; // ユーザー向け表示用 "09:00-17:00" "定休日" 等
}

// 時刻文字列 "HH:MM" → 分（深夜0時からの経過分）
export const parseTimeToMinutes = (timeStr: string): number => {
    const m = (timeStr || '').match(/(\d{1,2})[:：](\d{2})/);
    if (!m) return 10 * 60; // デフォルト 10:00
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

/**
 * 指定の曜日・時刻にスポットが営業中か判定する
 * @param weekdayDescriptions Google Places の weekdayDescriptions
 * @param dayOfWeek 0=日 ... 6=土
 * @param visitStartMin 訪問開始時刻（深夜0時からの経過分）
 * @param visitEndMin 訪問終了時刻（深夜0時からの経過分）
 */
export const checkOpenStatus = (
    weekdayDescriptions: string[] | undefined,
    dayOfWeek: number,
    visitStartMin: number,
    visitEndMin: number
): OpenStatus => {
    if (!weekdayDescriptions || weekdayDescriptions.length === 0) {
        return { status: 'unknown' };
    }
    const dayName = WEEKDAY_NAMES[dayOfWeek];
    const line = weekdayDescriptions.find(d => d.includes(dayName));
    if (!line) return { status: 'unknown' };

    // 定休日判定
    if (/定休日|休業|closed/i.test(line)) {
        return { status: 'closed', label: '定休日' };
    }
    // 24時間営業
    if (/24\s*時間|営業中：終日|open\s*24/i.test(line)) {
        return { status: 'open', label: '24時間' };
    }

    // 時刻範囲を抽出: "09:00～17:00" "9:00 ~ 17:00" "09:00-17:00" 等
    const ranges = [...line.matchAll(/(\d{1,2})[:：](\d{2})\s*[～~〜\-–—]\s*(\d{1,2})[:：](\d{2})/g)];
    if (ranges.length === 0) return { status: 'unknown' };

    for (const m of ranges) {
        const openMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        let closeMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
        // 翌日跨ぎ（例: 18:00～02:00）
        if (closeMin <= openMin) closeMin += 24 * 60;
        // 訪問時間が営業時間に完全に含まれていればOK
        if (visitStartMin >= openMin && visitEndMin <= closeMin) {
            return { status: 'open', label: `${m[1]}:${m[2]}-${m[3]}:${m[4]}` };
        }
    }
    // どの営業時間帯にも収まらない
    return { status: 'closed', label: ranges.map(m => `${m[1]}:${m[2]}-${m[3]}:${m[4]}`).join(',') };
};
