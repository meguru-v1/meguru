import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Spot, Course } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(API_KEY);

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

// --- Rescue Logic for translated keys ---
const rescuedKeysMap: Record<string, string> = {
    'タイトル': 'title', 'テーマ': 'theme', '説明': 'description', '概要': 'description',
    'スポット': 'spots', 'スポットリスト': 'spots', '点': 'spots',
    'id': 'id', 'ＩＤ': 'id',
    '滞在時間': 'stayTime', '分数': 'stayTime',
    '移動時間': 'travel_time_minutes', '徒歩': 'travel_time_minutes',
    'おすすめ理由': 'recommendation_reason', 'おすすめ': 'recommendation_reason',
    '必見': 'must_see', '見どころ': 'must_see', '必見ポイント': 'must_see',
    'ヒント': 'pro_tip', 'プロのヒント': 'pro_tip', 'コツ': 'pro_tip',
    '豆知識': 'trivia', 'トリビア': 'trivia', '歴史': 'trivia'
};

const rescueObject = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(rescueObject);
    if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        for (const key of Object.keys(obj)) {
            let mappedKey = key;
            if (rescuedKeysMap[key]) {
                mappedKey = rescuedKeysMap[key];
            }
            newObj[mappedKey] = rescueObject(obj[key]);
        }
        return newObj;
    }
    return obj;
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
    const MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"];

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
* If it is raining/snowing, prioritize indoor activities or covered arcades.
* If it is evening/night, prioritize night views, dinner spots, or places open late.
* You MUST adapt your tone and course titles to match this context (e.g., if it's evening, focus on dinner, night views, or evening walks).

**CRITICAL LANGUAGE REQUIREMENT:**
- ALL generated text VALUES inside the JSON (theme, titles, descriptions, must_see, pro_tip, trivia, etc.) MUST be strictly in Japanese (日本語). DO NOT USE ENGLISH for values.
- CRITICAL: DO NOT translate the JSON keys. Keep JSON keys exactly as English (e.g. "id", "title", "description", "spots", "must_see", etc).

**MISSION CONSTRAINTS:**
- **Dining Rules**: ${diningRule}
- **Target Spot Count**: Approximately ${targetSpots} spots per course.
- **Tone**: Natural, Polite (Desu/Masu), magazine-like.
- **ID Matching**: Use exact integer IDs from the provided list.

**JSON SCHEMA (FOLLOW THIS EXACTLY):**
[
  {
    "title": "Poetic Japanese Title",
    "theme": "Assigned Theme",
    "description": "Japanese Description",
    "spots": [
      {
        "id": 0,
        "stayTime": 45,
        "travel_time_minutes": 10,
        "recommendation_reason": "Reason in Japanese",
        "must_see": "Highlight in Japanese",
        "pro_tip": "Tip in Japanese",
        "trivia": "Trivia in Japanese (2-3 lines)"
      }
    ]
  }
]
`;

    let text: string | undefined;
    console.log("Attempting Gemini generation...");

    let lastError: unknown;
    for (const modelName of MODELS) {
        try {
            console.log(`Trying model: ${modelName}...`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { 
                    responseMimeType: "application/json",
                    temperature: 0.8
                }
            });
            const result = await model.generateContent(prompt);
            text = result.response.text();
            if (text && text.trim().length > 10) {
                console.log(`✅ Model ${modelName} succeeded!`);
                break;
            }
        } catch (err) {
            console.warn(`❌ Model ${modelName} failed:`, err);
            lastError = err;
        }
    }

    if (!text) {
        console.error("All Gemini models failed. Last error:", lastError);
        return [];
    }

    let jsonStr = text.trim();
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
        jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
    }

    let finalData: any[];
    try {
        const parsed = JSON.parse(jsonStr);
        finalData = rescueObject(parsed);
    } catch (e) {
        console.error("JSON Parse/Rescue Error:", e, "Raw Text:", text);
        return [];
    }

    if (!Array.isArray(finalData)) return [];

    return finalData.map(course => {
        if (!course || typeof course !== 'object') return null;
        
        const uniqueId = crypto.randomUUID();
        const rawSpots = Array.isArray(course.spots) ? course.spots : [];
        
        const hydratedSpots: Spot[] = rawSpots.map((s: any) => {
            if (!s) return null;
            // Coerce ID to number
            const rawId = s.id;
            const numericId = typeof rawId === 'string' ? parseInt(rawId, 10) : Number(rawId);
            
            const original = candidates[numericId];
            if (!original) return null;

            return {
                ...original,
                stayTime: Number(s.stayTime) || original.estimatedStayTime || 30,
                aiDescription: s.recommendation_reason || s.description || '',
                must_see: s.must_see || null,
                pro_tip: s.pro_tip || null,
                trivia: s.trivia || undefined
            } as Spot;
        }).filter((s: any): s is Spot => s !== null);

        if (hydratedSpots.length === 0) return null;

        return {
            id: uniqueId,
            title: course.title || "無題のコース",
            theme: course.theme || "",
            description: course.description || "",
            totalTime: durationMinutes,
            spots: hydratedSpots
        } as Course;

    }).filter((c): c is Course => c !== null);
};

export const remixCourse = async (
    originalCourse: Course,
    candidates: Spot[],
    remixInstruction: string,
    center: { lat: number; lon: number },
    timeContext: string = "不明",
    weatherContext: string = "不明"
): Promise<Course | null> => {
    const MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"];

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
            break;
        } catch (err) {
            console.warn(`Remix attempt with ${modelName} failed:`, err);
        }
    }

    if (!text) return null;

    try {
        const parsed = JSON.parse(text);
        const data = rescueObject(parsed);
        const uniqueId = crypto.randomUUID();
        const rawSpots = Array.isArray(data.spots) ? data.spots : [];
        
        const hydratedSpots = rawSpots.map((s: any) => {
            const rawId = s.id;
            const numericId = typeof rawId === 'string' ? parseInt(rawId, 10) : Number(rawId);
            const original = candidates[numericId];
            if (!original) return null;
            return {
                ...original,
                stayTime: Number(s.stayTime) || original.estimatedStayTime || 30,
                aiDescription: s.recommendation_reason || s.description || '',
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
    const MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];

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
    "(10個) AIが作業しているようなステータスメッセージ。例: '${locationName}の隠れた名所をリストアップ中…', '地元の人しか知らないカフェを探しています…'"
  ],
  "forecast_copies": [
    "(7個) 旅の期待感を煽るポエティックな一文。例: '${locationName}の路地裏に、まだ見ぬ物語が待っている'"
  ],
  "travel_tips": [
    "(8個) その土地の豆知識。絵文字を先頭に付けて。例: '⛩️ ${locationName}の〇〇神社は…'"
  ],
  "interaction": [
    {
      "question": "(2個) ユーザーへの2択アンケート質問",
      "options": [
        {"id": "A", "label": "絵文字+選択肢A"},
        {"id": "B", "label": "絵文字+選択肢B"}
      ]
    }
  ]
}

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
            console.warn(`Sub-AI (${modelName}) failed:`, err);
        }
    }

    console.warn("Sub-AI failed, falling back to static content.");
    return null;
};
