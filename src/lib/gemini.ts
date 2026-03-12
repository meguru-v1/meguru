import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Spot, Course } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(API_KEY);

// 共通モデルリスト（ユーザー指定: 2.5 Flash / 2.5 Flash-lite）
const MODELS = [
    "gemini-2.5-flash", 
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro"
];

// 429エラー（Quota）発生時の待機用
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getDiningRule = (durationMinutes: number) => {
    if (durationMinutes <= 150) {
        return `- **Dining/Cafe limits**: MIN 0, MAX 2 total spots for food/drink.\n  - Of those MAX 2, there can be AT MOST 1 Restaurant and AT MOST 1 Cafe.\n  - STRICT: NEVER consecutive restaurants.`;
    } else if (durationMinutes <= 300) {
        return `- **Dining/Cafe limits**: MIN 1, MAX 2 total spots for food/drink.\n  - Of those spots, there can be AT MOST 1 Cafe.\n  - STRICT: NEVER consecutive restaurants.`;
    } else if (durationMinutes <= 450) {
        return `- **Dining/Cafe limits**: MIN 2, MAX 3 total spots for food/drink.\n  - Of those spots, there can be AT MOST 1 Cafe.\n  - STRICT: NEVER consecutive restaurants.`;
    } else {
        return `- **Dining/Cafe limits**: MIN 3, MAX 4 total spots for food/drink.\n  - Of those spots, MUST include 1 or 2 Cafes.\n  - STRICT: NEVER consecutive restaurants.`;
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
    const candidateList = candidates.map((s, i) =>
        `${i}: ${s.name} (${s.category}, ★${s.rating || '-'}, ※${s.estimatedStayTime || 30}分)`
    ).join('\n');

    const diningRule = getDiningRule(durationMinutes);

    const targetSpots = Math.min(Math.ceil(durationMinutes / 50), 15);

    const allThemes = [
        "🕰️ Time Travel: 時代を感じる歴史旅",
        "🌿 Nature's Whisper: 静寂と緑",
        "🏙️ Urban Jungle: 都会の喧騒と魅力を歩く",
        "⛩️ Spiritual Awakening: 神社仏閣とパワースポット",
        "🍽️ Gourmet Adventure: 美食と食べ歩き",
        "🎨 Art & Soul: アートとクリエイティブ",
        "💎 Hidden Gems: 地元民しか知らない穴場",
        "📸 Photogenic: 思わず写真を撮りたくなる風景",
        "☕ Retro Revival: 昭和レトロな純喫茶・路地裏",
        "✨ Luxury & Leisure: ちょっぴり贅沢な大人の休日",
        "👻 Mystery & Legend: ちょっと怖い伝説・ミステリー",
        "🛍️ Local Life: 商店街と地元民の暮らし",
        "🏛️ Architecture Walk: 名建築とユニークな建物",
        "🤫 Silence & Solitude: 究極の「おひとりさま」静寂",
        "🌅 Morning/Evening Glow: 朝焼け・夕焼けが美しい場所",
        // 追加された拡張テーマ
        "♨️ Healing Waters: 温泉・銭湯と下町リラックス",
        "🎯 Trend Hunter: 最新ショップと流行スポット",
        "📚 Culture & Book: 本とカルチャー、知的好奇心を満たす旅",
        "👾 Pop Culture & Anime: アニメ・ゲーム・サブカルの聖地へ",
        "🏃 Active & Sports: 体を動かすアクティビティと自然",
        "🍻 Evening Izakaya & Pub: 大人の夜遊び・はしご酒",
        "🏭 Industrial & Night View: 工場夜景とインダストリアルな風景",
        "👨‍👩‍👧‍👦 Family Fun: 子供と一緒に楽しむファミリープラン",
        "🌊 Waterfront: 海や川辺の爽やかな風を感じて",
        "🚂 Railway & Transit: 乗り物を楽しむ鉄分多めの旅"
    ];

    const selectedThemes = allThemes.sort(() => 0.5 - Math.random()).slice(0, 5);
    const themeInstructions = selectedThemes.map((theme, i) => `   Course ${i + 1}: Based strictly on theme "${theme}"`).join('\n');

    const prompt = `
You are an expert, high-end travel concierge for Japan.
Your client has ${durationMinutes} minutes to spend starting from a specific location.

Here is a list of candidate spots nearby (ID: Name(Category)):
${candidateList}

**YOUR MISSION:**
Create 5 distinct, **exciting** model courses.
**EACH COURSE MUST FOLLOW A SPECIFIC THEME SELECTED BELOW:**
${themeInstructions}

**CRITICAL: MANDATORY DINING CONSTRAINTS (HARD RULES)**
For a ${durationMinutes} min itinerary, YOU MUST strictly follow these counts:
${diningRule}
* **PENALTY**: Any course violating these MIN/MAX counts or having consecutive restaurants will be REJECTED. Count carefully!

**PERSONALIZATION CONTEXT:**
- Mood: ${mood}
- Budget: ${budget}
- Group Size/Type: ${groupSize}
* Adjust your selection and descriptions based on this. (e.g., if 'Rich', prioritize higher-rated or sophisticated spots. If 'Family', add child-friendly pro-tips).

**CURRENT CONTEXT (CRITICAL FOR SPOT SELECTION):**
- Current Time: ${timeContext}
- Current Weather: ${weatherContext}
* **INTELLIGENT TIME REFLECTION**: 
    - If it's around 11:30~13:30, include a Lunch spot.
    - If it's 15:00~16:30, include a Cafe/Tea spot.
    - If it's after 17:30, include a Dinner spot and prioritize night views.
    - Mention why you chose this timing in the 'recommendation_reason' (e.g., "ちょうどお腹が空く時間なので...", "夕日が綺麗な時間に合わせて...").
* If it is raining/snowing, prioritize indoor activities or covered arcades.

**JSON KEY RULES (HARD CONSTRAINT):**
- **NEVER TRANSLATE KEYS**: Keep all keys strictly in English ("id", "title", "description", "spots", etc.).
- **VALUES IN JAPANESE**: Only the text values must be in Japanese.

**DIVERSITY RULE (STRICT):**
- **NO FOOD-ONLY COURSES**: A course MUST contain at least one (ideally two or more) NON-DINING spot (e.g., a museum, park, historical landmark, scenic walk).
- **BALANCE**: Think of the itinerary as a journey, not a food tour. Food spots should complement the activity, not be the only activities.

**NEGATIVE CONSTRAINTS (MUST FOLLOW):**
- **NO RAW CODE / FUNCTIONS**: Write completely natural Japanese.
- **NO DUPLICATE SPOTS**: A spot used in Course 1 CANNOT be used in Course 2, 3, 4, or 5.
- **SPOT COUNT**: Each course should have approximately **${targetSpots} spots** to fill ${durationMinutes} minutes. NEVER make a course shorter than requested.

**IMPORTANT**: Dig deep into your knowledge for unique trivia.

**CRITICAL RULES:**
1. **Output MUST be valid JSON**.
2. **LANGUAGE**: Natural, Polite Japanese (Desu/Masu tone).
3. **NAMING**: Create highly poetic, stylish, and magazine-like titles in Japanese for 'title'. Avoid generic names. (e.g. "月明かりに染まる古都の夜", "路地裏に隠れた純喫茶を巡る午睡")
4. **ID MATCHING**: Use the exact integer IDs provided (0, 1, 2...).
5. **DESCRIPTIONS (The Hook)**: Focus on Story, Legend, Atmosphere, Secret Tips.
6. **RICHER DETAILS (Required)**:
   - **stayTime**: Use the ※推定分数 shown next to each spot as a baseline. You may adjust ±10 min based on the spot's significance, but NEVER use the same stayTime for all spots.
   - **travel_time_minutes**: Estimate walking time from previous spot.
   - **must_see**: ONE specific thing to look for/do.
   - **pro_tip**: A savvy traveler tip.
   - **trivia**: A fascinating, lesser-known fact, history, or trivia about the spot (2-3 lines in Japanese).

**JSON SCHEMA:**
[
    {
        "id": "theme_id_1",
        "title": "Title including Theme Name",
        "theme": "The assigned theme string",
        "description": "Course Description (Japanese)",
        "totalTime": ${durationMinutes},
        "spots": [
            {
                "id": 12,
                "stayTime": 60,
                "travel_time_minutes": 10,
                "recommendation_reason": "Specific reason...",
                "must_see": "Specific highlight...",
                "pro_tip": "Specific tip...",
                "trivia": "Fascinating trivia..."
            }
        ]
    }
]
    `;
    let text: string | undefined;
    console.log("Attempting Gemini generation...");
    console.log("API Key present:", !!API_KEY, "Key prefix:", API_KEY ? API_KEY.substring(0, 10) + '...' : 'MISSING');

    let lastError: unknown;
    for (const modelName of MODELS) {
        try {
            console.log(`Trying model: ${modelName}...`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            text = response.text();
            console.log(`✅ Model ${modelName} succeeded! Response length: ${text?.length || 0}`);
            break;
        } catch (err) {
            const isQuotaError = err instanceof Error && err.message.includes("429");
            console.warn(`❌ Model ${modelName} failed:`, err instanceof Error ? err.message : err);
            lastError = err;
            if (isQuotaError) {
                console.log("Quota exceeded (429). Waiting 500ms before fallback (Paid Tier Optimized)...");
                await sleep(500); // 待機時間を短縮
            }
        }
    }

    if (!text) {
        const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
        console.error("All Gemini models failed. Last error:", errorMsg);
        throw new Error(`AI生成に失敗しました: ${errorMsg}`);
    }

    console.log("Gemini Raw Response (First 500 chars):", text.substring(0, 500));

    let jsonStr = text;
    // Extract JSON array carefully: find first '[' and last ']'
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
    } else {
        // Fallback: cleaning Markdown blocks if brackets are not found or messed up
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    console.log("Extracted JSON String (First 200 chars):", jsonStr.substring(0, 200));

    interface GeminiSpot {
        id: number;
        stayTime: number;
        travel_time_minutes: number;
        recommendation_reason?: string;
        description?: string;
        must_see?: string;
        pro_tip?: string;
        trivia?: string;
    }
    interface GeminiCourse {
        id: string;
        title: string;
        theme: string;
        description: string;
        totalTime: number;
        spots: GeminiSpot[];
    }

    let coursesData: GeminiCourse[];
    try {
        coursesData = JSON.parse(jsonStr) as GeminiCourse[];
        if (!Array.isArray(coursesData) || coursesData.length === 0) {
            throw new Error("Parsed result is not a non-empty array");
        }
        console.log(`✅ Successfully parsed ${coursesData.length} courses.`);
    } catch (e) {
        console.error("CRITICAL: JSON Parse Error or Invalid Format.");
        console.error("Error Detail:", e);
        console.log("Problematic Raw Response:", text);
        throw new Error(`AIの応答を解析できませんでした。形式が正しくありません。 (Parse Error)`);
    }

    return coursesData.map(course => {
        const uniqueId = crypto.randomUUID();
        const hydratedSpots: Spot[] = course.spots.map(s => {
            const original = candidates[s.id];
            if (!original) {
                console.warn(`Gemini returned invalid ID: ${s.id}`);
                return null;
            }
            return {
                ...original,
                stayTime: s.stayTime,
                aiDescription: s.recommendation_reason || s.description,
                must_see: s.must_see || null,
                pro_tip: s.pro_tip || null,
                trivia: s.trivia || undefined
            } as Spot;
        }).filter((s): s is Spot => s !== null);

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
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestIdx = i;
                    }
                }
                sorted.push(remaining.splice(nearestIdx, 1)[0]);
            }

            for (let i = 0; i < sorted.length; i++) {
                if (i === 0) {
                    sorted[i].travel_time_minutes = 0;
                } else {
                    const prev = sorted[i - 1];
                    const dx = (sorted[i].lat - prev.lat) * 111000;
                    const dy = (sorted[i].lon - prev.lon) * 111000 * Math.cos(prev.lat * Math.PI / 180);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    sorted[i].travel_time_minutes = Math.round(dist / 80);
                }
            }

            return { ...course, id: uniqueId, spots: sorted } as Course;
        }

        return { ...course, id: uniqueId, spots: hydratedSpots } as Course;
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
    // グローバルの MODELS を使用

    const candidateList = candidates.map((s, i) =>
        `${i}: ${s.name} (${s.category}, ★${s.rating || '-'}, ※${s.estimatedStayTime || 30}分)`
    ).join('\n');

    const originalCourseInfo = JSON.stringify({
        title: originalCourse.title,
        description: originalCourse.description,
        spots: originalCourse.spots.map(s => s.name)
    });

    const diningRule = getDiningRule(originalCourse.totalTime);

    const prompt = `
You are an expert, high-end travel concierge.
Your client currently has this course:
${originalCourseInfo}

**YOUR MISSION:**
Remix this course based on the following new instruction:
**"${remixInstruction}"**

**CRITICAL: MANDATORY DINING CONSTRAINTS (HARD RULES)**
For a ${originalCourse.totalTime} min itinerary, YOU MUST strictly follow these counts:
${diningRule}
* **PENALTY**: Any remixed course violating these MIN/MAX counts or having consecutive restaurants will be REJECTED. Count carefully!

**HOW to REMIX:**
1. **Keep the Flow**: Maintain the general route and duration (${originalCourse.totalTime} min).
2. **Swap if needed**: If a spot doesn't fit the new instruction, swap it with a better one from the candidates list below.
3. **Rewrite Descriptions**: Update the 'description' and each spot's 'recommendation_reason' to explain WHY it now fits the theme "${remixInstruction}".
4. **Magazine-like Title**: Update the 'title' to be even more stylish and reflect the new vibe.

Candidates List:
${candidateList}

**CONSTRAINTS**:
- Output ONE course in JSON format.
- Language: Natural, Polite Japanese.
- Same rules as before: No code, unique trivia, stayTime/travel_time_minutes estimation.
- Context: Time ${timeContext}, Weather ${weatherContext}.

**JSON KEY RULES:**
- DO NOT translate JSON keys (id, title, description, spots, must_see, etc.).
- Use natural Japanese for text values only.

**JSON SCHEMA:**
{
    "title": "New Stylish Title",
    "description": "Why this remix is special...",
    "spots": [
        {
            "id": 12,
            "stayTime": 60,
            "travel_time_minutes": 10,
            "recommendation_reason": "Specific reason for the remix...",
            "must_see": "Highlight...",
            "pro_tip": "Savvy tip...",
            "trivia": "A fascinating fact..."
        }
    ]
}
`;

    let text: string | undefined;
    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            text = response.text();
            console.log(`✅ Remix with ${modelName} succeeded!`);
            break;
        } catch (err) {
            const isQuotaError = err instanceof Error && err.message.includes("429");
            console.warn(`Remix attempt with ${modelName} failed:`, err instanceof Error ? err.message : err);
            if (isQuotaError) {
                console.log("Quota exceeded (429) in Remix. Waiting 500ms...");
                await sleep(500);
            }
        }
    }

    if (!text) return null;

    try {
        console.log("Remix Raw Response (First 300 chars):", text.substring(0, 300));
        
        let jsonStr = text;
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        } else {
            jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
        }

        const data = JSON.parse(jsonStr);
        console.log("✅ Remix JSON parsed successfully.");
        const uniqueId = crypto.randomUUID();
        const hydratedSpots = data.spots.map((s: any) => {
            const original = candidates[s.id];
            if (!original) return null;
            return {
                ...original,
                stayTime: s.stayTime,
                aiDescription: s.recommendation_reason,
                must_see: s.must_see || null,
                pro_tip: s.pro_tip || null,
                trivia: s.trivia || undefined
            } as Spot;
        }).filter((s: any): s is Spot => s !== null);

        // Calculate travel times (simple walking 80m/min)
        for (let i = 1; i < hydratedSpots.length; i++) {
            const prev = hydratedSpots[i - 1];
            const curr = hydratedSpots[i];
            const dx = (curr.lat - prev.lat) * 111000;
            const dy = (curr.lon - prev.lon) * 111000 * Math.cos(prev.lat * Math.PI / 180);
            const dist = Math.sqrt(dx * dx + dy * dy);
            curr.travel_time_minutes = Math.round(dist / 80);
        }
        if (hydratedSpots.length > 0) hydratedSpots[0].travel_time_minutes = 0;

        return {
            id: uniqueId,
            title: data.title,
            description: data.description,
            totalTime: originalCourse.totalTime,
            spots: hydratedSpots,
            theme: remixInstruction
        } as Course;
    } catch (e) {
        console.error("Remix Parse Error:", e);
        return null;
    }
};

