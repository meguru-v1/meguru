import React from 'react';
import { Search, Footprints, Map, Heart } from 'lucide-react';
import type { TabId } from '../types';

interface TabBarProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
    coursesCount: number;
    favoritesCount: number;
}

interface TabConfig {
    id: TabId;
    label: string;
    Icon: React.ElementType;
}

const TABS: TabConfig[] = [
    { id: 'search', label: '検索', Icon: Search },
    { id: 'courses', label: 'モデルコース', Icon: Footprints },
    { id: 'map', label: '地図', Icon: Map },
    { id: 'favorites', label: '履歴', Icon: Heart },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange, coursesCount, favoritesCount }) => {
    return (
        <nav className="fixed bottom-0 left-0 right-0 z-[600] safe-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            {/* frosted glass background */}
            <div className="mx-2 mb-2 rounded-2xl overflow-hidden bg-white/80 backdrop-blur-xl border border-white/60 shadow-2xl shadow-slate-900/20">
                <div className="flex items-stretch">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.id;
                        const badge = tab.id === 'courses' ? coursesCount : tab.id === 'favorites' ? favoritesCount : 0;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={`
                                    relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1
                                    transition-all duration-300 ease-out
                                    ${isActive
                                        ? 'text-amber-600'
                                        : 'text-slate-400 hover:text-slate-600 active:scale-90'
                                    }
                                `}
                                aria-label={tab.label}
                            >
                                {/* active indicator pill */}
                                {isActive && (
                                    <span
                                        className="absolute inset-x-2 top-0 h-0.5 rounded-b-full bg-gradient-to-r from-amber-400 to-amber-600"
                                        style={{ animation: 'slideDown 0.2s ease-out' }}
                                    />
                                )}

                                {/* icon wrapper */}
                                <span className={`
                                    relative flex items-center justify-center
                                    w-9 h-7 rounded-xl transition-all duration-300
                                    ${isActive
                                        ? 'bg-gradient-to-br from-amber-400/20 to-amber-600/20 scale-110'
                                        : ''
                                    }
                                `}>
                                    <tab.Icon
                                        size={isActive ? 20 : 18}
                                        strokeWidth={isActive ? 2.5 : 1.8}
                                        className="transition-all duration-200"
                                    />
                                    {/* badge */}
                                    {badge > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                                            {badge > 99 ? '99+' : badge}
                                        </span>
                                    )}
                                </span>

                                <span className={`text-[10px] font-semibold tracking-tight transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
};

export default TabBar;
