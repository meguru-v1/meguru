import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Spot, Course } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(API_KEY);

// 共通モデルリスト (次世代モデルに統一 / Grounding対応の2.5系のみ)
const MODELS = [
    "gemini-2.5-pro",           // 最上位
    "gemini-2.5-flash",         // 標準
    "gemini-2.5-flash-lite"     // 軽量
];

// 429エラー（Quota）発生時の待機用
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// モデル別最終リクエスト時刻管理
const lastRequestTimes: Record<string, number> = {
    "gemini-2.5-flash-lite": 0,
    "gemini-2.5-flash": 0,
    "gemini-2.5-pro": 0
};

// レートリミット待機処理
const waitRateLimit = async (modelName: string, intervalMs: number) => {
    const now = Date.now();
    const elapsed = now - (lastRequestTimes[modelName] || 0);
    if (elapsed < intervalMs) {
        const wait = intervalMs - elapsed;
        console.log(`[RateLimit] Waiting for ${wait}ms for ${modelName}`);
        await sleep(wait);
    }
    lastRequestTimes[modelName] = Date.now();
};

const getDiningRule = (durationMinutes: number) => {
    if (durationMinutes <= 150) {
        // 2.5時間以下: 食事またはカフェのどちらか「1件のみ」
        return `- **食事・カフェの件数**: 合計で **最大1件** まで (厳守)。どちらか1つに絞ること。`;
    } else if (durationMinutes <= 300) {
        // 5時間以下: 合計で最大2件まで
        return `- **食事・カフェ의件数**: 合計で **最大2件** まで。`;
    } else if (durationMinutes <= 450) {
        // 7.5時間以下: 合計で最大3件まで
        return `- **食事・カフェの件数**: 合計で **最大3件** まで。`;
    } else {
        return `- **食事・カフェの件数**: 合計で **最大4件** まで。`;
    }
};

