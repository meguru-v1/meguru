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

// レート制限待機用
const waitRateLimit = async (modelName: string, intervalMs: number) => {
    const now = Date.now();
    const elapsed = now - (lastRequestTimes[modelName] || 0);
    if (elapsed < intervalMs) {
        const wait = intervalMs - elapsed;
        console.log(`[RateLimit] Waiting ${wait}ms for model: ${modelName}`);
        await sleep(wait);
    }
    lastRequestTimes[modelName] = Date.now();
};

const getDiningRule = (durationMinutes: number) => {
    if (durationMinutes <= 150) {
        return `- **Dining/Cafe limits**: MIN 0, MAX 1 total spot for food/drink.\n  - STRICT: AT MOST 1 spot total for dining OR cafe. Do not choose both.`;
    } else if (durationMinutes <= 300) {
        return `- **Dining/Cafe limits**: MIN 1, MAX 2 total spots for food/drink.\n  - Suggestion: 1 Restaurant and 1 Cafe. AT MOST 1 Cafe.`;
    } else if (durationMinutes <= 450) {
        return `- **Dining/Cafe limits**: MIN 2, MAX 3 total spots for food/drink.\n  - STRICT: NEVER consecutive restaurants. Diversity is key.`;
    } else {
        return `- **Dining/Cafe limits**: MIN 2, MAX 4 total spots for food/drink.\n  - AT MOST 2 Cafes. Ensure non-dining spots remain dominant in interest.`;
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
    const themeInstructions = selectedThemes.map((theme, i) => `   Course ${i + 1}: Based strictly on theme "${theme}"`).join('\n');

    // 爆速化プロンプト: 「小ネタカタログ」＋「コース構成」の2段構え
    const prompt = `
You are a top-tier Japanese luxury travel curator.
Your task is to create 5 distinct plans for a **${durationMinutes} minute** trip.

**【最重要ミッション】**
あなたは世界最高峰のトラベルキュレーターです。**必ず日本語で**、雑誌の特集のような魅力的な5つのプランを作成してください。

**1. 時間予算の厳守 (重要):**
- **「各スポットの滞在時間の合計」＋「スポット間の移動時間」**が、指定された **${durationMinutes}分** を超えないように厳選してください。
- 詰め込みすぎず、そのテーマにおいて最高に価値のある3〜5程度のスポットに絞るのがコツです。

**2. 食事・カフェの制限:**
${diningRule}
- 食べてばかりのプランにならないよう、文化、景色、体験を主役にしてください。

**3. 情緒的な命名とトーン:**
- **タイトル**: 「〜を巡る旅」のような平凡な名前は禁止です。思わずクリックしたくなる、詩的でキャッチーな日本語タイトルにしてください（例：「琥珀色の午後、文学の香りに誘われて」）。
- **トーン**: 洗練され、ワクワクさせるような、高級旅行誌の文体で書いてください。

**4. 構成と多様性:**
${themeInstructions}
- **食事のみのコースは禁止**です。必ず1つ以上（理想は2つ以上）の非飲食スポット（美術館、公園、史跡など）を含めてください。

**【出力形式】**
- **JSONの「値」はすべて日本語**で出力してください。
- **JSONの「キー」は絶対に英語のまま**（id, title, description, trivia等）にしてください。

**CANDIDATES:**
${candidateList}

**SYSTEM INFO:**
- Mood: ${mood}, Budget: ${budget}, People: ${groupSize}
- Context: ${timeContext}, ${weatherContext}

**OUTPUT SCHEMA (JSON only, after <thinking>):**
{
  "trivia_catalog": {
    "CANDIDATE_ID": {
      "recommendation_reason": "Summary based on context",
      "must_see": "Primary highlight",
      "pro_tip": "Insider insight",
      "trivia": "Rich historical/flavor trivia (3+ lines)"
    }
  },
  "courses": [
    {
      "title": "Emotional Title",
      "theme": "Theme Name",
      "description": "Mag-style intro",
      "spots": [
        { "id": ID, "stayTime": MINS, "travel_time_minutes": MINS }
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
        // フォールバック: Pro/Flash (これらも 5-7秒待つ)
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

        // Sorting/Travel time (already implemented in gemini.ts before, keeping logic)
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
    center: { lat: number; lon: number }
): Promise<Course | null> => {
    const candidateList = candidates.map((s, i) => `${i}: ${s.name}`).join('\n');
    const prompt = `Remix this course: ${originalCourse.title} based on: "${remixInstruction}". Candidates: ${candidateList}. Return JSON ONLY with title, description, and list of spot IDs with stayTimes.`;

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
