import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * Generates 3 model courses using Gemini API based on available spots.
 * 
 * @param {Array} candidates - List of spots with {name, lat, lon, category, tags}
 * @param {Object} center - Start location {lat, lon}
 * @param {number} durationMinutes - Total duration
 * @returns {Promise<Array>} - List of 3 course objects
 */
export const generateSmartCourses = async (candidates, center, durationMinutes) => {
    // Models to try in order (2.5-flash-lite works in hinowa on same project)
    const MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"];

    // Build prompt (same for all models)
    const candidateList = candidates.map((s, i) =>
        `${i}: ${s.name} (${s.category})`
    ).join('\n');

    const maxDining = durationMinutes <= 90 ? 1 : (durationMinutes <= 300 ? 2 : 3);

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
- **DINING LIMIT**: For ${durationMinutes} min, you must have **MAX ${maxDining}** food/drink spot.
  - (If ${maxDining} is 1, do NOT include a Cafe AND a Restaurant. Choose only one.)
- **NO DUPLICATE SPOTS**: A spot used in Course 1 CANNOT be used in Course 2, 3, 4, or 5.

**IMPORTANT**: Dig deep into your knowledge for unique trivia.

**CRITICAL RULES:**
1. **Output MUST be valid JSON**.
2. **LANGUAGE**: Natural, Polite Japanese (Desu/Masu tone).
3. **ID MATCHING**: Use the exact integer IDs provided (0, 1, 2...).
4. **VARIETY & BALANCE**: Ensure a good mix. AVOID GENERIC SPOTS.
5. **DESCRIPTIONS (The Hook)**: Focus on Story, Legend, Atmosphere, Secret Tips.
6. **RICHER DETAILS (Required)**:
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
        "totalTime": 180,
        "spots": [
            {
                "id": 12,
                "stayTime": 45,
                "travel_time_minutes": 10,
                "recommendation_reason": "Specific reason...",
                "must_see": "Specific highlight...",
                "pro_tip": "Specific tip..."
            }
        ]
    }
]
    `;

    // Try each model in order until one succeeds
    let text;
    console.log("Attempting Gemini generation...");
    console.log("API Key present:", !!API_KEY, "Key prefix:", API_KEY ? API_KEY.substring(0, 10) + '...' : 'MISSING');

    let lastError;
    for (const modelName of MODELS) {
        try {
            console.log(`Trying model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            text = response.text();
            console.log(`✅ Model ${modelName} succeeded!`);
            break; // Success, exit the loop
        } catch (err) {
            console.warn(`❌ Model ${modelName} failed:`, err.message || err);
            lastError = err;
        }
    }

    if (!text) {
        console.error("All Gemini models failed. Last error:", lastError?.message);
        return [];
    }

    console.log("Gemini Raw Response:", text);

    // Robust parsing: Find the first '[' and the last ']' to extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text.replace(/```json | ```/g, '').trim();

    let coursesData;
    try {
        coursesData = JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error:", e, text);
        return [];
    }

    // Hydrate the spots with original data
    return coursesData.map(course => {
        const hydratedSpots = course.spots.map(s => {
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
            };
        }).filter(Boolean);

        // Sort spots by nearest-neighbor for proper walking order
        if (hydratedSpots.length > 1) {
            const sorted = [hydratedSpots[0]];
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

            // Calculate travel_time_minutes between consecutive spots
            for (let i = 0; i < sorted.length; i++) {
                if (i === 0) {
                    sorted[i].travel_time_minutes = 0;
                } else {
                    const prev = sorted[i - 1];
                    const dx = (sorted[i].lat - prev.lat) * 111000;
                    const dy = (sorted[i].lon - prev.lon) * 111000 * Math.cos(prev.lat * Math.PI / 180);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    sorted[i].travel_time_minutes = Math.round(dist / 80); // 80m/min walking
                }
            }

            return { ...course, spots: sorted };
        }

        return { ...course, spots: hydratedSpots };
    });
};
