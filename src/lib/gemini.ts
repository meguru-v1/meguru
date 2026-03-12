import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Spot, Course } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(API_KEY);

// 共通モデルリスト (高性能化のため Pro を優先)
const MODELS = [
    "gemini-2.5-pro",
    "gemini-2.5-flash", 
    "gemini-2.5-flash-lite"
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

Here is a list of candidate spots nearby (ID: Name(Detailed Infos)):
${candidateList}

**YOUR MISSION:**
Create 5 distinct, **extraordinary** model courses using the "Thinking Step" for higher performance.

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
* Adjust your selection based on priceLevel and ratings.

**CURRENT CONTEXT (CRITICAL FOR SPOT SELECTION):**
- Current Time: ${timeContext}
- Current Weather: ${weatherContext}
* **INTELLIGENT TIME REFLECTION**: 
    - If it's around 11:30~13:30, include a Lunch spot.
    - If it's 15:00~16:30, include a Cafe/Tea spot.
    - If it's after 17:30, include a Dinner spot and prioritize night views.
    - Mention why you chose this timing in the 'recommendation_reason'.
* If it is raining/snowing, prioritize indoor activities.

**DIVERSITY RULE (STRICT):**
- **NO FOOD-ONLY COURSES**: A course MUST contain at least one (ideally two or more) NON-DINING spot (e.g., museum, park, etc.).

**YOUR WORKFLOW (STRICT):**
1. **THINKING STEP (<thinking>)**:
    - Before generating the JSON, output a <thinking> block in Japanese (200-400 chars).
    - Analyze candidates, user mood/budget, and context (time/weather).
    - Plan a logical route (minimizing travel) and theme-consistent activities.
    - **Verify Dining Rules**: Double-check that MIN/MAX dining counts are met.
    - **Use Details**: Integrate the provided opening hours and review summaries.
2. **JSON OUTPUT**:
    - Output the final courses in valid JSON format after the </thinking> closing tag.

**JSON SCHEMA:**
[
    {
        "id": "theme_id_1",
        "title": "Poetic Magazine-like Title",
        "theme": "Assigned Theme Name",
        "description": "Engaging course summary...",
        "totalTime": ${durationMinutes},
        "spots": [
            {
                "id": 12,
                "stayTime": 60,
                "travel_time_minutes": 10,
                "recommendation_reason": "Specific reason citing details...",
                "must_see": "Primary highlight...",
                "pro_tip": "Insider tip based on review/summary...",
                "trivia": "Rich trivia based on facts (3+ lines)..."
            }
        ]
    }
]

**JSON KEY RULES (HARD CONSTRAINT):**
- **NEVER TRANSLATE KEYS**: Keep all keys strictly in English ("id", "title", "description", "spots", etc.).
- **VALUES IN JAPANESE**: Only the text values must be in Japanese.
- Output ONLY the JSON after the thinking block. No other text.
`;

    let text: string | undefined;
    console.log("Attempting High-Performance Gemini generation...");

    for (const modelName of MODELS) {
        try {
            console.log(`Trying model: ${modelName}...`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                // 高性能化のため MIME type は指定せず、手動でパース（thinkingが含まれるため）
            });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            text = response.text();
            console.log(`✅ Model ${modelName} succeeded! Response length: ${text?.length || 0}`);
            break;
        } catch (err) {
            console.warn(`❌ Model ${modelName} failed:`, err instanceof Error ? err.message : err);
            await sleep(500); 
        }
    }

    if (!text) throw new Error(`AI生成に失敗しました。`);

    // thinkingタグを除去してJSONを抽出
    let jsonStr = text;
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
    } else {
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    const coursesData = JSON.parse(jsonStr) as any[];

    return coursesData.map(course => {
        const uniqueId = crypto.randomUUID();
        const hydratedSpots: Spot[] = course.spots.map((s: any) => {
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
        }).filter((s: Spot | null): s is Spot => s !== null);

        // Sorting by distance
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
    const candidateList = candidates.map((s, i) => `${i}: ${s.name}`).join('\n');
    const originalCourseInfo = JSON.stringify({
        title: originalCourse.title,
        spots: originalCourse.spots.map(s => s.name)
    });

    const prompt = `Remix this course: ${originalCourseInfo} based on: "${remixInstruction}". Use thinking step and output JSON only. Candidates: ${candidateList}`;

    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            let jsonStr = text;
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }

            const data = JSON.parse(jsonStr);
            const hydratedSpots = data.spots.map((s: any) => {
                const original = candidates[s.id];
                if (!original) return null;
                return { ...original, stayTime: s.stayTime, aiDescription: s.recommendation_reason };
            }).filter((s: any): s is Spot => s !== null);

            return {
                id: crypto.randomUUID(),
                title: data.title,
                description: data.description || "",
                totalTime: originalCourse.totalTime,
                spots: hydratedSpots,
                theme: remixInstruction
            } as Course;
        } catch (err) {
            console.warn(`Remix attempt failed:`, err);
        }
    }
    return null;
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
    const prompt = `Create waiting screen content for ${locationName} (Weather: ${weatherContext}). Output JSON with: status_texts, forecast_copies, travel_tips, interaction.`;
    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json" } });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return JSON.parse(response.text()) as WaitingScreenContent;
        } catch (err) {
            console.warn(`Sub-AI failed:`, err);
        }
    }
    return null;
};
