import React from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { Spot } from '../types';

interface SortableItemProps {
    spot: Spot;
    children: React.ReactNode;
}

const SortableItem: React.FC<SortableItemProps> = ({ spot, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: String(spot.id),
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : 'auto',
        position: 'relative',
    };

    return (
        <div ref={setNodeRef} style={style}>
            {/* ドラッグハンドル: 左上に配置、touch-actionを明示 */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-2 left-2 z-30 w-8 h-8 flex items-center justify-center rounded-full shadow-md cursor-grab active:cursor-grabbing"
                style={{ background: 'rgba(255,255,255,0.85)', touchAction: 'none' }}
                aria-label="ドラッグして並び替え"
            >
                <GripVertical size={14} style={{ color: 'var(--text-secondary)' }} />
            </div>
            {children}
        </div>
    );
};

interface SortableSpotListProps {
    spots: Spot[];
    onReorder: (newSpots: Spot[]) => void;
    renderSpot: (spot: Spot, index: number) => React.ReactNode;
}

const SortableSpotList: React.FC<SortableSpotListProps> = ({ spots, onReorder, renderSpot }) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = spots.findIndex(s => String(s.id) === active.id);
        const newIndex = spots.findIndex(s => String(s.id) === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        onReorder(arrayMove(spots, oldIndex, newIndex));
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={spots.map(s => String(s.id))} strategy={verticalListSortingStrategy}>
                <div className="space-y-6">
                    {spots.map((spot, index) => (
                        <SortableItem key={spot.id} spot={spot}>
                            {renderSpot(spot, index)}
                        </SortableItem>
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
};

export default SortableSpotList;
