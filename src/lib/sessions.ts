import { weekdayIndex } from './dates';

export type Slot = 'morning' | 'afternoon';

export const SLOTS: Slot[] = ['morning', 'afternoon'];
export const SLOT_LABEL: Record<Slot, string> = { morning: 'Mattina', afternoon: 'Pomeriggio' };
export const SLOT_LOWER: Record<Slot, string> = { morning: 'mattina', afternoon: 'pomeriggio' };

// Giorni della settimana: 0 = lunedì ... 6 = domenica
export type SessionDays = { morning: number[]; afternoon: number[] };

// Valore iniziale del pomeriggio: dal lunedì al sabato (domenica esclusa)
export const DEFAULT_AFTERNOON_DAYS = [0, 1, 2, 3, 4, 5];

// Eccezioni decise dall'allenatore per un singolo giorno:
// true = allenamento aggiunto, false = allenamento tolto. Chiave: "AAAA-MM-GG|slot"
export type Overrides = Record<string, boolean>;

export const slotKey = (date: string, slot: Slot) => `${date}|${slot}`;

// Allenamento previsto "di default", secondo i giorni scelti nelle impostazioni del gruppo
export function defaultHasSession(date: string, slot: Slot, days: SessionDays): boolean {
  return days[slot].includes(weekdayIndex(date));
}

export function hasSession(
  date: string,
  slot: Slot,
  days: SessionDays,
  overrides: Overrides
): boolean {
  const o = overrides[slotKey(date, slot)];
  return o !== undefined ? o : defaultHasSession(date, slot, days);
}