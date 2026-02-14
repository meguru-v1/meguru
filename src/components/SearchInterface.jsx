import React, { useState } from 'react';
import { Search, MapPin, Clock, Compass, Navigation } from 'lucide-react';


const SearchInterface = ({ onSearch }) => {
    const [query, setQuery] = useState('');
    const [radius, setRadius] = useState(1); // km
    const [duration, setDuration] = useState(180); // minutes (default 3h)
    const [isSearching, setIsSearching] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        // Simulate API call delay for UX or just pass up
        onSearch({ query, radius: radius * 1000, duration }); // radius in meters
        setTimeout(() => setIsSearching(false), 1000);
    };

    return (
        <div
            className="glass-panel p-8 max-w-md w-full mx-auto relative z-10"
        >
            <div className="text-center mb-8">
                <h1 className="text-3xl font-serif font-bold text-slate-800 mb-2">Meguru</h1>
                <p className="text-slate-500 text-sm">あなたのための、特別なよりみち。</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Location Input */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <MapPin size={14} /> 出発地点 (駅・バス停)
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="例: 京都駅、浅草寺..."
                            className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-medium text-slate-700 placeholder-slate-400"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    </div>
                </div>

                {/* Radius Slider */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Compass size={14} /> 探索範囲: {radius} km
                    </label>
                    <input
                        type="range"
                        min="0.5"
                        max="7"
                        step="0.5"
                        value={radius}
                        onChange={(e) => setRadius(parseFloat(e.target.value))}
                        className="w-full accent-slate-900 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                        <span>徒歩圏内 (0.5km)</span>
                        <span>広範囲 (7km)</span>
                    </div>
                </div>

                {/* Duration Input */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={14} /> 所要時間 (分)
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            min="30"
                            max="720"
                            step="30"
                            value={duration}
                            onChange={(e) => setDuration(parseInt(e.target.value))}
                            className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-medium text-slate-700 placeholder-slate-400"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">分</span>
                    </div>
                    <p className="text-[10px] text-slate-400 text-right">30分〜720分 (12時間) で指定</p>
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={isSearching}
                    className="w-full btn-primary flex items-center justify-center gap-2 mt-4"
                >
                    {isSearching ? (
                        <span className="animate-pulse">コースを作成中...</span>
                    ) : (
                        <>
                            <span>旅を始める</span>
                            <Navigation size={18} />
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};

export default SearchInterface;
