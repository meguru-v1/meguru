import { useRef, useCallback } from 'react';
import type React from 'react';

// 横スワイプ検出: 60px以上 かつ 縦移動の1.5倍以上 のときに onSwipe(direction) を発火
export function useSwipe(onSwipe: (direction: 'left' | 'right') => void) {
    const startX = useRef<number | null>(null);
    const startY = useRef<number | null>(null);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length !== 1) return;
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
    }, []);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (startX.current === null || startY.current === null) return;
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - startX.current;
        const dy = endY - startY.current;
        startX.current = null;
        startY.current = null;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        onSwipe(dx < 0 ? 'left' : 'right');
    }, [onSwipe]);

    return { onTouchStart, onTouchEnd };
}
