import { getDistance } from 'geolib';

/**
 * Generate 3 distinct model courses.
 */
export const generateCourses = (center, allSpots, durationMinutes) => {
    // Shuffle helper
    const shuffle = (array) => [...array].sort(() => Math.random() - 0.5);

    // Limit gourmet spots logic
    // Relaxed rule: Allow 2 spots (e.g. Lunch + Cafe) for anything > 90 mins
    const maxGourmet = durationMinutes <= 90 ? 1 : (durationMinutes <= 300 ? 2 : 3);

    // Helper to build a single course
    const buildCourse = (id, title, desc, candidates) => {
        let currentLoc = center;
        let timeUsed = 0;
        let distUsed = 0;
        let gourmetCount = 0;
        const courseSpots = [];

        // Copy candidates to modify
        let available = shuffle(candidates).filter(s => s.lat && s.lon);

        // Max 8 spots for realistic travel
        while (timeUsed < durationMinutes && courseSpots.length < 8 && available.length > 0) {
            // Find nearest neighbor strategy to avoid zig-zag
            available.sort((a, b) => {
                const da = getDistance(currentLoc, { latitude: a.lat, longitude: a.lon });
                const db = getDistance(currentLoc, { latitude: b.lat, longitude: b.lon });
                return da - db;
            });

            const nextSpot = available[0];
            const dist = getDistance(currentLoc, { latitude: nextSpot.lat, longitude: nextSpot.lon });

            // Walking 80m/min
            const walkTime = dist / 80;
            // Stay time depends on category
            let stayTime = 30; // default
            if (nextSpot.category === 'gourmet') stayTime = 60;
            if (nextSpot.category === 'history' || nextSpot.category === 'art') stayTime = 45;
            if (nextSpot.category === 'nature') stayTime = 40;

            // Check gourmet limit
            let skip = false;
            if (nextSpot.category === 'gourmet') {
                if (gourmetCount >= maxGourmet) skip = true;
            }

            // Allow slight time overrun (up to 10%) for the last spot to make it fit better
            if (!skip && (timeUsed + walkTime + stayTime) <= (durationMinutes * 1.1)) {
                courseSpots.push(nextSpot);
                timeUsed += (walkTime + stayTime);
                distUsed += dist;
                if (nextSpot.category === 'gourmet') gourmetCount++;

                currentLoc = { latitude: nextSpot.lat, longitude: nextSpot.lon };

                // Remove this spot ID from future availability in this course
                available = available.filter(s => s.id !== nextSpot.id);
            } else {
                // If it clearly doesn't fit or skipped, remove to check next nearest
                available.shift();
            }
        }

        if (courseSpots.length === 0) return null;

        return {
            id,
            title,
            description: desc,
            spots: courseSpots,
            totalTime: Math.round(timeUsed),
            totalDistance: Math.round(distUsed)
        };
    };

    // --- Dynamic Theme Definitions ---
    const themeDefinitions = [
        { id: 'time_travel', key: 'Time Travel', label: '🕰️ Time Travel: 時代を感じる歴史旅', filter: s => s.category === 'history' || s.category === 'art', desc: '古き良き日本の風情と歴史のロマンを感じる旅。' },
        { id: 'nature', key: 'Nature', label: '🌿 Nature\'s Whisper: 静寂と緑', filter: s => s.category === 'nature', desc: '都会の喧騒を離れ、自然の中で心を癒やすひととき。' },
        { id: 'urban', key: 'Urban', label: '🏙️ Urban Jungle: 都会の喧騒と魅力を歩く', filter: s => s.category === 'shopping' || s.category === 'gourmet', desc: '活気ある街のエネルギーと最新トレンドを体感。' },
        { id: 'spiritual', key: 'Spiritual', label: '⛩️ Spiritual Awakening: 神社仏閣とパワースポット', filter: s => s.category === 'history', desc: '心身を清め、運気を上げるパワースポット巡り。' },
        { id: 'gourmet', key: 'Gourmet', label: '🍽️ Gourmet Adventure: 美食と食べ歩き', filter: s => s.category === 'gourmet', desc: '地元の美味しいものを探し求める食道楽の旅。' },
        { id: 'art', key: 'Art', label: '🎨 Art & Soul: アートとクリエイティブ', filter: s => s.category === 'art' || s.tags.photo, desc: '感性を刺激するアートスポットとクリエイティブな空間。' },
        { id: 'hidden', key: 'Hidden', label: '💎 Hidden Gems: 地元民しか知らない穴場', filter: s => (!s.user_ratings_total || s.user_ratings_total < 50), desc: '観光ガイドには載らない、知る人ぞ知る名店や旧跡。' },
        { id: 'photo', key: 'Photo', label: '📸 Photogenic: 思わず写真を撮りたくなる風景', filter: s => s.tags.photo || s.category === 'nature' || s.category === 'art', desc: 'SNS映え間違いなしの美しい風景と思い出作り。' },
        { id: 'retro', key: 'Retro', label: '☕ Retro Revival: 昭和レトロな純喫茶・路地裏', filter: s => s.category === 'gourmet' || s.category === 'history', desc: '昭和の懐かしさが漂うノスタルジックな世界へ。' },
        { id: 'luxury', key: 'Luxury', label: '✨ Luxury & Leisure: ちょっぴり贅沢な大人の休日', filter: s => s.category === 'art' || s.category === 'gourmet', desc: '優雅な時間を過ごす、大人ならではの贅沢プラン。' },
        { id: 'mystery', key: 'Mystery', label: '👻 Mystery & Legend: ちょっと怖い伝説・ミステリー', filter: s => s.category === 'history', desc: '不思議な伝説やミステリアスな逸話が残る場所へ。' },
        { id: 'local', key: 'Local', label: '🛍️ Local Life: 商店街と地元民の暮らし', filter: s => s.category === 'shopping' || s.category === 'gourmet', desc: '地元に愛される商店街や日常の風景を歩く。' },
        { id: 'architecture', key: 'Arch', label: '🏛️ Architecture Walk: 名建築とユニークな建物', filter: s => s.category === 'history' || s.category === 'art', desc: '建物のデザインや構造美を楽しむ建築探訪。' },
        { id: 'silence', key: 'Silence', label: '🤫 Silence & Solitude: 究極の「おひとりさま」静寂', filter: s => s.category === 'nature' || s.category === 'history', desc: '誰にも邪魔されず、静かに自分と向き合う時間。' },
        { id: 'morning', key: 'Morning', label: '🌅 Morning/Evening Glow: 朝焼け・夕焼けが美しい場所', filter: s => s.category === 'nature' || s.tags.photo, desc: '光と影が織りなす美しい瞬間を捉える旅。' }
    ];

    // Select 5 distinct themes randomly
    const selectedThemes = shuffle(themeDefinitions).slice(0, 5);

    // Track used spot IDs to prevent duplicates across courses
    const usedSpotIds = new Set();

    const generatedCourses = selectedThemes.map(theme => {
        // Filter candidates based on theme logic
        // EXCLUDE spots that have already been used in previous courses
        let themeCandidates = allSpots.filter(s => theme.filter(s) && !usedSpotIds.has(s.id));

        // If strict filtering yields too few results (< 3), relax:
        // 1. Try tracking-only filter (any spot not used yet)
        if (themeCandidates.length < 3) {
            themeCandidates = allSpots.filter(s => !usedSpotIds.has(s.id));
        }
        // 2. If still too few (pool exhausted), forced reuse (last resort)
        if (themeCandidates.length < 3) {
            themeCandidates = allSpots.filter(theme.filter);
        }

        const course = buildCourse(
            theme.id,
            theme.label.split(':')[1].trim(), // Title part
            theme.desc,
            themeCandidates
        );

        if (course) {
            course.theme = theme.label; // Attach theme label
            // Mark these spots as used
            course.spots.forEach(spot => usedSpotIds.add(spot.id));
        }
        return course;
    });

    return generatedCourses.filter(Boolean);
};
