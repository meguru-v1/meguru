import { Sparkles, MapPin, Clock, Heart } from 'lucide-react';
import type { Course } from '../types';

interface CourseCardProps {
    course: Course;
    onClick: () => void;
    index?: number;
    isFavorite: boolean;
    onToggleFavorite: () => void;
}

export default function CourseCard({ course, onClick, index = 0, isFavorite, onToggleFavorite }: CourseCardProps) {
    return (
        <div onClick={onClick}
            className="card-premium relative p-5 cursor-pointer group active:scale-[0.98] animate-slide-up"
            style={{ animationDelay: `${index * 0.06}s`, animationFillMode: 'backwards' }}>
            {course.theme && (
                <div className="tag-badge mb-2.5">
                    <Sparkles size={10} /> {course.theme.split(':')[0]}
                </div>
            )}
            <div className="flex justify-between items-start mb-2 pr-10">
                <h4 className="font-bold text-base leading-tight course-title transition-colors" style={{ color: 'var(--text-primary)' }}>{course.title}</h4>
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-full whitespace-nowrap ml-2 shrink-0" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                    {course.totalTime}分
                </span>
            </div>
            <p className="text-xs mb-3.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{course.description}</p>
            <div className="flex items-center gap-3 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1"><MapPin size={10} /> {course.spots.length}スポット</span>
                <span className="flex items-center gap-1"><Clock size={10} /> {course.totalTime}分</span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                aria-label={isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
                className="absolute bottom-4 right-4 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90"
                style={isFavorite ? { background: 'rgba(197,61,67,0.08)', color: 'var(--wa-shu)' } : { background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                <Heart size={16} className={isFavorite ? 'fill-current' : ''} />
            </button>
        </div>
    );
}
