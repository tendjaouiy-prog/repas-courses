// Dates au format AAAA-MM-JJ, calculées en UTC pour éviter les surprises du changement d'heure.
const pad = (n: number) => String(n).padStart(2, '0');

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Date du jour sur le téléphone. */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export function mondayOf(s: string): string {
  return addDays(s, -((parseDate(s).getUTCDay() + 6) % 7));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const fmt = (s: string, o: Intl.DateTimeFormatOptions) => parseDate(s).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...o });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « lundi 16 » */
export const dayTitle = (s: string) => cap(fmt(s, { weekday: 'long', day: 'numeric' }));
/** « lun. 16 » */
export const dayShort = (s: string) => fmt(s, { weekday: 'short', day: 'numeric' });
/** « 16 nov. » */
export const dayMonth = (s: string) => fmt(s, { day: 'numeric', month: 'short' });

/** « du sam. 14 au ven. 20 nov. » */
export function rangeLabel(a: string, b: string): string {
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `du ${sameMonth ? dayShort(a) : fmt(a, { weekday: 'short', day: 'numeric', month: 'short' })} au ${fmt(b, { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

/** « du 16 au 22 nov. » */
export function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  return `du ${sameMonth ? fmt(monday, { day: 'numeric' }) : dayMonth(monday)} au ${dayMonth(sunday)}`;
}
