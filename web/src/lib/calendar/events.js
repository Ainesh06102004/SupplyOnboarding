// ============================================================================
// The household's Calendar (00092), read for the week and written for other
// calendars. Pure.
//
// The planner reads four kinds:
//   out       a person's meal out ("lunch at the office every Tuesday"): their
//             plate there is empty, and someone on their own numbers has the
//             day sized around a typical meal out (estimate.js GENERIC_MEALS)
//   travel    a person away for a range of days: no plates at all
//   training  a person's training days: carb cycling's higher-carb days
//   prep      the household's batch-cooking days (batch.js)
// The rest (plan, shop, remind, auto) are the household's diary.
//
// Dates are local calendar days (YYYY-MM-DD), times local to India. An event
// is once (starts_on, to ends_on for a range) or weekly (repeat_days, 0 =
// Sunday, from starts_on until `until` or for good).
// ============================================================================

import { GENERIC_MEALS } from "@/lib/food/estimate";

export const EVENT_KINDS = Object.freeze([
  Object.freeze({ key: "out", label: "Eating out", person: true, slot: true, hint: "No plate for that meal; the day is planned around it." }),
  Object.freeze({ key: "training", label: "Training day", person: true, hint: "More carbs on training days, for anyone carb cycling." }),
  Object.freeze({ key: "travel", label: "Travelling", person: true, range: true, hint: "No plates while they're away." }),
  Object.freeze({ key: "prep", label: "Batch cooking", hint: "Batches are cooked on these days." }),
  Object.freeze({ key: "shop", label: "Shopping", hint: "A shopping day." }),
  Object.freeze({ key: "plan", label: "Plan next week", hint: "A day to plan the next week." }),
  Object.freeze({ key: "remind", label: "Reminder", hint: "A note to yourself." }),
  Object.freeze({ key: "auto", label: "Auto-plan", hint: "KOI drafts next week's plan for you to approve." }),
]);
export const KIND = Object.freeze(Object.fromEntries(EVENT_KINDS.map((k) => [k.key, k])));
export const MEAL_SLOTS = Object.freeze(["breakfast", "lunch", "snack", "dinner"]);
export const WEEKDAY_NAMES = Object.freeze(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
/** When a meal out happens, for a calendar app, when the event has no time of its own. */
const SLOT_TIMES = Object.freeze({ breakfast: "08:30", lunch: "13:00", snack: "17:00", dinner: "20:00" });

const DAY = 86400000;
const dayNo = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const addDays = (iso, n) => isoOf(dayNo(iso) + n);

/** The dates an event falls on between two dates, inclusive. */
export function datesOf(event, from, to) {
  const a = dayNo(from);
  const b = dayNo(to);
  const start = dayNo(event.starts_on);
  const out = [];
  if (Array.isArray(event.repeat_days) && event.repeat_days.length) {
    const end = event.until ? dayNo(event.until) : Infinity;
    const days = event.repeat_days.map(Number);
    for (let d = Math.max(a, start); d <= Math.min(b, end); d++) if (days.includes(new Date(d * DAY).getUTCDay())) out.push(isoOf(d));
    return out;
  }
  const end = event.ends_on ? dayNo(event.ends_on) : start;
  for (let d = Math.max(a, start); d <= Math.min(b, end); d++) out.push(isoOf(d));
  return out;
}

/** Every occurrence between two dates, as { date → [event, …] }, in time order. */
export function occurrences(events = [], from, to) {
  const by = {};
  for (const e of events) for (const date of datesOf(e, from, to)) (by[date] ??= []).push(e);
  const at = (e) => e.at_time ?? (e.slot ? SLOT_TIMES[e.slot] : "00:00");
  for (const list of Object.values(by)) list.sort((x, y) => at(x).localeCompare(at(y)));
  return by;
}

/** "Me: lunch out", "Batch cooking": what an event is called when it has no title of its own. */
export function eventTitle(event, memberLabel = null) {
  if (event.title) return event.title;
  const who = memberLabel ? `${memberLabel}: ` : "";
  switch (event.kind) {
    case "out": return `${who}${event.slot ?? "meal"} out`;
    case "training": return `${who}training`;
    case "travel": return `${who}travelling`;
    default: return KIND[event.kind]?.label ?? "Event";
  }
}

/** "every Tuesday", "Tue and Thu", "weekdays", or the date. */
export function repeatWords(event) {
  const days = [...(event.repeat_days ?? [])].map(Number).sort();
  if (!days.length) return null;
  if (days.length === 7) return "every day";
  if (days.join() === "1,2,3,4,5") return "weekdays";
  if (days.join() === "0,6") return "weekends";
  if (days.length === 1) return `every ${WEEKDAY_NAMES[days[0]]}`;
  return days.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(", ");
}

/** What's wrong with an event before it is saved, in words. */
export function eventProblems(e) {
  const problems = [];
  if (!KIND[e.kind]) problems.push("Pick what it is.");
  if (KIND[e.kind]?.person && !e.member_id) problems.push("Pick who it is for.");
  if (e.kind === "out" && !MEAL_SLOTS.includes(e.slot)) problems.push("Pick which meal is out.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.starts_on ?? ""))) problems.push("Pick a date.");
  if (e.ends_on && e.ends_on < e.starts_on) problems.push("The end is before the start.");
  if (e.until && e.until < e.starts_on) problems.push("It stops before it starts.");
  if (e.repeat_days && !e.repeat_days.every((d) => Number.isInteger(Number(d)) && d >= 0 && d <= 6)) problems.push("Pick the days it repeats on.");
  if (e.title && String(e.title).trim().length > 120) problems.push("The title is too long.");
  return problems;
}

/**
 * What a span of days takes from the calendar.
 * @param {Array} events calendar_event rows
 * @param {{ from: string, to: string }} span the week's first and last dates
 * @param {string[]} [slots] the week's meal slots
 * @returns {{
 *   away: Object<string, string[]>,               // "date:slot" → member ids with no plate there
 *   outs: Object<string, Object<string, object>>, // member id → "date:slot" → { slot, setting, nutrition }
 *   training: Object<string, Set<string>>,        // member id → training dates
 *   prepDays: number[]|null                       // weekdays the household batch-cooks, from prep events
 * }}
 */
export function weekFromCalendar(events = [], { from, to }, slots = MEAL_SLOTS) {
  const away = {};
  const outs = {};
  const training = {};
  const prep = new Set();
  const awayAt = (date, slot, id) => { const k = `${date}:${slot}`; away[k] = [...new Set([...(away[k] ?? []), String(id)])]; };
  for (const e of events) {
    const id = e.member_id ? String(e.member_id) : null;
    if (e.kind === "prep") {
      // The day before the week counts: Sunday's cook feeds a week that starts on Monday.
      for (const date of datesOf(e, addDays(from, -1), to)) prep.add(weekdayOf(date));
      continue;
    }
    if (!id) continue;
    for (const date of datesOf(e, from, to)) {
      if (e.kind === "out" && e.slot) {
        awayAt(date, e.slot, id);
        const kcal = Number(e.plan_effect?.kcal);
        const typical = GENERIC_MEALS[e.slot] ?? GENERIC_MEALS.lunch;
        const nutrition = kcal > 0 ? Object.fromEntries(Object.entries(typical).map(([n, v]) => [n, Math.round((v * kcal) / typical.kcal)])) : { ...typical };
        (outs[id] ??= {})[`${date}:${e.slot}`] = { slot: e.slot, setting: e.plan_effect?.setting ?? null, nutrition, eventId: e.id ?? null };
      } else if (e.kind === "travel") {
        for (const slot of slots) awayAt(date, slot, id);
      } else if (e.kind === "training") {
        (training[id] ??= new Set()).add(date);
      }
    }
  }
  return { away, outs, training, prepDays: prep.size ? [...prep].sort() : null };
}

// ── iCalendar (RFC 5545) ──────────────────────────────────────────────────
const ICS_DAYS = Object.freeze(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);
const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (iso) => iso.replace(/-/g, "");
const icsStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Lines longer than 75 octets are folded (RFC 5545 §3.1). Runs in the browser and on the server. */
const fold = (line) => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const decode = (from, to) => new TextDecoder().decode(bytes.subarray(from, to));
  const parts = [];
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    let n = first ? 75 : 74;
    // Never split a UTF-8 character.
    while (i + n < bytes.length && (bytes[i + n] & 0xc0) === 0x80) n -= 1;
    parts.push((first ? "" : " ") + decode(i, i + n));
    i += n;
    first = false;
  }
  return parts.join("\r\n");
};

