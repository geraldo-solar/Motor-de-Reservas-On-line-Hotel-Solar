import type { Room } from '../types.js';
import { toLocalISO } from './dateUtils.js';

// Tarifas de sexta e sábado por acomodação. Aplicadas apenas quando a data não
// possui preço específico cadastrado (override) no painel.
export const WEEKEND_PRICES: Record<string, number> = {
  "Suíte Casal": 610,
  "Suíte Triplo": 710,
  "Suíte Sacada Vista Mar": 810,
  "Suíte Quádruplo": 810,
  "Suíte Varanda Térreo": 920,
  "LOFT": 1450
};

// Apartamento individual: Suíte Casal para 1 pessoa, confirmado pelo
// responsável em 07/10/2026. Vale nas datas sem preço cadastrado (fora de
// férias, feriados e pacotes); nelas a diária é a da Suíte Casal.
export const SINGLE_OCCUPANCY_PRICES = { weekday: 370, weekend: 410 };

// Valor da diária de uma acomodação numa data específica.
// Precedência: preço cadastrado para a data > tarifa de fim de semana > tarifa base.
export const getNightlyPrice = (room: Room, date: Date): number => {
  const override = room.overrides?.find(o => o.dateIso === toLocalISO(date));
  if (override?.price !== undefined) return override.price;

  const day = date.getDay();
  if (day === 5 || day === 6) return WEEKEND_PRICES[room.name] || room.price * 1.15;

  return room.price;
};
