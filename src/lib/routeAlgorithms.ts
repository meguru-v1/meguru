import type { Spot } from '../types';

// ===== ジャンル別滞在時間推定 =====
export const getStayTimeByType = (category: string): number => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('museum') || cat.includes('art_gallery') || cat.includes('aquarium') || cat.includes('zoo')) return 90;
    if (cat.includes('park') || cat.includes('garden') || cat.includes('botanical')) return 60;
    if (cat.includes('temple') || cat.includes('shrine') || cat.includes('church')) return 45;
    if (cat.includes('castle') || cat.includes('palace') || cat.includes('monument')) return 60;
    if (cat.includes('cafe') || cat.includes('bakery') || cat.includes('ice_cream')) return 30;
    if (cat.includes('restaurant') || cat.includes('meal_delivery') || cat.includes('bar')) return 60;
    if (cat.includes('store') || cat.includes('shop') || cat.includes('market') || cat.includes('mall')) return 40;
    if (cat.includes('theater') || cat.includes('stadium') || cat.includes('cinema')) return 120;
    if (cat.includes('spa') || cat.includes('onsen') || cat.includes('hot_spring')) return 90;
    if (cat.includes('beach') || cat.includes('waterfall') || cat.includes('scenic')) return 45;
    return 40; // デフォルト
};

// 飲食スポット判定
export const isDining = (spot: Spot): boolean => {
    const cat = (spot.category || '').toLowerCase();
    const types = ((spot.tags?.types as string[] | undefined) || []).join(' ').toLowerCase();
    return ['restaurant', 'cafe', 'bar', 'bakery', 'food', 'meal', 'coffee', 'bistro', 'izakaya', 'ramen', 'sushi'].some(
        t => cat.includes(t) || types.includes(t)
    );
};

// カフェ専門判定（レストラン併設は除外）
export const isCafeOnly = (s: Spot): boolean => {
    const text = `${s.category || ''} ${((s.tags?.types as string[] | undefined) || []).join(' ')}`.toLowerCase();
    return /cafe|bakery|coffee|tea_house/.test(text) && !/restaurant/.test(text);
};

// 評価×レビュー数による品質スコア
export const ratingScore = (s: Spot): number => (s.rating ?? 3.5) * Math.log(Math.max(s.user_ratings_total ?? 1, 1));

// 連続食事スポット分離（最大10回試行）
export const separateConsecutiveMeals = (spots: Spot[]): Spot[] => {
    const result = [...spots];
    for (let iter = 0; iter < 10; iter++) {
        let swapped = false;
        for (let i = 0; i < result.length - 1; i++) {
            if (isDining(result[i]) && isDining(result[i + 1])) {
                const swapIdx = result.findIndex((s, j) => j > i + 1 && !isDining(s));
                if (swapIdx !== -1) {
                    [result[i + 1], result[swapIdx]] = [result[swapIdx], result[i + 1]];
                    swapped = true;
                    break;
                }
            }
        }
        if (!swapped) break;
    }
    return result;
};

// 最近傍法ソート（カットオフなし）
export const nearestNeighborSort = (spots: Spot[]): Spot[] => {
    if (spots.length <= 1) return spots;
    const sorted: Spot[] = [spots[0]];
    const remaining = spots.slice(1);
    while (remaining.length > 0) {
        const current = sorted[sorted.length - 1];
        let nearestIdx = 0, nearestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const dx = (remaining[i].lat - current.lat) * 111000;
            const dy = (remaining[i].lon - current.lon) * 111000 * Math.cos(current.lat * Math.PI / 180);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
        }
        sorted.push(remaining.splice(nearestIdx, 1)[0]);
    }
    return sorted;
};

// 2-opt局所最適化（交差を解消して総移動距離を短縮）
export const twoOptImprove = (spots: Spot[], maxIter = 50): Spot[] => {
    if (spots.length < 4) return spots;
    const route = [...spots];
    const distM = (a: Spot, b: Spot) => {
        const dx = (a.lat - b.lat) * 111000;
        const dy = (a.lon - b.lon) * 111000 * Math.cos(a.lat * Math.PI / 180);
        return Math.sqrt(dx * dx + dy * dy);
    };
    let improved = true, iter = 0;
    while (improved && iter++ < maxIter) {
        improved = false;
        for (let i = 0; i < route.length - 2; i++) {
            for (let j = i + 2; j < route.length - 1; j++) {
                const before = distM(route[i], route[i + 1]) + distM(route[j], route[j + 1]);
                const after = distM(route[i], route[j]) + distM(route[i + 1], route[j + 1]);
                if (after + 0.1 < before) {
                    const reversed = route.slice(i + 1, j + 1).reverse();
                    route.splice(i + 1, j - i, ...reversed);
                    improved = true;
                }
            }
        }
    }
    return route;
};

