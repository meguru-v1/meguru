import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Spot, Course } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(API_KEY);

// 共通モデルリスト (次世代モデルに統一 / Grounding対応の2.5系のみ)
const MODELS = [
    "gemini-2.5-flash",         // 標準
    "gemini-2.5-flash-lite"     // 軽量
];

// 429エラー（Quota）発生時の待機用
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// モデル別最終リクエスト時刻管理
const lastRequestTimes: Record<string, number> = {
    "gemini-2.5-flash-lite": 0,
    "gemini-2.5-flash": 0
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
    if (durationMinutes <= 90) { // 1.5時間以下
        return `- **食事・カフェの制限**: 各コースにおいて **最大1件** まで。サクッと立ち寄れるカフェや軽食を含めてください。`;
    } else if (durationMinutes <= 180) { // 3時間以下
        return `- **食事・カフェの制限**: 各コースにおいて **最大2件（必ず1件は含める）**。体験をメインに据えつつ、美味しい休憩スポットを確保。`;
    } else if (durationMinutes <= 300) { // 5時間以下
        return `- **食事・カフェの制限**: 各コースにおいて **必ず1〜2件含める**。ランチとカフェなど、観光の合間に名物を楽しんで。`;
    } else { // 5時間超
        return `- **食事・カフェの制限**: 各コースにおいて **必ず2〜3件含める**。ランチやディナー、休憩カフェなど、長旅に見合った食事体験を。`;
    }
};

const getRecommendedSpotCount = (durationMinutes: number) => {
    if (durationMinutes <= 90) { // 1.5時間以下
        return `**1〜2件**`;
    } else if (durationMinutes <= 180) { // 3時間以下
        return `**2〜3件**`;
    } else if (durationMinutes <= 300) { // 5時間以下
        return `**3〜4件**`;
    } else { // 5時間超
        return `**4〜5件**`;
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
        return `ID ${i}: ${s.name} (${details})`;
    }).join('\n');

    const diningRule = getDiningRule(durationMinutes);
    const spotCountRule = getRecommendedSpotCount(durationMinutes);

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
Your task is to create 5 **COMPLETELY DISTINCT** plans for a **${durationMinutes} minute** trip.

**【最重要ミッション】**
あなたは世界最高峰のトラベルキュレーターです。提供された候補から、必ず **全く異なる5つのプラン** を作成してください。

**1. コースの完全な独立性と重複排除 (極めて重要):**
- **5つのコース間で、スポットを被らせることは絶対に禁止です。**（例: コース1で選んだカフェや公園を、コース2〜5で再利用してはいけません）。
- 行き先がすべて同じで名前だけ違うようなコースは許容されません。

**2. 体験・観光の主役化と飲食制限:**
${diningRule}
- 食べてばかりのプランにならないよう、公園、神社仏閣、名所、美術館などの**「体験・景色」をコースの主役に**してください。

**3. 時間予算とスポット数の厳守:**
- 「各スポットの滞在時間」＋「スポット間の移動時間」が指定された **${durationMinutes}分** を超えないように厳選してください。
- 今回の旅行時間（${durationMinutes}分）において、各コースの**最適なスポット数は ${spotCountRule}** です。この件数の範囲内でコースを構成してください。

**4. 魅力的な命名と具体的な解説:**
- **タイトル**: 雑誌の特集のように、詩的でキャッチーな日本語タイトルにしてください。
- **解説 (aiDescription)**: 「おすすめのスポットです」といった手抜きの表現は絶対に禁止。その場所の歴史、特徴、雰囲気を具体的に語る、魅力的な説明文を作成してください。

