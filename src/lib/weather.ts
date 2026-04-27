export async function getCurrentWeather(lat: number, lon: number): Promise<string> {
    try {
        // Open-Meteo API: https://open-meteo.com/en/docs
        // 新API形式: current=weather_code を使用 (current_weather=true は非推奨)
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) {
            console.warn("Weather API failed:", res.statusText);
            return "不明";
        }
        const data = await res.json();

        if (data?.current?.weather_code !== undefined) {
            return getWeatherConditionFromCode(data.current.weather_code);
        }
        // フォールバック: 旧形式のレスポンスにも対応
        if (data?.current_weather?.weathercode !== undefined) {
            return getWeatherConditionFromCode(data.current_weather.weathercode);
        }
        return "不明";
    } catch (e) {
        console.warn("Error fetching weather:", e);
        return "不明";
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