/**
 * ABTR: Anchor-Based Time Routing
 * 食事を時刻アンカーで固定し、観光スポットを空間最適化で配置する。
 * - ランチ: 12:00〜13:30
 * - カフェ: ランチ+3h かつ 15:00以降
 * - ディナー: 18:30以降
 * 不要な食事スポットは自動でドロップする。
 */
export const buildSmartItinerary = (
    spots: Spot[],
    opts: { startTimeMin: number; durationMin: number }
): Spot[] => {
    if (spots.length <= 1) return spots;
    const { startTimeMin, durationMin } = opts;
    const endTimeMin = startTimeMin + durationMin;

    // 1. 食事/観光に分類
    const dining = spots.filter(isDining);
    const sites = spots.filter(s => !isDining(s));

    // 2. 時刻アンカー設定（クロックタイム基準）
    const lunchTarget =
        startTimeMin <= 13.5 * 60 && endTimeMin >= 12 * 60 && durationMin >= 120
            ? Math.max(12 * 60, Math.min(13.5 * 60, startTimeMin + Math.max(120, Math.round(durationMin * 0.3))))
            : null;

    const dinnerTarget =
        durationMin >= 420 && endTimeMin >= 19 * 60
            ? Math.max(18.5 * 60, endTimeMin - 120)
            : null;

    let cafeTarget: number | null = null;
    if (durationMin >= 180) {
        const earliest = Math.max(15 * 60, (lunchTarget ?? startTimeMin) + 150);
        const latest = (dinnerTarget ?? endTimeMin) - 40;
        if (earliest <= latest && earliest > startTimeMin + 60) cafeTarget = earliest;
    }

    // 3. 食事候補を品質スコアでソート → 役割別に最適なものをピック
    const sortedDining = [...dining].sort((a, b) => ratingScore(b) - ratingScore(a));
    const takeBest = (arr: Spot[], pref?: (s: Spot) => boolean): Spot | null => {
        if (arr.length === 0) return null;
        if (pref) {
            const idx = arr.findIndex(pref);
            if (idx !== -1) return arr.splice(idx, 1)[0];
        }
        return arr.splice(0, 1)[0];
    };
    const lunch = lunchTarget !== null ? takeBest(sortedDining, s => !isCafeOnly(s)) : null;
    const dinner = dinnerTarget !== null ? takeBest(sortedDining, s => !isCafeOnly(s)) : null;
    const cafe = cafeTarget !== null ? takeBest(sortedDining, isCafeOnly) : null;
    // 残りの食事スポットは破棄（食べ過ぎ防止）

    // 4. 観光スポットを最近傍 + 2-opt で空間最適化
    const orderedSites = twoOptImprove(nearestNeighborSort(sites));

    // 5. 食事を目標時刻に挿入（累積時間ベース）
    const AVG_TRAVEL_MIN = 15;
    const insertAtTime = (list: Spot[], meal: Spot, targetTime: number): Spot[] => {
        let cur = startTimeMin;
        let insertIdx = list.length;
        for (let i = 0; i < list.length; i++) {
            const arrival = cur + AVG_TRAVEL_MIN;
            if (arrival >= targetTime) { insertIdx = i; break; }
            cur = arrival + (list[i].stayTime || getStayTimeByType(list[i].category));
        }
        return [...list.slice(0, insertIdx), meal, ...list.slice(insertIdx)];
    };

    let result = orderedSites;
    if (lunch && lunchTarget !== null) result = insertAtTime(result, lunch, lunchTarget);
    if (cafe && cafeTarget !== null) result = insertAtTime(result, cafe, cafeTarget);
    if (dinner && dinnerTarget !== null) result = insertAtTime(result, dinner, dinnerTarget);

    // 6. 連続食事の最終ガード
    return separateConsecutiveMeals(result);
};