export const generateSmartCourses = async (
    candidates: Spot[],
    center: { lat: number; lon: number },
    durationMinutes: number,
    timeContext: string = "不明",
    weatherContext: string = "不明",
    mood: string = "不明",
    budget: string = "不明",
    groupSize: string = "不明"
): Promise<Course[]> => {
    const candidateList = candidates.map((s, i) => {
        const details = [
            s.category,
            s.rating ? `★${s.rating}` : null,
            s.price_level ? `Price:${'¥'.repeat(s.price_level)}` : null,
            s.editorial_summary ? `Summary:${s.editorial_summary}` : null,
            s.reviews ? `Top Review: "${s.reviews[0]}"` : null,
            s.opening_hours ? `Hours: ${s.opening_hours.join(', ')}` : null,
            `Est.Stay:${s.estimatedStayTime || 30}min`
        ].filter(Boolean).join(', ');
        return `${i}: ${s.name} (${details})`;
    }).join('\n');

    const diningRule = getDiningRule(durationMinutes);

    const allThemes = [
        "🕰️ Time Travel: 時代を感じる歴史旅",
        "🌿 Nature's Whisper: 静寂と緑",
        "🏙️ Urban Jungle: 都会の喧騒と魅力を歩く",
        "⛩️ Spiritual Awakening: 神社仏閣とパワースポット",
        "🎨 Art & Soul: アートとクリエイティブ",
        "💎 Hidden Gems: 地元民しか知らない穴場",
        "📸 Photogenic: 思わず写真を撮りたくなる風景",
        "☕ Retro Revival: 昭和レトロな純喫茶・路地裏",
        "✨ Luxury & Leisure: ちょっぴり贅沢な大人の休日",
        "🌅 Morning/Evening Glow: 朝焼け・夕焼けが美しい場所",
        "📚 Culture & Book: 本とカルチャー、知的好奇心を満たす旅",
        "👾 Pop Culture & Anime: アニメ・ゲーム・サブカルの聖地へ",
        "🌊 Waterfront: 海や川辺の爽やかな風を感じて"
    ];

    const selectedThemes = allThemes.sort(() => 0.5 - Math.random()).slice(0, 5);
    const themeInstructions = selectedThemes.map((theme, i) => `   コース ${i + 1}: テーマ「${theme}」に基づくプラン`).join('\n');

    // 生成プロンプト: 完全日本語化 + 高性能探知への信頼
    const prompt = `
あなたは世界最高峰のトラベルキュレーターです。提供された最高品質のスポット候補から、**${durationMinutes}分** という限られた時間を完璧に使い切る5つのプランを作成してください。

**【ミッション】**
あなたは「旅行の魔法」を創り出すキュレーターです。提供されたスポット候補から、**${durationMinutes}分** という持ち時間を1分も無駄にせず、かつ優雅に使い切る5つのプランを **日本語で** 作成してください。

**1. 厳格な「食事・カフェの件数」制限 (重要・厳守):**
持ち時間に合わせて、AIが **絶対に守るべき数** を以下のように指示します。
${diningRule}
- 食べてばかりのプランは絶対に避け、文化・芸術・景色・体験を主役に据えてください。

**2. 場所の平均化と地理的バランス (場所のバラけ):**
- **「同じビル内」や「隣同士」のスポットばかりを連続して選ばないでください。**
- エリアを適度な距離で移動し、街全体の魅力を多角的に楽しめる、バランスの良いコースにしてください。

**3. 時間予算の「引き算計算」 (精度向上):**
- 「各スポットの滞在時間」＋「スポット間の移動時間」の合計を厳密に計算してください。
- 合計が **${durationMinutes}分** を超えず、かつ少なすぎない（時間の余りすぎない）、密度の高いプランにしてください。
- 詰め込みすぎず、各スポット独自の魅力を堪能できる「ゆとり」も同時に確保してください。

**4. エモーショナルで高品質な命名:**
- タイトルは高級雑誌の表紙のように、詩的でキャッチーな日本語にしてください。
- （例：「琥珀色の午後、文学の香りに誘われて」「潮風とアート、海辺の街がくれる贅沢」）

**5. 構成テーマ:**
${themeInstructions}

**スポット候補:**
${candidateList}

**状況背景:**
- 気分: ${mood}, 予算: ${budget}, 人数: ${groupSize}
- 現在時刻: ${timeContext}, 天候: ${weatherContext}

**出力形式 (JSONのみ、キーは英語、値は日本語):**
{
  "trivia_catalog": {
    "CANDIDATE_ID": {
      "recommendation_reason": "日本語",
      "must_see": "日本語",
      "pro_tip": "日本語",
      "trivia": "日本語 (3行以上)"
    }
  },
  "courses": [
    {
      "title": "日本語タイトル",
      "theme": "テーマ名",
      "description": "日本語の説明文",
      "spots": [
        { "id": ID, "stayTime": 分, "travel_time_minutes": 分 }
      ]
    }
  ]
}
`;

    const modelName = "gemini-2.5-flash-lite"; // コース生成はLite固定
    let text: string | undefined;

    try {
        await waitRateLimit(modelName, 5000); // 5秒制限
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        text = response.text();
    } catch (err) {
        console.error(`Lite generation failed:`, err);
        // フォールバック: Pro/Flash
        for (const fbModel of ["gemini-2.5-pro", "gemini-2.5-flash"]) {
            try {
                await waitRateLimit(fbModel, fbModel === "gemini-2.5-pro" ? 1000 : 7000);
                const model = genAI.getGenerativeModel({ model: fbModel });
                const result = await model.generateContent(prompt);
                text = (await result.response).text();
                break;
            } catch (e) { console.warn(`${fbModel} failed`); }
        }
    }

    if (!text) throw new Error("AI生成に失敗しました (全モデル試行済)。");

    // JSON抽出
    let jsonStr = text;
    const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    else {
        const start = jsonStr.indexOf('{');
        const end = jsonStr.lastIndexOf('}');
        if (start !== -1 && end !== -1) jsonStr = jsonStr.substring(start, end + 1);
    }

    const rawData = JSON.parse(jsonStr);
    const catalog = rawData.trivia_catalog || {};
    const courses = rawData.courses || [];

    // UUID
    const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);

    return courses.map((course: any) => {
        const uniqueId = generateId();
        const hydratedSpots: Spot[] = (course.spots || []).map((s: any) => {
            const original = candidates[s.id];
            const details = catalog[s.id] || {};
            if (!original) return null;
            return {
                ...original,
                stayTime: s.stayTime,
                aiDescription: details.recommendation_reason || "おすすめのスポットです",
                must_see: details.must_see || null,
                pro_tip: details.pro_tip || null,
                trivia: details.trivia || undefined
            } as Spot;
        }).filter((s: any): s is Spot => s !== null);

        // Sorting/Travel time
        if (hydratedSpots.length > 1) {
            const sorted: Spot[] = [hydratedSpots[0]];
            const remaining = hydratedSpots.slice(1);
            while (remaining.length > 0) {
                const current = sorted[sorted.length - 1];
                let nearestIdx = 0;
                let nearestDist = Infinity;
                for (let i = 0; i < remaining.length; i++) {
                    const dx = (remaining[i].lat - current.lat) * 111000;
                    const dy = (remaining[i].lon - current.lon) * 111000 * Math.cos(current.lat * Math.PI / 180);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
                }
                const picked = remaining.splice(nearestIdx, 1)[0];
                if (picked) sorted.push(picked);
            }
            for (let i = 0; i < sorted.length; i++) {
                if (i === 0) sorted[i].travel_time_minutes = 0;
                else {
                    const prev = sorted[i - 1];
                    const dx = (sorted[i].lat - prev.lat) * 111000;
                    const dy = (sorted[i].lon - prev.lon) * 111000 * Math.cos(prev.lat * Math.PI / 180);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    sorted[i].travel_time_minutes = Math.round(dist / 80);
                }
            }
            return { id: uniqueId, title: course.title, theme: course.theme, description: course.description, totalTime: durationMinutes, spots: sorted } as Course;
        }
        return { id: uniqueId, title: course.title, theme: course.theme, description: course.description, totalTime: durationMinutes, spots: hydratedSpots } as Course;
    });
};

