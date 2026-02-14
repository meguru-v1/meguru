import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; // Reusing the same env var name as user put it there
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

    // Helper to generate content with or without tools
    const generate = async (useTools = true) => {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            tools: useTools ? [{ googleSearch: {} }] : undefined,
            // strict JSON only works if tools are disabled, so we rely on regex for both to be safe/consistent
        });

        const candidateList = candidates.map((s, i) =>
            `${i}: ${s.name} (${s.category})`
        ).join('\n');

        // Calculate max dining spots based on duration
        // Relaxed rule: Allow 2 spots (e.g. Lunch + Cafe) for anything > 90 mins
        const maxDining = durationMinutes <= 90 ? 1 : (durationMinutes <= 300 ? 2 : 3);

        // --- DYNAMIC THEME SELECTION ---
        // Using the exact Japanese nuances the user requested
        const allThemes = [
            "🕰️ Time Travel: 時代を感じる歴史旅",
            "🌿 Nature's Whisper: 静寂と緑",
            "🏙️ Urban Jungle: 都会の喧騒と魅力を歩く",
            "⛩️ Spiritual Awakening: 神社仏閣とパワースポット",
            "🍽️ Gourmet Adventure: 美食と食べ歩き（※食事回数制限注意）",
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

        // Shuffle and pick 5 distinct themes
        const selectedThemes = allThemes.sort(() => 0.5 - Math.random()).slice(0, 5);
        const themeInstructions = selectedThemes.map((theme, i) => `   Course ${i + 1}: Based strictly on theme "${theme}"`).join('\n');

        const prompt = `
        You are an expert, high-end travel concierge for Kyoto/Japan.
        Your client has ${durationMinutes} minutes to spend starting from a specific location.
        
        Here is a list of candidate spots nearby (ID: Name (Category)):
        ${candidateList}

        **YOUR MISSION:**
        Create 5 distinct, **exciting** model courses.
        **EACH COURSE MUST FOLLOW A SPECIFIC THEME SELECTED BELOW:**
        ${themeInstructions}
        
        **The user feels standard courses are boring.** You must surprise them.
        
        **NEGATIVE CONSTRAINTS (MUST FOLLOW):**
        - **DINING LIMIT**: For ${durationMinutes} min, you must have **MAX ${maxDining}** food/drink spot. 
          - (If ${maxDining} is 1, do NOT include a Cafe AND a Restaurant. Choose only one.)
          - If you violate this, the system will crash.
        - **NO DUPLICATE SPOTS**: 
          - **A spot used in Course 1 CANNOT be used in Course 2, 3, 4, or 5.**
          - Each of the 5 courses must feature **completely different locations**.
          - Exception: Large major landmarks (like Kyoto Station) can be start points, but try to vary the main attractions.
        
        ${useTools ? '**CRITICAL**: Use **Google Search Tool** to find "hidden gems", "local legends", or "unique oddities" about these spots.' : '**IMPORTANT**: Dig deep into your knowledge for unique trivia.'}
        
        **CRITICAL RULES:**
        1. **Output MUST be valid JSON (at the end)**.
        2. **LANGUAGE**: Natural, Polite Japanese (Desu/Masu tone).
        3. **ID MATCHING**: Use the exact integer IDs provided (0, 1, 2...).
        4. **VARIETY & BALANCE**:
           - **DO NOT** select only restaurants or only parks.
           - **STRICT LIMIT**: You must include **AT MOST ${maxDining}** dining/food spots (Restaurants, Cafes, Izakaya).
           - Ensure a good mix (e.g., Shrine + Cafe + Shop + Nature).
           - **AVOID GENERIC SPOTS**: If you pick a famous spot, find a **unique angle** (e.g. not just "Kiyomizu-dera", but "The specific statue to touch for love luck").
        5. **DESCRIPTIONS (The Hook)**:
           - **DO NOT** write "It is a famous temple." (Boring!)
           - **WRITE**: "Known for the 'Dragon Ceiling' that roars when you clap your hands." (Interesting!)
           - Focus on: **Story, Legend, Atmosphere, Secret Tips**.
        6. **RICHER DETAILS (Required)**:
           - **travel_time_minutes**: Estimate walking time from previous spot (0 for start).
           - **must_see**: ONE specific thing to look for/do (e.g., "Find the turtle statue").
           - **pro_tip**: A savvy traveler tip (e.g., "Go before 9AM to avoid crowds").

        **JSON SCHEMA:**
        [
          {
            "id": "theme_id_1", 
            "title": "Title including Theme Name (e.g., 【Time Travel】Kyoto History Walk)", 
            "theme": "The assigned theme string (e.g. 🕰️ Time Travel...)",
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

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    };

    let text;
    try {
        // First attempt: With Google Search Grounding
        console.log("Attempting generation with Google Search...");
        text = await generate(true);
    } catch (error) {
        console.warn("Google Search generation failed (likely 429 or timeout). Falling back to standard model.", error);

        // Second attempt: Without tools (Standard Model)
        try {
            console.log("Attempting standard generation...");
            text = await generate(false);
        } catch (retryError) {
            console.error("Standard generation also failed:", retryError);
            return []; // Give up
        }
    }

    console.log("Gemini Raw Response:", text); // Debug log

    // Robust parsing: Find the first '[' and the last ']' to extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text.replace(/```json|```/g, '').trim();

    let coursesData;
    try {
        coursesData = JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error:", e, text);
        // If parsing fails, we could potentially try to repair it, but returning empty for now is safer
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
                aiDescription: s.recommendation_reason || s.description
            };
        }).filter(Boolean);

        return {
            ...course,
            spots: hydratedSpots
        };
    });
};
