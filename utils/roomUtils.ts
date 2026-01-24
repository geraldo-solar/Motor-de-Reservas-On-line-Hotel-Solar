import { Room } from '../types';

export const ROOM_ORDER = ['casal', 'triplo', 'sacada', 'quadruplo', 'quádruplo', 'varanda', 'loft'];

export const sortRoomsByPriority = (rooms: Room[]): Room[] => {
    return [...rooms].sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        const getOrderIndex = (name: string) => {
            for (let i = 0; i < ROOM_ORDER.length; i++) {
                if (name.includes(ROOM_ORDER[i])) return i;
            }
            return ROOM_ORDER.length;
        };
        return getOrderIndex(nameA) - getOrderIndex(nameB);
    });
};
