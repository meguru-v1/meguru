import React, { useState, useEffect, useRef } from 'react';
import {
    Search, MapPin, Clock, Compass, Navigation, ArrowRight, Car, Footprints, Bike, Train, ArrowDown,
    Smile, Banknote, Users, Sparkles, Loader2
} from 'lucide-react';
import type { SearchParams, SearchMode, TravelMode, AutocompleteResult } from '../types';
import { getAutocompleteSuggestions } from '../lib/places';

interface SearchInterfaceProps {
    onSearch: (params: SearchParams) => void;
}

const TRAVEL_MODES: { id: TravelMode; label: string; icon: React.ElementType }[] = [
    { id: 'walk', label: '徒歩', icon: Footprints },
    { id: 'bicycle', label: '自転車', icon: Bike },
    { id: 'transit', label: '公共交通', icon: Train },
    { id: 'car', label: '車', icon: Car },
];

const SearchInterface: React.FC<SearchInterfaceProps> = ({ onSearch }) => {
    const [searchMode, setSearchMode] = useState<SearchMode>('area');
    const [query, setQuery] = useState('');
    const [queryPlaceId, setQueryPlaceId] = useState('');
    const [destination, setDestination] = useState('');
    const [destinationPlaceId, setDestinationPlaceId] = useState('');
    const [radius, setRadius] = useState(1);
    const [duration, setDuration] = useState(180);
    const [travelMode, setTravelMode] = useState<TravelMode>('walk');
    const [mood, setMood] = useState('');
    const [budget, setBudget] = useState('');
    const [groupSize, setGroupSize] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // オートコンプリート用の状態
    const [suggestions, setSuggestions] = useState<AutocompleteResult[]>([]);
    const [activeInput, setActiveInput] = useState<'query' | 'destination' | null>(null);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    
    // デバウンス用タイマー
    const debounceTimer = useRef<any>(null);

    // 現在地の取得 (バイアス用)
    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {/* ignore errors */},
            { enableHighAccuracy: false, timeout: 5000 }
        );
    }, []);

    // 検索候補の取得
    const fetchSuggestions = (input: string, type: 'query' | 'destination') => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        
        if (!input.trim() || input.length < 2) {
            setSuggestions([]);
            return;
        }

        setIsLoadingSuggestions(true);
        debounceTimer.current = setTimeout(async () => {
            const results = await getAutocompleteSuggestions(
                input, 
                userLocation?.lat, 
                userLocation?.lng
            );
            setSuggestions(results);
            setActiveInput(type);
            setIsLoadingSuggestions(false);
        }, 400);
    };

    const handleSelectSuggestion = (s: AutocompleteResult) => {
        if (activeInput === 'query') {
            setQuery(s.mainText);
            setQueryPlaceId(s.placeId);
        } else if (activeInput === 'destination') {
            setDestination(s.mainText);
            setDestinationPlaceId(s.placeId);
        }
        setSuggestions([]);
        setActiveInput(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        if (searchMode === 'route' && !destination.trim()) return;
        setIsSearching(true);
        onSearch({
            searchMode, 
            query, 
            radius: radius * 1000, 
            duration,
            destination: searchMode === 'route' ? destination : undefined,
            queryPlaceId: queryPlaceId || undefined,
            destinationPlaceId: destinationPlaceId || undefined,
            travelMode,
            mood: mood || undefined,
            budget: budget || undefined,
            groupSize: groupSize || undefined,
        });
        setTimeout(() => setIsSearching(false), 1000);
    };

    return (
        <div className="w-full flex flex-col bg-white">
            {/* ヘッダー部分は省略 */}
            <div className="text-center pt-14 pb-2 px-6 animate-fade-in">
                <div className="inline-block mb-3 animate-float">
                    <div className="w-12 h-12 mx-auto bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
                        <Compass size={24} className="text-amber-400" />
                    </div>
                </div>
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
                    Meguru
                </h1>
                <p className="text-slate-400 text-sm font-light tracking-wide">あなたのための、特別なよりみち。</p>
            </div>

            {/* モード切り替え */}
            <div className="px-6 mt-4 mb-5 animate-slide-up">
                <div className="flex rounded-xl p-1 gap-1 bg-slate-100">
                    <button type="button" onClick={() => setSearchMode('area')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-300
                            ${searchMode === 'area' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <Compass size={13} className="inline mr-1.5 -mt-0.5" /> エリア検索
                    </button>
                    <button type="button" onClick={() => setSearchMode('route')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-300
                            ${searchMode === 'route' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <ArrowRight size={13} className="inline mr-1.5 -mt-0.5" /> ルート検索
                    </button>
                </div>
            </div>

            {/* フォーム */}
            <form onSubmit={handleSubmit} className="flex flex-col px-6 pb-4">
                <div className="flex-1 flex flex-col justify-start space-y-5 pt-2 pb-6">
                    {searchMode === 'area' && (
                        <>
                            <div className="space-y-2 animate-slide-up">
                                <label htmlFor="area-query" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                    出発地点
                                </label>
                                <div className="relative">
                                    <input id="area-query" name="area-query" type="text" value={query} 
                                        onChange={(e) => { setQuery(e.target.value); setQueryPlaceId(''); fetchSuggestions(e.target.value, 'query'); }}
                                        onFocus={() => query.length >= 2 && fetchSuggestions(query, 'query')}
                                        placeholder="例: 京都駅、浅草寺..." className="input-premium text-base" />
                                    {isLoadingSuggestions && activeInput === 'query' && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                            <Loader2 size={16} className="animate-spin text-slate-300" />
                                        </div>
                                    )}
                                    {activeInput === 'query' && suggestions.length > 0 && (
                                        <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-scale-in">
                                            {suggestions.map(s => (
                                                <button key={s.placeId} type="button" onClick={() => handleSelectSuggestion(s)}
                                                    className="w-full flex flex-col items-start px-5 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 text-left">
                                                    <span className="text-sm font-bold text-slate-800">{s.mainText}</span>
                                                    <span className="text-[10px] text-slate-400 truncate w-full">{s.secondaryText}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2 animate-slide-up stagger-1">
                                <label htmlFor="area-radius" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Compass size={12} /> 範囲
                                    <span className="ml-auto text-amber-500 font-extrabold text-sm normal-case">{radius} km</span>
                                </label>
                                <input id="area-radius" name="area-radius" type="range" min="0.5" max="7" step="0.5" value={radius}
                                    onChange={(e) => setRadius(parseFloat(e.target.value))} className="w-full" />
                                <div className="flex justify-between text-[10px] text-slate-300 font-medium"><span>0.5km</span><span>7.0km</span></div>
                            </div>
                        </>
                    )}

                    {searchMode === 'route' && (
                        <div className="space-y-3 animate-slide-up">
                            <div className="relative">
                                <label htmlFor="route-origin" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">出発地</label>
                                <input id="route-origin" name="route-origin" type="text" value={query} 
                                    onChange={(e) => { setQuery(e.target.value); setQueryPlaceId(''); fetchSuggestions(e.target.value, 'query'); }}
                                    onFocus={() => query.length >= 2 && fetchSuggestions(query, 'query')}
                                    placeholder="例: 京都駅" className="input-premium text-sm py-3" />
                                {activeInput === 'query' && suggestions.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                                        {suggestions.map(s => (
                                            <button key={s.placeId} type="button" onClick={() => handleSelectSuggestion(s)}
                                                className="w-full flex flex-col items-start px-5 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 text-left">
                                                <span className="text-sm font-bold text-slate-800">{s.mainText}</span>
                                                <span className="text-[11px] text-slate-400 truncate w-full">{s.secondaryText}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col items-center justify-center gap-0 pointer-events-none z-10">
                                <ArrowDown size={16} className="text-slate-300 -my-2 bg-white rounded-full" />
                            </div>
                            <div className="relative">
                                <label htmlFor="route-destination" className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mb-1 block">目的地</label>
                                <input id="route-destination" name="route-destination" type="text" value={destination} 
                                    onChange={(e) => { setDestination(e.target.value); setDestinationPlaceId(''); fetchSuggestions(e.target.value, 'destination'); }}
                                    onFocus={() => destination.length >= 2 && fetchSuggestions(destination, 'destination')}
                                    placeholder="例: 嵐山" className="input-premium text-sm py-3" />
                                {activeInput === 'destination' && suggestions.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                                        {suggestions.map(s => (
                                            <button key={s.placeId} type="button" onClick={() => handleSelectSuggestion(s)}
                                                className="w-full flex flex-col items-start px-5 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 text-left">
                                                <span className="text-sm font-bold text-slate-800">{s.mainText}</span>
                                                <span className="text-[11px] text-slate-400 truncate w-full">{s.secondaryText}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 共通のオプション（移動方法） */}
                    <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">移動方法</label>
                        <div className="grid grid-cols-4 gap-2">
                            {TRAVEL_MODES.map(mode => {
                                const isActive = travelMode === mode.id;
                                return (
                                    <button key={mode.id} type="button" onClick={() => setTravelMode(mode.id)}
                                        className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 transition-all duration-300 active:scale-95
                                            ${isActive ? 'border-amber-400 bg-white text-slate-900 shadow-sm' : 'border-transparent bg-transparent text-slate-400 hover:text-slate-600'}`}>
                                        <mode.icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
                                        <span className="text-[10px] font-bold">{mode.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 共通のオプション（よりみち時間） */}
                    <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <label htmlFor="duration-slider" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Clock size={12} /> よりみち時間
                            <span className="ml-auto text-amber-500 font-extrabold text-sm normal-case">{duration} 分</span>
                        </label>
                        <input id="duration-slider" name="duration-slider" type="range" min="30" max="720" step="30" value={duration}
                            onChange={(e) => setDuration(parseInt(e.target.value))} className="w-full" />
                        <div className="flex justify-between text-[10px] text-slate-300 font-medium pb-1"><span>30分</span><span>12時間</span></div>
                    </div>

                    {/* パーソナライズ設定 */}
                    <div className="space-y-4 pt-2">
                        {/* 気分 */}
                        <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Smile size={12} /> 今日の気分
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {['のんびり', 'アクティブ', 'ロマンチック', '知的探究'].map(m => (
                                    <button key={m} type="button" onClick={() => setMood(mood === m ? '' : m)}
                                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all
                                            ${mood === m ? 'bg-slate-900 text-white shadow-md scale-105' : 'bg-white text-slate-500 border border-slate-100'}`}>
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 予算 */}
                        <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Banknote size={12} /> 予算感
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {['節約', '標準', 'リッチ'].map(b => (
                                    <button key={b} type="button" onClick={() => setBudget(budget === b ? '' : b)}
                                        className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all
                                            ${budget === b ? 'bg-amber-500 text-white shadow-md scale-105' : 'bg-white text-slate-500 border border-slate-100'}`}>
                                        {b}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 人数/連れ */}
                        <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Users size={12} /> 誰と行く？
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {['一人旅', 'デート', '友達', '家族'].map(g => (
                                    <button key={g} type="button" onClick={() => setGroupSize(groupSize === g ? '' : g)}
                                        className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all
                                            ${groupSize === g ? 'bg-indigo-500 text-white shadow-md scale-105' : 'bg-white text-slate-500 border border-slate-100'}`}>
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <button type="submit" disabled={isSearching}
                    className="w-full btn-primary flex items-center justify-center gap-2.5 py-4 text-base font-bold rounded-xl mt-2 mb-8">
                    {isSearching ? (<span className="animate-pulse">コース作成中...</span>) : (
                        <><span>{searchMode === 'area' ? '旅を始める' : 'ルートを作成'}</span><Navigation size={18} /></>
                    )}
                </button>
            </form>
        </div>
    );
};

export default SearchInterface;
