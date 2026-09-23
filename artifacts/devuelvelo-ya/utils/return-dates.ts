const monthNames: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
  may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
  sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10, dic: 11, diciembre: 11,
};

function isoFromParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, '0')}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function parseDate(value: string) {
  const input = String(value ?? '').trim().toLowerCase();
  let match = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return isoFromParts(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = input.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (match) return isoFromParts(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = input.match(/^(\d{1,2})\s+([a-záéíóú]+)\s+(\d{4})$/);
  if (match) {
    const monthKey = match[2].replace('.', '');
    const month = monthNames[monthKey];
    if (month !== undefined) return isoFromParts(Number(match[3]), month, Number(match[1]));
  }
  return null;
}

export function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
}

export function addDays(date: string, amount: number) {
  const parsed = parseDate(date);
  if (!parsed) return isoToday();
  const [year, month, day] = parsed.split('-').map(Number);
  return isoFromParts(year, month - 1, day + amount) ?? parsed;
}

export function daysUntil(date: string) {
  const parsed = parseDate(date);
  if (!parsed) return 0;
  const [year, month, day] = parsed.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = isoToday().split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86400000);
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const parsed = parseDate(date);
  if (!parsed) return 'Fecha pendiente';
  const [year, month, day] = parsed.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateInput(date: string) {
  const parsed = parseDate(date);
  if (!parsed) return '';
  const [year, month, day] = parsed.split('-');
  return `${day}/${month}/${year}`;
}

export function urgencyLabel(days: number) {
  if (days < 0) return `Venció hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`;
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `Quedan ${days} días`;
}
