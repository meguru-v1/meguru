import type { ExploreMode, WeatherTag } from '../types';

// ===== 天候プロンプト構築 =====
export const buildWeatherDirective = (
    weatherText: string,
    tag?: WeatherTag,
    tempC?: number | null
): string => {
    const tempLine = tempC !== null && tempC !== undefined ? `- 気温: ${tempC.toFixed(0)}°C\n` : '';
    let rule = '';
    switch (tag) {
        case 'rainy':
            rule = `【天候厳守ルール】雨天です。**屋外スポット（公園、展望台、屋外庭園、自然景勝地等）は原則として選ばないでください**。屋内スポット（美術館、博物館、水族館、カフェ、商業施設、寺院本堂、地下街など）を優先してください。やむを得ず屋外を含める場合は短時間で済むものに限定し、必ず屋内スポットと交互に配置してください。`;
            break;
        case 'snowy':
            rule = `【天候厳守ルール】降雪中です。**長時間の屋外滞在は避けてください**。屋内施設（美術館、温泉、カフェ、商業施設）を中心に、雪景色を楽しめる場所（寺社、庭園など）も短時間で組み込んでください。`;
            break;
        case 'hot':
            rule = `【天候厳守ルール】猛暑（30°C超）です。**炎天下の屋外を長時間歩かせない構成**にしてください。冷房のある屋内施設（美術館、カフェ、商業施設）を主軸にし、屋外は朝夕や日陰のある場所（神社の参道、緑陰の多い公園）に限定してください。`;
            break;
        case 'cold':
            rule = `【天候厳守ルール】寒波（5°C未満）です。**屋内・温泉・温かい食事を中心**に構成してください。屋外スポットは滞在時間を短くし、休憩用のカフェや屋内施設を必ず合間に配置してください。`;
            break;
        case 'normal':
        case 'unknown':
        default:
            rule = `天候は穏やかです。屋内外をバランス良く組み合わせてください。`;
    }
    return `\n**【現在の天候】**\n- 状況: ${weatherText}\n${tempLine}\n${rule}\n`;
};

// 【08】 3モード分離テンプレート
export const getExploreModeTemplate = (mode?: ExploreMode): string => {
    switch (mode) {
        case 'quick':
            return `
**【探索モード: クイック散策】**
- 短時間で楽しめる軽いコースを作成してください。
- スポット数は控えめに。移動距離を最小限にし、密度より「一つ一つをゆっくり味わう」ことを重視。
- 重たい食事よりカフェや軽食を優先してください。`;
        case 'fullday':
            return `
**【探索モード: 1日トラベル】**
- 朝から夕方まで充実した1日プランを作成してください。
- ランチは必ず1件含めること。午前・午後で異なるテーマの体験を織り交ぜてください。
- 休憩スポット（カフェ等）を午後に1件入れてバランスを取ってください。`;
        case 'multiday':
            return `
**【探索モード: 連泊プラン】**
- 1日あたり約13時間（780分）の活動時間を想定してください。
- 各日のスポットは同一エリア内（3km圏内）に集めてください。
- 各日に明確なテーマを設けてください。
- 日ごとにエリアを変え、効率的な移動を心がけてください。`;
        default:
            return '';
    }
};

export const getDiningRule = (durationMinutes: number) => {
    if (durationMinutes <= 90) {
        return `- **食事・カフェの制限**: 各コースにおいて **最大1件** まで。サクッと立ち寄れるカフェや軽食を含めてください。`;
    } else if (durationMinutes <= 180) {
        return `- **食事・カフェの制限**: 各コースにおいて **最大2件（必ず1件は含める）**。体験をメインに据えつつ、美味しい休憩スポットを確保。`;
    } else if (durationMinutes <= 300) {
        return `- **食事・カフェの制限**: 各コースにおいて **必ず1〜2件含める**。ランチとカフェなど、観光の合間に名物を楽しんで。`;
    } else {
        return `- **食事・カフェの制限**: 各コースにおいて **必ず2〜3件含める**。ランチやディナー、休憩カフェなど、長旅に見合った食事体験を。`;
    }
};

export const getRecommendedSpotCount = (durationMinutes: number) => {
    if (durationMinutes <= 120) return `**1〜2件**`;
    if (durationMinutes <= 240) return `**2〜3件**`;
    if (durationMinutes <= 360) return `**3〜4件**`;
    if (durationMinutes <= 480) return `**4〜5件**`;
    if (durationMinutes <= 600) return `**5〜6件**`;
    if (durationMinutes <= 720) return `**5〜7件**`;
    return `**6〜8件**`;
};

export const getMinSpotCount = (durationMinutes: number): number => {
    if (durationMinutes <= 120) return 1;
    if (durationMinutes <= 240) return 2;
    if (durationMinutes <= 360) return 3;
    if (durationMinutes <= 480) return 4;
    if (durationMinutes <= 600) return 5;
    if (durationMinutes <= 720) return 5;
    return 6;
};
