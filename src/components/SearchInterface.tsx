import React, { useState, useEffect, useRef } from 'react';
import {
    Search, MapPin, Clock, Navigation, ArrowRight, Car, Footprints, Bike, Train, ArrowDown,
    Smile, Banknote, Users, Sparkles, Loader2, Compass, LocateFixed, Zap, Sun, CalendarDays
} from 'lucide-react';
import type { SearchParams, SearchMode, TravelMode, AutocompleteResult, PersonaId } from '../types';
import { getAutocompleteSuggestions } from '../lib/places';

// ===== ペルソナ定義 =====
const PERSONAS: { id: PersonaId; kanji: string; label: string; theme: string; color: string }[] = [
    { id: 'miyabi', kanji: '雅', label: 'コンシェルジュ', theme: '王道の旅', color: 'from-amber-500 to-amber-700' },
    { id: 'shiki',  kanji: '識', label: 'ストーリーテラー', theme: '歴史の旅', color: 'from-indigo-500 to-indigo-700' },
    { id: 'ei',     kanji: '映', label: 'フォトグラファー', theme: '美景の旅', color: 'from-rose-400 to-rose-600' },
    { id: 'aji',    kanji: '味', label: 'エピキュリアン', theme: '美食の旅', color: 'from-orange-400 to-orange-600' },
    { id: 'sei',    kanji: '静', label: 'ナビゲーター', theme: '静寂の旅', color: 'from-emerald-500 to-emerald-700' },
    { id: 'un',     kanji: '運', label: 'アドバイザー', theme: '開運の旅', color: 'from-purple-500 to-purple-700' },
];

// ===== 探索モード定義 =====
type ExploreMode = 'quick' | 'fullday' | 'multiday';

const EXPLORE_MODES: { id: ExploreMode; label: string; sub: string; icon: React.ElementType; minDuration: number; maxDuration: number; defaultDuration: number; minRadius: number; maxRadius: number; defaultRadius: number; step: number }[] = [
    { id: 'quick',    label: 'クイック散策', sub: '1〜5時間', icon: Zap,          minDuration: 60,  maxDuration: 300,  defaultDuration: 120,  minRadius: 0.5, maxRadius: 2,  defaultRadius: 1,   step: 30 },
    { id: 'fullday',  label: '1日トラベル',  sub: '6〜12時間', icon: Sun,          minDuration: 360, maxDuration: 720,  defaultDuration: 480,  minRadius: 2,   maxRadius: 7,  defaultRadius: 3.5, step: 30 },
    { id: 'multiday', label: '連泊プラン',   sub: '2〜3日',    icon: CalendarDays, minDuration: 720, maxDuration: 2160, defaultDuration: 1440, minRadius: 5,   maxRadius: 15, defaultRadius: 8,   step: 60 },
];

interface SearchInterfaceProps {
    onSearch: (params: SearchParams) => void;
}

const TRAVEL_MODES: { id: TravelMode; label: string; icon: React.ElementType }[] = [
    { id: 'walk', label: '徒歩', icon: Footprints },
    { id: 'bicycle', label: '自転車', icon: Bike },
    { id: 'transit', label: '電車', icon: Train },
    { id: 'car', label: '車', icon: Car },
];

