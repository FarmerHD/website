// Kleine, deutschsprachige Datumsformatierung für Historie/Statistik-Anzeigen
// und die Wochenzuordnung im Wochenplan.

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// Montag der Woche, in der das Datum liegt. In Deutschland beginnt die Woche
// am Montag, getDay() zählt aber ab Sonntag — daher der Versatz.
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Datum als "JJJJ-MM-TT" — dasselbe Format, das Postgres für date-Spalten
// erwartet, und ohne Zeitzonen-Versatz (anders als toISOString()).
export function toDateKey(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addWeeks(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}

// Kalenderwoche nach ISO 8601: Die Woche gehört zu dem Jahr, in dem ihr
// Donnerstag liegt.
export function isoWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 3);
  const firstThursday = startOfWeek(new Date(d.getFullYear(), 0, 4));
  firstThursday.setDate(firstThursday.getDate() + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 86400000));
}

// "KW 37 · 7.–13. September" bzw. monatsübergreifend "KW 40 · 28. September – 4. Oktober"
export function formatWeekRange(weekStartKey) {
  const mon = new Date(weekStartKey + "T00:00:00");
  if (Number.isNaN(mon.getTime())) return "";
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const range = mon.getMonth() === sun.getMonth()
    ? `${mon.getDate()}.–${sun.getDate()}. ${MONTHS[sun.getMonth()]}`
    : `${mon.getDate()}. ${MONTHS[mon.getMonth()]} – ${sun.getDate()}. ${MONTHS[sun.getMonth()]}`;
  return `KW ${isoWeek(mon)} · ${range}`;
}

// "Diese Woche" / "Nächste Woche" statt eines nackten Datums, solange die
// Woche nah genug an heute liegt.
export function relativeWeekLabel(weekStartKey) {
  const current = toDateKey(startOfWeek(new Date()));
  if (weekStartKey === current) return "Diese Woche";
  if (weekStartKey === toDateKey(addWeeks(startOfWeek(new Date()), 1))) return "Nächste Woche";
  if (weekStartKey === toDateKey(addWeeks(startOfWeek(new Date()), -1))) return "Letzte Woche";
  return null;
}

export function formatRelativeDate(iso) {
  const d = new Date(iso);
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Heute";
  if (diffDays === 1) return "Gestern";
  if (diffDays > 1 && diffDays < 7) return `vor ${diffDays} Tagen`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