export const remixCourse = async (
    originalCourse: Course,
    candidates: Spot[],
    remixInstruction: string,
    center: { lat: number; lon: number },
    timeContext: string = "不明",
    weatherContext: string = "不明"
): Promise<Course | null> => {
    const candidateList = candidates.map((s, i) => `${i}: ${s.name}`).join('\n');
    const prompt = `
Remix this course: "${originalCourse.title}" based on the instruction: "${remixInstruction}".

**Context:**
- Current Time: ${timeContext}
- Weather: ${weatherContext}
- Center: ${center.lat}, ${center.lon}

**Candidates:**
${candidateList}

**Requirement:**
Return JSON ONLY with:
- title: New emotional Japanese title
- description: Mag-style Japanese description
- spots: list of { id: index, stayTime: minutes }
`;

    const modelName = "gemini-2.5-flash-lite"; // RemixもLite
    try {
        await waitRateLimit(modelName, 5000);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const data = JSON.parse(response.text().match(/{[\s\S]*}/)?.[0] || "{}");
        
        const hydratedSpots = (data.spots || []).map((s: any) => {
            const original = candidates[s.id];
            if (!original) return null;
            return { ...original, stayTime: s.stayTime, aiDescription: s.recommendation_reason || "リミックスされたスポットです" };
        }).filter((s: any): s is Spot => s !== null);

        return {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
            title: data.title,
            description: data.description || "",
            totalTime: originalCourse.totalTime,
            spots: hydratedSpots,
            theme: remixInstruction
        } as Course;
    } catch (err) {
        console.error(`Remix failed:`, err);
        return null;
    }
};

export interface WaitingScreenContent {
    status_texts: string[];
    forecast_copies: string[];
    travel_tips: string[];
    interaction: {
        question: string;
        options: { id: string; label: string }[];
    }[];
}

export const generateWaitingScreenContent = async (
    locationName: string,
    weatherContext: string = "不明"
): Promise<WaitingScreenContent | null> => {
    const prompt = `Create premium Japanese waiting screen content for ${locationName} (Weather: ${weatherContext}). JSON ONLY.`;
    const modelName = "gemini-2.5-flash"; // 待機画面はFlash固定
    try {
        await waitRateLimit(modelName, 7000); // 7秒制限
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json" } });
        const result = await model.generateContent(prompt);
        return JSON.parse((await result.response).text()) as WaitingScreenContent;
    } catch (err) {
        console.warn(`Sub-AI (Flash) failed:`, err);
        return null;
    }
};
