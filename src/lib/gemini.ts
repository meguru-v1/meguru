import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Spot, Course } from '../types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const genAI = new GoogleGenerativeAI(API_KEY);

export const generateSmartCourses = async (
    candidates: Spot[],
    center: { lat: number; lon: number },
    durationMinutes: number
): Promise<Course[]> => {
    const MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"];

    const candidateList = candidates.map((s, i) =>
        `${i}: ${s.name} (${s.category}, ※${s.estimatedStayTime || 30}分)`
    ).join('\n');

    const maxDining = durationMinutes <= 90 ? 1 : (durationMinutes <= 300 ? 2 : (durationMinutes <= 480 ? 3 : 4));
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
        "🌅 Morning/Evening Glow: 朝焼け・夕焼けが美しい場所"
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

**NEGATIVE CONSTRAINTS (MUST FOLLOW):**
- **DINING LIMIT**: For ${durationMinutes} min, you must have **MAX ${maxDining}** food/drink spots.
  - (If ${maxDining} is 1, do NOT include a Cafe AND a Restaurant. Choose only one.)
- **NO DUPLICATE SPOTS**: A spot used in Course 1 CANNOT be used in Course 2, 3, 4, or 5.
- **SPOT COUNT**: Each course should have approximately **${targetSpots} spots** to fill ${durationMinutes} minutes. NEVER make a course shorter than requested.

**IMPORTANT**: Dig deep into your knowledge for unique trivia.

**CRITICAL RULES:**
1. **Output MUST be valid JSON**.
2. **LANGUAGE**: Natural, Polite Japanese (Desu/Masu tone).
3. **ID MATCHING**: Use the exact integer IDs provided (0, 1, 2...).
4. **VARIETY & BALANCE**: Ensure a good mix. AVOID GENERIC SPOTS.
5. **DESCRIPTIONS (The Hook)**: Focus on Story, Legend, Atmosphere, Secret Tips.
6. **RICHER DETAILS (Required)**:
   - **stayTime**: Use the ※推定分数 shown next to each spot as a baseline. You may adjust ±10 min based on the spot's significance, but NEVER use the same stayTime for all spots.
   - **travel_time_minutes**: Estimate walking time from previous spot.
   - **must_see**: ONE specific thing to look for/do.
   - **pro_tip**: A savvy traveler tip.

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
                "pro_tip": "Specific tip..."
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
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            text = response.text();
            console.log(`✅ Model ${modelName} succeeded!`);
            break;
        } catch (err) {
            console.warn(`❌ Model ${modelName} failed:`, err instanceof Error ? err.message : err);
            lastError = err;
        }
    }

    if (!text) {
        console.error("All Gemini models failed. Last error:", lastError instanceof Error ? lastError.message : lastError);
        return [];
    }

    console.log("Gemini Raw Response:", text);

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text.replace(/```json |```/g, '').trim();

    interface GeminiSpot {
        id: number;
        stayTime: number;
        travel_time_minutes: number;
        recommendation_reason?: string;
        description?: string;
        must_see?: string;
        pro_tip?: string;
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
    } catch (e) {
        console.error("JSON Parse Error:", e, text);
        return [];
    }

    return coursesData.map(course => {
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
                pro_tip: s.pro_tip || null
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

            return { ...course, spots: sorted } as Course;
        }

        return { ...course, spots: hydratedSpots } as Course;
    });
};
