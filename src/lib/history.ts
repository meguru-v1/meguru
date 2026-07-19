import type { Course, HistoryEntry, HistoryStore } from '../types';
import { safePhotoRef } from './safeUrl';
export type { HistoryEntry };

const STORAGE_KEY = 'meguru:history:v1';
const MAX_ENTRIES = 20;

const safeRead = (): HistoryStore => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { version: 1, entries: [] };
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.entries)) {
            return parsed as HistoryStore;
        }
        return { version: 1, entries: [] };
    } catch {
        return { version: 1, entries: [] };
    }
};

const safeWrite = (store: HistoryStore): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
        // 容量超過時は古いものから半分削って再試行
        try {
            const trimmed: HistoryStore = { version: 1, entries: store.entries.slice(0, Math.floor(MAX_ENTRIES / 2)) };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch {
            console.warn('[history] localStorage write failed', e);
        }
    }
};

// APIキーを含む完成URLではなく photo reference のみを保存する（localStorageへのキー残留を防ぐ）
const buildThumbnailRef = (course: Course): string | undefined => {
    return safePhotoRef(course.spots?.[0]?.photos?.[0]);
};

export function pushHistory(course: Course, query: string): void {
    if (!course?.id) return;
    const store = safeRead();
    // 同じIDがあれば既存削除（重複防止）
    const filtered = store.entries.filter(e => e.id !== course.id);
    const entry: HistoryEntry = {
        id: course.id,
        course,
        query,
        viewedAt: Date.now(),
        thumbnailRef: buildThumbnailRef(course),
    };
    const next: HistoryStore = {
        version: 1,
        entries: [entry, ...filtered].slice(0, MAX_ENTRIES),
    };
    safeWrite(next);
}

export function getHistory(): HistoryEntry[] {
    return safeRead().entries;
}

export function removeHistory(id: string): void {
    const store = safeRead();
    safeWrite({ version: 1, entries: store.entries.filter(e => e.id !== id) });
}

export function clearHistory(): void {
    safeWrite({ version: 1, entries: [] });
}