**5. 構成と多様性:**
${themeInstructions}

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
  "courses": [
    {
      "title": "Emotional Title",
      "theme": "Theme Name",
      "description": "Mag-style intro",
      "spots": [
        { 
          "id": 0, 
          "stayTime": MINS, 
          "travel_time_minutes": MINS,
          "aiDescription": "その場所ならではの具体的な魅力と選んだ理由（「おすすめのスポットです」は禁止）",
          "must_see": "Primary highlight",
          "pro_tip": "Insider insight",
          "trivia": "Rich historical/flavor trivia (3+ lines)"
        }
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
        // フォールバック: Flash (7秒待つ)
        const fbModel = "gemini-2.5-flash";
        try {
            await waitRateLimit(fbModel, 7000);
            const model = genAI.getGenerativeModel({ model: fbModel });
            const result = await model.generateContent(prompt);
            text = (await result.response).text();
        } catch (e) {
            console.warn(`${fbModel} failed`);
        }
    }

    if (!text) throw new Error("AI生成に失敗しました (全モデル試行済)。");

    // JSON抽出の堅牢化
    let jsonStr = text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/); // markdown code block対応
    if (jsonMatch) {
        jsonStr = jsonMatch[1];
    } else {
        const start = jsonStr.indexOf('{');
        const end = jsonStr.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            jsonStr = jsonStr.substring(start, end + 1);
        }
    }
    
    // 不正なカンマなどのクリーニング
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1'); 

    let rawData;
    try {
        rawData = JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error:", e, "\nOriginal Text:", jsonStr);
        throw new Error("AIの出力形式が不正です。もう一度お試しください。");
    }
    const courses = rawData.courses || [];

    // UUID
    const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);

    return courses.map((course: any) => {
        const uniqueId = generateId();
        const hydratedSpots: Spot[] = (course.spots || []).map((s: any) => {
            const original = candidates[Number(s.id)]; // 念のためNumberキャスト
            if (!original) return null;
            return {
                ...original,
                stayTime: Number(s.stayTime) || 30,
                aiDescription: s.aiDescription || s.recommendation_reason || "おすすめのスポットです",
                must_see: s.must_see || null,
                pro_tip: s.pro_tip || null,
                trivia: s.trivia || undefined
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
    center: { lat: number; lon: number },
    durationMinutes: number,
    timeContext: string = "不明",
    weatherContext: string = "不明",
    mood: string = "不明",
    budget: string = "不明",
    groupSize: string = "不明"
): Promise<Course | null> => {
    const candidateList = candidates.map((s, i) => {
        const details = [
            s.category,
            s.rating ? `★${s.rating}` : null,
            s.price_level ? `Price:${'¥'.repeat(s.price_level)}` : null,
            `Est.Stay:${s.estimatedStayTime || 30}min`
        ].filter(Boolean).join(', ');
        return `ID ${i}: ${s.name} (${details})`;
    }).join('\n');

    const diningRule = getDiningRule(durationMinutes);
    const spotCountRule = getRecommendedSpotCount(durationMinutes);

    const prompt = `
You are a top-tier Japanese luxury travel curator.
Your task is to REDESIGN this course: "${originalCourse.title}"
Based on the specific user instruction: "${remixInstruction}"

**【最重要ミッション】**
1. **大胆な変化と指示の反映**: ユーザーの指示 "${remixInstruction}" に基づき、必要であれば元のスポットの半分以上を入れ替えるなど、**「明らかに変わったこと」が分かる大胆な再編集**を行ってください。
2. **圧倒的なネーミングセンス**: タイトルは雑誌の特集のように、**詩的でキャッチーな日本語タイトル**に新しく書き換えてください。
3. **飲食制限の絶対遵守**: ${diningRule}
   - この制限を超えてカフェや飲食店を入れることは、プロのキュレーターとして許されません。
4. **スポット数の厳守**: 今回の旅行時間（${durationMinutes}分）において、最適なスポット数は **${spotCountRule}** です。この件数の範囲内で構成してください。
5. **具体的な解説**: 各スポットの aiDescription は、その場所の風景、歴史、雰囲気が目に浮かぶような具体的な日本語で記述してください。「おすすめのスポットです」などの無意味な表現は厳禁です。

**CANDIDATES:**
${candidateList}

**SYSTEM INFO:**
- Current Mood: ${mood}, Budget: ${budget}, People: ${groupSize}
- Context: ${timeContext}, ${weatherContext}

**OUTPUT SCHEMA (JSON only, after <thinking>):**
{
  "title": "New Catchy Magazine-style Title",
  "description": "Mag-style intro explaining the essence of this remix",
  "spots": [
    { 
      "id": 0, 
      "stayTime": MINS, 
      "aiDescription": "その場所の魅力を情感豊かに語る（日本語）"
    }
  ]
}
`;

    const modelName = "gemini-2.5-flash-lite";
    try {
        await waitRateLimit(modelName, 5000);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = (await result.response).text();

        let jsonStr = text;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            const start = jsonStr.indexOf('{');
            const end = jsonStr.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                jsonStr = jsonStr.substring(start, end + 1);
            }
        }
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1'); 

        const data = JSON.parse(jsonStr);
        
        const hydratedSpots = (data.spots || []).map((s: any) => {
            const original = candidates[Number(s.id)];
            if (!original) return null;
            return { 
                ...original, 
                stayTime: Number(s.stayTime) || 30, 
                aiDescription: s.aiDescription || "リミックスされたスポットです" 
            } as Spot;
        }).filter((s: any): s is Spot => s !== null);

        if (hydratedSpots.length === 0) return null;

        return {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
            title: data.title || originalCourse.title + " (Remix)",
            description: data.description || "",
            totalTime: durationMinutes,
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
