import Holidays from 'date-holidays';

const hd = new Holidays('JP');

export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';
export type Season = '春' | '夏' | '秋' | '冬';

export function getTimeOfDay(hour = new Date().getHours()): TimeOfDay {
    if (hour < 5) return 'night';
    if (hour < 8) return 'dawn';
    if (hour < 11) return 'morning';
    if (hour < 14) return 'noon';
    if (hour < 17) return 'afternoon';
    if (hour < 20) return 'evening';
    return 'night';
}

export function getSeason(month = new Date().getMonth() + 1): Season {
    if (month >= 3 && month <= 5) return '春';
    if (month >= 6 && month <= 8) return '夏';
    if (month >= 9 && month <= 11) return '秋';
    return '冬';
}

export function isHoliday(date = new Date()): string | false {
    const result = hd.isHoliday(date);
    if (!result) return false;
    return Array.isArray(result) ? result[0]?.name || false : (result as any)?.name || false;
}

export function getHeaderConfig(hour: number, weather: string): {
    greeting: string;
    gradient: string;
    emoji: string;
    subtext: string;
} {
    const tod = getTimeOfDay(hour);
    const season = getSeason();
    const holiday = isHoliday();

    const base = holiday
        ? { greeting: `${holiday}のよりみち`, emoji: '🎌' }
        : tod === 'dawn'  ? { greeting: 'おはようございます', emoji: '🌅' }
        : tod === 'morning' ? { greeting: `${season}の朝さんぽへ`, emoji: '🌸' }
        : tod === 'noon' ? { greeting: 'お昼のよりみち', emoji: '☀️' }
        : tod === 'afternoon' ? { greeting: '午後の旅はいかがですか', emoji: '🌿' }
        : tod === 'evening' ? { greeting: '夕暮れの散策', emoji: '🌇' }
        : { greeting: '夜の旅へ', emoji: '🌙' };

    const gradients: Record<TimeOfDay, string> = {
        dawn:      'linear-gradient(135deg, #1e3a5f 0%, #4a6fa5 50%, #f4a261 100%)',
        morning:   'linear-gradient(135deg, #74b9ff 0%, #a8edea 50%, #fed6e3 100%)',
        noon:      'linear-gradient(135deg, #f9f9f9 0%, #fffde7 50%, #fff3cd 100%)',
        afternoon: 'linear-gradient(135deg, #d4f1c0 0%, #a8d8ea 50%, #f9f7f7 100%)',
        evening:   'linear-gradient(135deg, #f2994a 0%, #eb5757 50%, #c471ed 100%)',
        night:     'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    };

    const weatherHint = weather && weather !== '不明'
        ? `${weather}の${season}、どこへ行こう？`
        : `今日も素敵な${season}の旅を`;

    return {
        greeting: base.greeting,
        emoji: base.emoji,
        gradient: gradients[tod],
        subtext: weatherHint,
    };
}

export function getSeasonalPromptContext(): string {
    const now = new Date();
    const month = now.getMonth() + 1;
    const hour = now.getHours();
    const season = getSeason(month);
    const tod = getTimeOfDay(hour);
    const holiday = isHoliday(now);

    const monthHints: Record<number, string> = {
        1: '新年・初詣・雪景色',
        2: '梅の花・節分・バレンタイン',
        3: '梅〜桜の開花期',
        4: '桜満開・春爛漫',
        5: '新緑・GW・こどもの日',
        6: '紫陽花・梅雨の晴れ間',
        7: '夏祭り・花火・ひまわり',
        8: '盂蘭盆・夏休み・涼を求めて',
        9: '秋の気配・ススキ・お月見',
        10: '紅葉の始まり・秋晴れ',
        11: '紅葉最盛期・七五三',
        12: '冬支度・クリスマス・年の瀬',
    };

    const todHints: Record<TimeOfDay, string> = {
        dawn:      '夜明け前後の神秘的な時間帯',
        morning:   '朝の清々しい時間帯（人が少なく穴場）',
        noon:      '昼間の活気ある時間帯',
        afternoon: '午後のゆったりした時間帯',
        evening:   '夕暮れ〜ライトアップが始まる時間帯',
        night:     '夜間（ライトアップ・夜景・夜の賑わい）',
    };

    return [
        `現在の季節: ${season}（${month}月）— ${monthHints[month] || ''}`,
        `現在の時間帯: ${todHints[tod]}`,
        holiday ? `本日は「${holiday}」です。祝日らしいコース・混雑を考慮した提案をしてください。` : '',
        `この季節・時間帯にしか体験できない特別なスポットや体験を優先的に提案してください。`,
        `一般的な観光地より、今の時期ならではの「旬」の場所・体験を積極的に組み込んでください。`,
    ].filter(Boolean).join('\n');
}
