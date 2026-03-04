import { getDistance } from 'geolib';
import type { Spot, Course } from '../types';

interface ThemeDefinition {
    id: string;
    key: string;
    label: string;
    filter: (s: Spot) => boolean;
    desc: string;
}

export const generateCourses = (
    center: { lat: number; lon: number },
    allSpots: Spot[],
    durationMinutes: number
): Course[] => {
    const shuffle = <T>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

    const maxGourmet = durationMinutes <= 90 ? 1 : (durationMinutes <= 300 ? 2 : 3);

    const buildCourse = (
        id: string,
        title: string,
        desc: string,
        candidates: Spot[]
    ): Course | null => {
        const maxSpots = Math.min(Math.ceil(durationMinutes / 50), 20);
        let currentLoc: { latitude: number; longitude: number } = {
            latitude: center.lat,
            longitude: center.lon
        };
        let timeUsed = 0;
        let distUsed = 0;
        let gourmetCount = 0;
        const courseSpots: Spot[] = [];

        let available = shuffle(candidates).filter(s => s.lat && s.lon);

        while (timeUsed < durationMinutes && courseSpots.length < maxSpots && available.length > 0) {
            available.sort((a, b) => {
                const da = getDistance(currentLoc, { latitude: a.lat, longitude: a.lon });
                const db = getDistance(currentLoc, { latitude: b.lat, longitude: b.lon });
                return da - db;
            });

            const nextSpot = available[0];
            const dist = getDistance(currentLoc, { latitude: nextSpot.lat, longitude: nextSpot.lon });

            const walkTime = dist / 80;
            const stayTime = nextSpot.estimatedStayTime || 30;

            let skip = false;
            if (nextSpot.category === 'グルメ') {
                if (gourmetCount >= maxGourmet) skip = true;
            }

            if (!skip && (timeUsed + walkTime + stayTime) <= (durationMinutes * 1.1)) {
                courseSpots.push({
                    ...nextSpot,
                    travel_time_minutes: courseSpots.length === 0 ? 0 : Math.round(walkTime)
                });
                timeUsed += (walkTime + stayTime);
                distUsed += dist;
                if (nextSpot.category === 'グルメ') gourmetCount++;

                currentLoc = { latitude: nextSpot.lat, longitude: nextSpot.lon };
                available = available.filter(s => s.id !== nextSpot.id);
            } else {
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

    const themeDefinitions: ThemeDefinition[] = [
        { id: 'time_travel', key: 'Time Travel', label: '🕰️ Time Travel: 時代を感じる歴史旅', filter: s => s.category === '歴史' || s.category === 'アート', desc: '古き良き日本の風情と歴史のロマンを感じる旅。' },
        { id: 'nature', key: 'Nature', label: "🌿 Nature's Whisper: 静寂と緑", filter: s => s.category === '自然', desc: '都会の喧騒を離れ、自然の中で心を癒やすひととき。' },
        { id: 'urban', key: 'Urban', label: '🏙️ Urban Jungle: 都会の喧騒と魅力を歩く', filter: s => s.category === 'ショッピング' || s.category === 'グルメ', desc: '活気ある街のエネルギーと最新トレンドを体感。' },
        { id: 'spiritual', key: 'Spiritual', label: '⛩️ Spiritual Awakening: 神社仏閣とパワースポット', filter: s => s.category === '歴史', desc: '心身を清め、運気を上げるパワースポット巡り。' },
        { id: 'gourmet', key: 'Gourmet', label: '🍽️ Gourmet Adventure: 美食と食べ歩き', filter: s => s.category === 'グルメ', desc: '地元の美味しいものを探し求める食道楽の旅。' },
        { id: 'art', key: 'Art', label: '🎨 Art & Soul: アートとクリエイティブ', filter: s => s.category === 'アート' || !!s.tags.photo, desc: '感性を刺激するアートスポットとクリエイティブな空間。' },
        { id: 'hidden', key: 'Hidden', label: '💎 Hidden Gems: 地元民しか知らない穴場', filter: s => !s.user_ratings_total || s.user_ratings_total < 50, desc: '観光ガイドには載らない、知る人ぞ知る名店や旧跡。' },
        { id: 'photo', key: 'Photo', label: '📸 Photogenic: 思わず写真を撮りたくなる風景', filter: s => !!s.tags.photo || s.category === '自然' || s.category === 'アート', desc: 'SNS映え間違いなしの美しい風景と思い出作り。' },
        { id: 'retro', key: 'Retro', label: '☕ Retro Revival: 昭和レトロな純喫茶・路地裏', filter: s => s.category === 'グルメ' || s.category === '歴史', desc: '昭和の懐かしさが漂うノスタルジックな世界へ。' },
        { id: 'luxury', key: 'Luxury', label: '✨ Luxury & Leisure: ちょっぴり贅沢な大人の休日', filter: s => s.category === 'アート' || s.category === 'グルメ', desc: '優雅な時間を過ごす、大人ならではの贅沢プラン。' },
        { id: 'mystery', key: 'Mystery', label: '👻 Mystery & Legend: ちょっと怖い伝説・ミステリー', filter: s => s.category === '歴史', desc: '不思議な伝説やミステリアスな逸話が残る場所へ。' },
        { id: 'local', key: 'Local', label: '🛍️ Local Life: 商店街と地元民の暮らし', filter: s => s.category === 'ショッピング' || s.category === 'グルメ', desc: '地元に愛される商店街や日常の風景を歩く。' },
        { id: 'architecture', key: 'Arch', label: '🏛️ Architecture Walk: 名建築とユニークな建物', filter: s => s.category === '歴史' || s.category === 'アート', desc: '建物のデザインや構造美を楽しむ建築探訪。' },
        { id: 'silence', key: 'Silence', label: '🤫 Silence & Solitude: 究極の「おひとりさま」静寂', filter: s => s.category === '自然' || s.category === '歴史', desc: '誰にも邪魔されず、静かに自分と向き合う時間。' },
        { id: 'morning', key: 'Morning', label: '🌅 Morning/Evening Glow: 朝焼け・夕焼けが美しい場所', filter: s => s.category === '自然' || !!s.tags.photo, desc: '光と影が織りなす美しい瞬間を捉える旅。' }
    ];

    const selectedThemes = shuffle(themeDefinitions).slice(0, 5);
    const usedSpotIds = new Set<string | number>();

    const generatedCourses = selectedThemes.map(theme => {
        let themeCandidates = allSpots.filter(s => theme.filter(s) && !usedSpotIds.has(s.id));

        if (themeCandidates.length < 3) {
            themeCandidates = allSpots.filter(s => !usedSpotIds.has(s.id));
        }
        if (themeCandidates.length < 3) {
            themeCandidates = allSpots.filter(theme.filter);
        }

        const course = buildCourse(
            theme.id,
            theme.label.split(':')[1].trim(),
            theme.desc,
            themeCandidates
        );

        if (course) {
            course.theme = theme.label;
            course.spots.forEach(spot => usedSpotIds.add(spot.id));
        }
        return course;
    });

    return generatedCourses.filter((c): c is Course => c !== null);
};
