export type WeatherTag = 'rainy' | 'snowy' | 'hot' | 'cold' | 'normal' | 'unknown';

export interface WeatherInfo {
    text: string;        // 「快晴」「雨」など人間向け表現
    tag: WeatherTag;     // AI判断用タグ
    temperatureC: number | null;
}

export async function getCurrentWeather(lat: number, lon: number): Promise<string> {
    const info = await getCurrentWeatherDetailed(lat, lon);
    return info.text;
}

export async function getCurrentWeatherDetailed(lat: number, lon: number): Promise<WeatherInfo> {
    try {
        // Open-Meteo API: weather_code + temperature_2m を一括取得
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) {
            console.warn("Weather API failed:", res.statusText);
            return { text: "不明", tag: 'unknown', temperatureC: null };
        }
        const data = await res.json();

        let code: number | undefined;
        let temp: number | null = null;

        if (data?.current?.weather_code !== undefined) {
            code = data.current.weather_code;
            temp = data.current.temperature_2m ?? null;
        } else if (data?.current_weather?.weathercode !== undefined) {
            code = data.current_weather.weathercode;
            temp = data.current_weather.temperature ?? null;
        }

        if (code === undefined) {
            return { text: "不明", tag: 'unknown', temperatureC: temp };
        }

        const text = getWeatherConditionFromCode(code);
        const tag = deriveWeatherTag(code, temp);
        return { text, tag, temperatureC: temp };
    } catch (e) {
        console.warn("Error fetching weather:", e);
        return { text: "不明", tag: 'unknown', temperatureC: null };
    }
}

// WMO Weather interpretation codes
// https://open-meteo.com/en/docs
function getWeatherConditionFromCode(code: number): string {
    if (code === 0) return "快晴";
    if (code === 1 || code === 2 || code === 3) return "晴れ時々曇り";
    if (code === 45 || code === 48) return "霧";
    if (code >= 51 && code <= 55) return "霧雨";
    if (code >= 56 && code <= 57) return "氷雨";
    if (code >= 61 && code <= 65) return "雨";
    if (code >= 66 && code <= 67) return "冷たい雨";
    if (code >= 71 && code <= 75) return "雪";
    if (code === 77) return "雪あられ";
    if (code >= 80 && code <= 82) return "にわか雨";
    if (code >= 85 && code <= 86) return "雪やあられ";
    if (code >= 95) return "雷雨";
    return "不明";
}

function deriveWeatherTag(code: number, tempC: number | null): WeatherTag {
    // 降雪・雪あられ
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snowy';
    // 降雨・霧雨・雷雨・氷雨
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rainy';
    // 気温ベース
    if (tempC !== null) {
        if (tempC > 30) return 'hot';
        if (tempC < 5) return 'cold';
    }
    return 'normal';
}