/**
 * The events as an iCalendar file, for a calendar app.
 * @param {Array} events calendar_event rows (with member_label when there is one)
 * @param {{ name?: string, now?: Date, host?: string }} [opts]
 */
export function toICS(events = [], { name = "KOI", now = new Date(), host = "koinorth.com" } = {}) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KOI//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`, "X-WR-TIMEZONE:Asia/Kolkata",
    "BEGIN:VTIMEZONE", "TZID:Asia/Kolkata", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0530", "TZOFFSETTO:+0530", "TZNAME:IST", "END:STANDARD", "END:VTIMEZONE",
  ];
  for (const e of events) {
    const days = (e.repeat_days ?? []).map(Number);
    // A weekly event's first instance is DTSTART itself: start it on a day it repeats on.
    let start = e.starts_on;
    if (days.length) for (let i = 0; i < 7 && !days.includes(weekdayOf(start)); i++) start = addDays(start, 1);
    const time = e.at_time ? String(e.at_time).slice(0, 5) : e.kind === "out" && e.slot ? SLOT_TIMES[e.slot] : null;
    lines.push("BEGIN:VEVENT", `UID:${e.id ?? `${e.kind}-${e.starts_on}`}@${host}`, `DTSTAMP:${icsStamp(now)}`);
    if (time) {
      lines.push(`DTSTART;TZID=Asia/Kolkata:${icsDate(start)}T${time.replace(":", "")}00`, e.kind === "out" ? "DURATION:PT1H" : "DURATION:PT30M");
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.ends_on ?? start, 1))}`);
    }
    if (days.length) lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ICS_DAYS[d]).join(",")}${e.until ? `;UNTIL=${icsDate(e.until)}` : ""}`);
    lines.push(`SUMMARY:${icsText(eventTitle(e, e.member_label ?? null))}`);
    if (KIND[e.kind]?.hint) lines.push(`DESCRIPTION:${icsText(`From KOI. ${KIND[e.kind].hint}`)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