// ===== サブAI: 待ち画面コンテンツ生成 =====
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

    const prompt = `
あなたは旅行アプリの「生成待ち画面」のコンテンツを作成するAIです。
ユーザーが「${locationName}」周辺の旅行プランを生成中です。天気は ${weatherContext} です。

以下のJSON形式で、**その土地ならではの**コンテンツを生成してください。

**ルール:**
- すべて自然な日本語で、丁寧語（です・ます調）で書く。
- 「${locationName}」に関連する具体的な地名・名所・文化・食べ物を盛り込む。
- 汎用的すぎるコメントは避け、その土地を知っている人が「おっ」と思う内容にする。

**JSON SCHEMA:**
{
  "status_texts": [
    "(10個) AIが作業している具体的な地名を含むメッセージ。例: '嵐山の隠れた穴場をリストアップ中…'"
  ],
  "forecast_copies": [
    "(7個) ポエティックな日本語の一文。例: '鴨川のせせらぎに、新しい発見が待っています'"
  ],
  "travel_tips": [
    "(8個) その土地の豆知識。'⛩️ 〇〇寺の…' 形式"
  ],
  "interaction": [
    {
      "question": "(2個) ユーザーへの2択質問 (日本語)",
      "options": [
        {"id": "A", "label": "選択肢A (日本語)"},
        {"id": "B", "label": "選択肢B (日本語)"}
      ]
    }
  ]
}

**IMPORTANT**: 
- ALL text VALUES must be in Japanese.
- ALL JSON KEYS (status_texts, forecast_copies, travel_tips, interaction, question, options, id, label) MUST remain in ENGLISH. DO NOT TRANSLATE KEYS.

Output MUST be valid JSON only. No markdown, no explanation.
`;

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            let jsonStr = text;
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }

            const data = JSON.parse(jsonStr) as WaitingScreenContent;
            console.log("✅ Sub-AI waiting screen content generated!");
            return data;
        } catch (err) {
            const isQuotaError = err instanceof Error && err.message.includes("429");
            console.warn(`Sub-AI (${modelName}) failed:`, err instanceof Error ? err.message : err);
            if (isQuotaError) {
                await sleep(200); // サブAIはさらに短めの待機
            }
        }
    }

    console.warn("Sub-AI failed, falling back to static content.");
    return null;
};
