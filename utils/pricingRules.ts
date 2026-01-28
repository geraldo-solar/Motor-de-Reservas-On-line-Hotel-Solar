import { DiscountCode, Room } from '../types';

export interface DiscountValidationResult {
    isValid: boolean;
    error?: string;
    discountAmount: number;
}

export const validateDiscount = (
    discount: DiscountCode,
    subtotal: number,
    checkIn: Date | null,
    checkOut: Date | null,
    selectedRooms: Room[]
): DiscountValidationResult => {
    if (!discount.active) {
        return { isValid: false, error: 'Cupom inativo.', discountAmount: 0 };
    }

    // 1. Check Date Range Validity
    const now = new Date();
    const todayIso = now.toISOString().split('T')[0];
    const checkInIso = checkIn ? checkIn.toISOString().split('T')[0] : todayIso;

    // Start Date
    if (discount.startDate && checkInIso < discount.startDate) {
        return { isValid: false, error: 'Cupom não válido para esta data de check-in (inicia em ' + discount.startDate.split('-').reverse().join('/') + ').', discountAmount: 0 };
    }

    // End Date
    if (discount.endDate && checkInIso > discount.endDate) {
        return { isValid: false, error: 'Cupom expirado para esta data de check-in (encerrou em ' + discount.endDate.split('-').reverse().join('/') + ').', discountAmount: 0 };
    }

    // 2. Check Usage Limits
    if (discount.maxUses !== undefined && discount.maxUses > 0) {
        if ((discount.usedCount || 0) >= discount.maxUses) {
            return { isValid: false, error: 'Limite de uso do cupom atingido.', discountAmount: 0 };
        }
    }

    // 3. Check Minimum Nights
    if (checkIn && checkOut && discount.minNights) {
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        if (nights < discount.minNights) {
            return { isValid: false, error: `Mínimo de ${discount.minNights} noites exigido.`, discountAmount: 0 };
        }
    }

    // 4. Check Valid Days (e.g. ['mon', 'fri'])
    if (discount.validDays && discount.validDays.length > 0 && checkIn) {
        const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const checkInDay = daysMap[checkIn.getDay()];
        if (!discount.validDays.includes(checkInDay)) {
            return { isValid: false, error: 'Cupom não válido para check-in neste dia da semana.', discountAmount: 0 };
        }
    }

    // 5. Check Room Restrictions
    if (discount.validRoomTypes && discount.validRoomTypes.length > 0) {
        // Check if ALL selected rooms are valid? Or at least one?
        // Usually strict: All selected rooms must be eligible, OR we only apply discount to eligible rooms.
        // For simplicity/safety: All rooms must be valid, or we calculate discount only on valid rooms?
        // Let's implement: Discount applies to the whole reservation IF valid for these rooms.
        // If ANY selected room is NOT in the list, is it invalid? 
        // Let's assume strict: Can only be used if all rooms match. 
        // OR better: Calculates discount proportional to eligible rooms?
        // Given the UI is "Apply Coupon to Reservation", strict check for now.

        const allRoomsValid = selectedRooms.every(room => discount.validRoomTypes!.includes(room.id));
        if (!allRoomsValid) {
            return { isValid: false, error: 'Cupom válido apenas para tipos de quarto específicos.', discountAmount: 0 };
        }
    }

    // Calculate Amount
    let amount = 0;
    if (discount.discountType === 'fixed') {
        amount = discount.fixedValue || 0;
    } else {
        // Percentage
        amount = (subtotal * discount.percentage) / 100;
    }

    // Cap at subtotal
    if (amount > subtotal) amount = subtotal;

    return { isValid: true, discountAmount: amount };
};
