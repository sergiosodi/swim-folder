const pad = (n: number) => String(n).padStart(2, '0');

export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const DAY_LONG = [
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
  'Domenica',
];
const MONTH_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONTH_LONG = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

// Le date sono sempre stringhe "AAAA-MM-GG" nel fuso orario del telefono.
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Indice del giorno: 0 = lunedì ... 6 = domenica
export function weekdayIndex(iso: string): number {
  return (fromISO(iso).getDay() + 6) % 7;
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDays(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i));
}

export function dayNumber(iso: string): number {
  return fromISO(iso).getDate();
}

export function formatWeekRange(startIso: string): string {
  const a = fromISO(startIso);
  const b = fromISO(addDays(startIso, 6));
  const left =
    a.getMonth() === b.getMonth()
      ? `${a.getDate()}`
      : `${a.getDate()} ${MONTH_SHORT[a.getMonth()]}`;
  return `${left} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]} ${b.getFullYear()}`;
}

export function formatLongDate(iso: string): string {
  const d = fromISO(iso);
  return `${DAY_LONG[weekdayIndex(iso)]} ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`;
}