import type { Course } from '../types';

// Google Places の type 値 → 日本語ラベル
const TYPE_LABELS: Record<string, string> = {
    museum: '美術館',
    art_gallery: 'ギャラリー',
    aquarium: '水族館',
    zoo: '動物園',
    park: '公園',
    garden: '庭園',
    cafe: 'カフェ',
    bakery: 'ベーカリー',
    restaurant: 'レストラン',
    bar: 'バー',
    temple: '寺院',
    shrine: '神社',
    church: '教会',
    castle: '城',
    monument: '記念建造物',
    shopping_mall: 'モール',
    store: 'ショップ',
    market: '市場',
    book_store: '書店',
    spa: 'スパ',
    onsen: '温泉',
    beach: 'ビーチ',
    waterfall: '滝',
    scenic_lookout: '展望',
    tourist_attraction: '観光名所',
    natural_feature: '自然',
};

const labelOf = (t: string): string => TYPE_LABELS[t] ?? t;

const topEntries = (m: Map<string, number>, n: number): string[] =>
    Array.from(m.entries())
        .filter(([key]) => key && key.length > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, count]) => count > 1 ? `${labelOf(key)}×${count}` : labelOf(key));

/**
 * お気に入りコースから「好みの傾向」を抽出し、AI プロンプトに注入する文字列を生成する。
 * - スポット種別 (tags.types) の頻度
 * - コーステーマの頻度
 * - 文化財タイプの頻度
 * を集計し、最近のお気に入りほど重み付けする。
 */
export function buildPreferenceContext(favorites: Course[]): string {
    if (!favorites || favorites.length === 0) return '';

    const recent = favorites.slice(0, 10); // 直近10件を分析対象に

    const typeCounts = new Map<string, number>();
    const themeCounts = new Map<string, number>();
    const culturalPropertyCounts = new Map<string, number>();

    recent.forEach(course => {
        if (course.theme) {
            const themeKey = course.theme.split(':')[0].trim();
            if (themeKey) themeCounts.set(themeKey, (themeCounts.get(themeKey) ?? 0) + 1);
        }
        course.spots.forEach(spot => {
            const types = (spot.tags?.types as string[] | undefined) || [];
            types.forEach(t => {
                if (typeof t === 'string' && t) {
                    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
                }
            });
            if (spot.cultural_property) {
                culturalPropertyCounts.set(spot.cultural_property,
                    (culturalPropertyCounts.get(spot.cultural_property) ?? 0) + 1);
            }
        });
    });

    const topTypes = topEntries(typeCounts, 8);
    const topThemes = topEntries(themeCounts, 3);
    const topCultural = topEntries(culturalPropertyCounts, 2);

    if (topTypes.length === 0 && topThemes.length === 0 && topCultural.length === 0) return '';

    const lines: string[] = [`【ユーザーの好み傾向（最近のお気に入り${recent.length}件から解析）】`];
    if (topTypes.length > 0) lines.push(`- 好むスポット種別: ${topTypes.join(', ')}`);
    if (topThemes.length > 0) lines.push(`- 好むテーマ: ${topThemes.join(', ')}`);
    if (topCultural.length > 0) lines.push(`- 好む文化財タイプ: ${topCultural.join(', ')}`);
    lines.push('この傾向に寄せつつ、マンネリ防止のため新しい発見も1〜2件は織り交ぜてください。');

    return lines.join('\n');
}
