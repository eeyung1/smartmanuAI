import { z } from "zod";
export const timezoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA timezone.");
const cache = new Map<string, Date | null>();
const formats = new Map<string, Intl.DateTimeFormat>();
function localParts(date: Date, zone: string) {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (formats.size >= 1000) formats.clear();
    formats.set(zone, format);
  }
  const fields = format.formatToParts(date);
  const get = (key: string) => fields.find((f) => f.type === key)!.value;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}
function daySlot(day: string, zone: string) {
  const key = zone + ":" + day;
  if (cache.has(key)) return cache.get(key)!;
  const center = Date.parse(day + "T09:00:00Z");
  let result: Date | null = null;
  for (let n = center - 16 * 3600000; n <= center + 16 * 3600000; n += 60000) {
    const candidate = new Date(n),
      local = localParts(candidate, zone);
    if (local.day === day && local.hour >= 9) {
      result = candidate;
      break;
    }
  }
  if (cache.size >= 1000) cache.clear();
  cache.set(key, result);
  return result;
}
export function nextDigestSlot(
  after: Date,
  timezone: string,
  frequency: "daily" | "weekly",
) {
  timezoneSchema.parse(timezone);
  if (!Number.isFinite(after.getTime()))
    throw new Error("Invalid schedule time.");
  const start = Date.parse(localParts(after, timezone).day + "T12:00:00Z");
  for (let offset = 0; offset < 16; offset++) {
    const day = new Date(start + offset * 86400000).toISOString().slice(0, 10);
    if (
      frequency === "weekly" &&
      new Date(day + "T12:00:00Z").getUTCDay() !== 1
    )
      continue;
    const slot = daySlot(day, timezone);
    if (slot && slot > after) return slot;
  }
  throw new Error("Unable to resolve the next digest slot.");
}
export function localSlotKey(date: Date, timezone: string) {
  return localParts(date, timezone).day;
}