const SearchInterface: React.FC<SearchInterfaceProps> = ({ onSearch }) => {
    const [searchMode, setSearchMode] = useState<SearchMode>('area');
    const [exploreMode, setExploreMode] = useState<ExploreMode>('quick');
    const [query, setQuery] = useState('');
    const [queryPlaceId, setQueryPlaceId] = useState('');
    const [destination, setDestination] = useState('');
    const [destinationPlaceId, setDestinationPlaceId] = useState('');
    const [radius, setRadius] = useState(1);
    const [duration, setDuration] = useState(120);
    const [travelMode, setTravelMode] = useState<TravelMode>('walk');
    const [mood, setMood] = useState('');
    const [budget, setBudget] = useState('');
    const [groupSize, setGroupSize] = useState('');
    const [persona, setPersona] = useState<PersonaId | undefined>(undefined);
    const [startTime, setStartTime] = useState('');  // HH:MM format, empty = auto
    const [isSearching, setIsSearching] = useState(false);

    // オートコンプリート
    const [suggestions, setSuggestions] = useState<AutocompleteResult[]>([]);
    const [activeInput, setActiveInput] = useState<'query' | 'destination' | null>(null);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    const debounceTimer = useRef<any>(null);

    // GPS
    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {},
            { enableHighAccuracy: false, timeout: 5000 }
        );
    }, []);

    // 探索モード変更時に連動して時間・半径のデフォルトをセット
    const handleExploreModeChange = (mode: ExploreMode) => {
        setExploreMode(mode);
        const config = EXPLORE_MODES.find(m => m.id === mode)!;
        setDuration(config.defaultDuration);
        setRadius(config.defaultRadius);
    };

    const fetchSuggestions = (input: string, type: 'query' | 'destination') => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        if (!input.trim() || input.length < 2) { setSuggestions([]); return; }
        setIsLoadingSuggestions(true);
        debounceTimer.current = setTimeout(async () => {
            const results = await getAutocompleteSuggestions(input, userLocation?.lat, userLocation?.lng);
            setSuggestions(results);
            setActiveInput(type);
            setIsLoadingSuggestions(false);
        }, 400);
    };

    const handleSelectSuggestion = (s: AutocompleteResult) => {
        if (activeInput === 'query') { setQuery(s.mainText); setQueryPlaceId(s.placeId); }
        else if (activeInput === 'destination') { setDestination(s.mainText); setDestinationPlaceId(s.placeId); }
        setSuggestions([]); setActiveInput(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        if (searchMode === 'route' && !destination.trim()) return;
        setIsSearching(true);
        const config = EXPLORE_MODES.find(m => m.id === exploreMode)!;
        onSearch({
            searchMode, query, radius: radius * 1000, duration,
            destination: searchMode === 'route' ? destination : undefined,
            queryPlaceId: queryPlaceId || undefined,
            destinationPlaceId: destinationPlaceId || undefined,
            travelMode,
            mood: mood || undefined,
            budget: budget || undefined,
            groupSize: groupSize || undefined,
            persona,
            daysCount: exploreMode === 'multiday' ? Math.round(duration / 720) : undefined,
            startTime: startTime || undefined,
            exploreMode,
        });
        setTimeout(() => setIsSearching(false), 1000);
    };

    const handleExploreNow = () => {
        if (!userLocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); triggerExplore(pos.coords.latitude, pos.coords.longitude); },
                () => alert('現在地を取得できませんでした。位置情報の許可をご確認ください。'),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            triggerExplore(userLocation.lat, userLocation.lng);
        }
    };

    const triggerExplore = (lat: number, lng: number) => {
        setIsSearching(true);
        onSearch({
            searchMode: 'area', query: `${lat},${lng}`, queryPlaceId: undefined,
            radius: 1500, duration: 120, travelMode: 'walk',
            mood: undefined, budget: undefined, groupSize: undefined, persona,
        });
        setTimeout(() => setIsSearching(false), 1000);
    };

    // 現在の探索モード設定
    const currentExplore = EXPLORE_MODES.find(m => m.id === exploreMode)!;

    // 時間のフォーマット
    const formatDuration = (mins: number) => {
        if (mins < 60) return `${mins}分`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (exploreMode === 'multiday') {
            const days = Math.round(mins / 720);
            return `${days}日間（${h}時間）`;
        }
        return m > 0 ? `${h}時間${m}分` : `${h}時間`;
    };

    // 共通のサジェストドロップダウン
    const SuggestionDropdown = ({ inputType }: { inputType: 'query' | 'destination' }) => (
        activeInput === inputType && suggestions.length > 0 ? (
            <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-scale-in max-h-60 overflow-y-auto">
                {suggestions.map(s => (
                    <button key={s.placeId} type="button" onClick={() => handleSelectSuggestion(s)}
                        className="w-full flex flex-col items-start px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-50 last:border-0 text-left min-h-[48px]">
                        <span className="text-sm font-bold text-slate-800">{s.mainText}</span>
                        <span className="text-[10px] text-slate-400 truncate w-full">{s.secondaryText}</span>
                    </button>
                ))}
            </div>
        ) : null
    );

    return (
        <div className="w-full flex flex-col bg-white min-h-screen">
            {/* ヘッダー */}
            <div className="text-center pt-10 pb-1 px-6 animate-fade-in safe-top">
                <div className="inline-block mb-3 animate-float">
                    <div className="w-11 h-11 mx-auto bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
                        <Compass size={22} className="text-amber-400" />
                    </div>
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-0.5 font-editorial lowercase">
                    meguru
                </h1>
                <p className="text-slate-400 text-xs font-bold tracking-tight">あなたのための、特別なよりみち。</p>
            </div>

            {/* ===== 3タブ: エリア | ルート | 今すぐ未知へ ===== */}
            <div className="px-4 mt-3 mb-3 animate-slide-up">
                <div className="flex rounded-xl p-1 gap-0.5 bg-slate-100">
                    <button type="button" onClick={() => setSearchMode('area')}
                        className={`flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-all duration-300
                            ${searchMode === 'area' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <Search size={12} className="inline mr-1 -mt-0.5" /> エリア
                    </button>
                    <button type="button" onClick={() => setSearchMode('route')}
                        className={`flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-all duration-300
                            ${searchMode === 'route' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                        <ArrowRight size={12} className="inline mr-1 -mt-0.5" /> ルート
                    </button>
                    <button type="button" onClick={handleExploreNow} disabled={isSearching}
                        className="flex-1 py-2.5 rounded-lg text-[12px] font-extrabold transition-all duration-300 bg-gradient-to-r from-amber-400 to-rose-400 text-white shadow-sm active:scale-95">
                        <LocateFixed size={12} className="inline mr-1 -mt-0.5" /> 現在地
                    </button>
                </div>
            </div>

            {/* フォーム */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 px-4 pb-4 overflow-y-auto">
                <div className="flex-1 flex flex-col justify-start space-y-3 pt-1 pb-4">

                    {/* エリア検索の入力 */}
                    {searchMode === 'area' && (
                        <div className="space-y-2 animate-slide-up">
                            <label htmlFor="area-query" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                出発地点
                            </label>
                            <div className="relative">
                                <input id="area-query" name="area-query" type="text" value={query}
                                    onChange={(e) => { setQuery(e.target.value); setQueryPlaceId(''); fetchSuggestions(e.target.value, 'query'); }}
                                    onFocus={() => query.length >= 2 && fetchSuggestions(query, 'query')}
                                    placeholder="例: 京都駅、浅草寺..." className="input-premium text-base min-h-[48px]" />
                                {isLoadingSuggestions && activeInput === 'query' && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                        <Loader2 size={16} className="animate-spin text-slate-300" />
                                    </div>
                                )}
                                <SuggestionDropdown inputType="query" />
                            </div>
                        </div>
                    )}

                    {/* ルート検索の入力 */}
                    {searchMode === 'route' && (
                        <div className="space-y-2 animate-slide-up">
                            <div className="relative">
                                <label htmlFor="route-origin" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">出発地</label>
                                <input id="route-origin" name="route-origin" type="text" value={query}
                                    onChange={(e) => { setQuery(e.target.value); setQueryPlaceId(''); fetchSuggestions(e.target.value, 'query'); }}
                                    onFocus={() => query.length >= 2 && fetchSuggestions(query, 'query')}
                                    placeholder="例: 京都駅" className="input-premium text-sm min-h-[48px]" />
                                <SuggestionDropdown inputType="query" />
                            </div>
                            <div className="flex items-center justify-center py-0.5">
                                <ArrowDown size={14} className="text-slate-300" />
                            </div>
                            <div className="relative">
                                <label htmlFor="route-destination" className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mb-1 block">目的地</label>
                                <input id="route-destination" name="route-destination" type="text" value={destination}
                                    onChange={(e) => { setDestination(e.target.value); setDestinationPlaceId(''); fetchSuggestions(e.target.value, 'destination'); }}
                                    onFocus={() => destination.length >= 2 && fetchSuggestions(destination, 'destination')}
                                    placeholder="例: 嵐山" className="input-premium text-sm min-h-[48px]" />
                                <SuggestionDropdown inputType="destination" />
                            </div>
                        </div>
                    )}

                    {/* ===== 探索モード選択（クイック/1日/連泊）===== */}
                    <div className="space-y-2 animate-slide-up">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Clock size={12} /> 探索モード
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {EXPLORE_MODES.map(mode => {
                                const isActive = exploreMode === mode.id;
                                return (
                                    <button key={mode.id} type="button" onClick={() => handleExploreModeChange(mode.id)}
                                        className={`flex flex-col items-center justify-center py-3 px-1 rounded-xl border-2 transition-all duration-300 active:scale-95 min-h-[72px]
                                            ${isActive ? 'border-amber-400 bg-amber-50 text-slate-900 shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'}`}>
                                        <mode.icon size={18} strokeWidth={isActive ? 2.5 : 1.5} className={isActive ? 'text-amber-500' : ''} />
                                        <span className={`text-[11px] font-extrabold mt-1 ${isActive ? 'text-slate-900' : ''}`}>{mode.label}</span>
                                        <span className="text-[9px] text-slate-400">{mode.sub}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 時間スライダー（モード連動） */}
                    <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <label htmlFor="duration-slider" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Clock size={12} /> よりみち時間
                            <span className="ml-auto text-amber-500 font-extrabold text-sm normal-case">{formatDuration(duration)}</span>
                        </label>
                        <input id="duration-slider" name="duration-slider" type="range"
                            min={currentExplore.minDuration} max={currentExplore.maxDuration} step={currentExplore.step}
                            value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} className="w-full" />
                        <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                            <span>{formatDuration(currentExplore.minDuration)}</span>
                            <span>{formatDuration(currentExplore.maxDuration)}</span>
                        </div>
                    </div>

                    {/* スタート時刻（オプション） */}
                    <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <label htmlFor="start-time" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Clock size={12} /> 出発時刻
                            <span className="ml-auto text-amber-500 font-extrabold text-sm normal-case">
                                {startTime || '自動（現在時刻）'}
                            </span>
                        </label>
                        <input
                            id="start-time"
                            name="start-time"
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="w-full rounded-lg px-3 py-2 text-sm bg-white border border-slate-100 focus:border-amber-400 focus:outline-none transition-colors min-h-[44px]"
                            placeholder="09:00"
                        />
                        {startTime && (
                            <button type="button" onClick={() => setStartTime('')}
                                className="text-[10px] text-slate-400 hover:text-slate-600 font-medium transition-colors">
                                × クリア（自動に戻す）
                            </button>
                        )}
                    </div>

                    {/* エリア検索時のみ半径（モード連動） */}
                    {searchMode === 'area' && (
                        <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <label htmlFor="area-radius" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <MapPin size={12} /> 探索範囲
                                <span className="ml-auto text-amber-500 font-extrabold text-sm normal-case">{radius} km</span>
                            </label>
                            <input id="area-radius" name="area-radius" type="range"
                                min={currentExplore.minRadius} max={currentExplore.maxRadius} step="0.5"
                                value={radius} onChange={(e) => setRadius(parseFloat(e.target.value))} className="w-full" />
                            <div className="flex justify-between text-[10px] text-slate-300 font-medium">
                                <span>{currentExplore.minRadius}km</span>
                                <span>{currentExplore.maxRadius}km</span>
                            </div>
                        </div>
                    )}

                    {/* 移動方法 */}
                    <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">移動方法</label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {TRAVEL_MODES.map(mode => {
                                const isActive = travelMode === mode.id;
                                return (
                                    <button key={mode.id} type="button" onClick={() => setTravelMode(mode.id)}
                                        className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg border-2 transition-all duration-300 active:scale-95 min-h-[48px]
                                            ${isActive ? 'border-amber-400 bg-white text-slate-900 shadow-sm' : 'border-transparent bg-transparent text-slate-400 hover:text-slate-600'}`}>
                                        <mode.icon size={16} strokeWidth={isActive ? 2.5 : 1.5} />
                                        <span className="text-[10px] font-bold">{mode.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* パーソナライズ設定 */}
                    <div className="space-y-3">
                        {/* 気分 */}
                        <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Smile size={12} /> 今日の気分
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {['のんびり', 'アクティブ', 'ロマンチック', '知的探究'].map(m => (
                                    <button key={m} type="button" onClick={() => setMood(mood === m ? '' : m)}
                                        className={`px-3 py-2 rounded-full text-[11px] font-bold transition-all min-h-[36px]
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
                            <div className="flex flex-wrap gap-1.5">
                                {['節約', '標準', 'リッチ'].map(b => (
                                    <button key={b} type="button" onClick={() => setBudget(budget === b ? '' : b)}
                                        className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all min-h-[36px]
                                            ${budget === b ? 'bg-amber-500 text-white shadow-md scale-105' : 'bg-white text-slate-500 border border-slate-100'}`}>
                                        {b}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 人数 */}
                        <div className="space-y-2 animate-slide-up bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Users size={12} /> 誰と行く？
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {['一人旅', 'デート', '友達', '家族'].map(g => (
                                    <button key={g} type="button" onClick={() => setGroupSize(groupSize === g ? '' : g)}
                                        className={`px-4 py-2 rounded-full text-[11px] font-bold transition-all min-h-[36px]
                                            ${groupSize === g ? 'bg-indigo-500 text-white shadow-md scale-105' : 'bg-white text-slate-500 border border-slate-100'}`}>
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* AIガイド（ペルソナ）選択 */}
                    <div className="space-y-2 animate-slide-up">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles size={12} /> AIガイド
                            {persona && <span className="ml-auto text-amber-500 normal-case">【{PERSONAS.find(p => p.id === persona)?.kanji}】選択中</span>}
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {PERSONAS.map(p => {
                                const isActive = persona === p.id;
                                return (
                                    <button key={p.id} type="button" onClick={() => setPersona(isActive ? undefined : p.id)}
                                        className={`relative flex flex-col items-center justify-center py-3 rounded-xl border-2 transition-all duration-300 active:scale-95 overflow-hidden min-h-[72px]
                                            ${isActive
                                                ? 'border-transparent text-white shadow-lg scale-[1.02]'
                                                : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'}`}>
                                        {isActive && <div className={`absolute inset-0 bg-gradient-to-br ${p.color}`} />}
                                        <span className={`relative text-xl font-black ${isActive ? 'text-white' : 'text-slate-800'}`}>{p.kanji}</span>
                                        <span className={`relative text-[9px] font-bold mt-0.5 ${isActive ? 'text-white/90' : 'text-slate-400'}`}>{p.label}</span>
                                        <span className={`relative text-[8px] mt-0.5 ${isActive ? 'text-white/70' : 'text-slate-300'}`}>{p.theme}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 送信ボタン */}
                <button type="submit" disabled={isSearching}
                    className="w-full btn-primary flex items-center justify-center gap-2.5 py-4 text-base font-bold rounded-xl mt-2 mb-8 min-h-[56px] safe-bottom">
                    {isSearching ? (<span className="animate-pulse">コース作成中...</span>) : (
                        <><span>{searchMode === 'area' ? '旅を始める' : 'ルートを作成'}</span><Navigation size={18} /></>
                    )}
                </button>
            </form>
        </div>
    );
};

export default SearchInterface;
