import { parseDeadline } from "../domain/deadline-semantics";
import { REMINDER_THRESHOLDS_DAYS } from "../domain/reminders";

export type ScheduleCadence =
  "hourly" | "daily" | "weekly" | "biweekly" | "terminal";

export type DeadlineScheduleOptions = {
  now?: Date;
  /** UTC hour used for daily and weekly rechecks. */
  dailyHourUtc?: number;
  /** UTC weekday used for weekly and bi-weekly rechecks (0 = Sunday). */
  weeklyWeekdayUtc?: number;
  urgentHours?: number;
  approachingDays?: number;
  reminderFreshnessHours?: number;
};

export type ScheduleOpportunity = {
  deadline?: string | null;
  isRolling?: boolean;
  details?: { deadline?: string | null } | null;
};

export type DeadlineSchedule = {
  cadence: ScheduleCadence;
  nextScheduleTime: string | null;
  reason: string;
  referenceTime: string;
  deadline: string | null;
  isRolling: boolean;
  isExpired: boolean;
  reminderFreshnessAt: string | null;
};

export type ScheduleDueStatus = {
  due: boolean;
  delaySeconds: number;
  overdueSeconds: number;
  reason: string;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function deadlineText(opportunity: ScheduleOpportunity | null | undefined) {
  if (!opportunity) return null;
  if (typeof opportunity.deadline === "string" && opportunity.deadline.trim())
    return opportunity.deadline.trim();
  const nested = opportunity.details?.deadline;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return null;
}

function startOfUtcDay(timestamp: number) {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

/** Next occurrence of the configured UTC hour strictly after the reference. */
function nextDailySlot(reference: number, hourUtc: number) {
  const day = startOfUtcDay(reference);
  const slot = day + hourUtc * HOUR_MS;
  return slot > reference ? slot : slot + DAY_MS;
}

/** Next occurrence of the configured UTC weekday and hour after the reference. */
function nextWeeklySlot(
  reference: number,
  hourUtc: number,
  weekdayUtc: number,
) {
  const day = startOfUtcDay(reference);
  const currentWeekday = Math.floor(reference / DAY_MS + 4) % 7;
  let delta = (weekdayUtc - currentWeekday + 7) % 7;
  let slot = day + delta * DAY_MS + hourUtc * HOUR_MS;
  if (slot <= reference) slot += 7 * DAY_MS;
  return slot;
}

/**
 * Computes the latest time a reminder dispatch may still be preceded by a
 * successful source recheck, using the repository's date-only reminder rules.
 */
export function reminderFreshnessTime(
  deadline: string | null,
  options: DeadlineScheduleOptions = {},
) {
  const reference = options.now ?? new Date();
  if (!Number.isFinite(reference.getTime()) || !deadline) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const deadlineMs = Date.parse(`${deadline}T00:00:00.000Z`);
  if (!Number.isFinite(deadlineMs)) return null;
  const hours = options.reminderFreshnessHours ?? 6;
  const now = reference.getTime();
  let earliest: number | null = null;
  for (const threshold of REMINDER_THRESHOLDS_DAYS) {
    // The reminder dispatches at the UTC midnight that opens its window.
    const dispatch = startOfUtcDay(deadlineMs - threshold * DAY_MS);
    if (dispatch > now) {
      const requiredBy = dispatch - hours * HOUR_MS;
      if (requiredBy <= now) {
        // The window is open now: freshness must be established immediately.
        earliest = now;
        break;
      }
      if (earliest === null || requiredBy < earliest) earliest = requiredBy;
      continue;
    }
    // The window already opened: the reminder may already have been handled,
    // so the cadence tier governs instead of forcing an immediate recheck.
  }
  return earliest === null ? null : new Date(earliest);
}

/**
 * Computes the next verification or collection timestamp for an opportunity.
 * Deadlines are read with the repository's conservative date-only UTC policy;
 * no timezone precision is inferred from source wording.
 */
export function calculateNextScheduleTime(
  opportunity: ScheduleOpportunity | null | undefined,
  options: DeadlineScheduleOptions = {},
): DeadlineSchedule {
  const reference = options.now ?? new Date();
  const referenceTime = Number.isFinite(reference.getTime())
    ? reference.toISOString()
    : "";
  const hourlyHours = options.urgentHours ?? 48;
  const approachingDays = options.approachingDays ?? 14;
  const hourUtc = options.dailyHourUtc ?? 3;
  const weekdayUtc = options.weeklyWeekdayUtc ?? 1;
  const base = {
    referenceTime,
    deadline: null as string | null,
    isRolling: false,
    isExpired: false,
    reminderFreshnessAt: null as string | null,
  };
  if (!Number.isFinite(reference.getTime()))
    return {
      ...base,
      cadence: "terminal",
      nextScheduleTime: null,
      reason: "invalid_reference_time",
    };

  const text = deadlineText(opportunity);
  const rolling = opportunity?.isRolling === true;
  const parsed = text
    ? parseDeadline(text, { timeZone: "UTC", now: reference })
    : null;
  const isRolling = rolling || parsed?.kind === "rolling";
  const reminderFreshness = reminderFreshnessTime(
    text && parsed?.kind !== "rolling" ? text : null,
    options,
  );
  const freshnessAt = reminderFreshness
    ? reminderFreshness.toISOString()
    : null;

  if (isRolling || !text || !parsed || !parsed.closesAt)
    return {
      ...base,
      deadline: text,
      isRolling,
      reminderFreshnessAt: freshnessAt,
      cadence: "biweekly",
      nextScheduleTime: new Date(
        nextWeeklySlot(reference.getTime(), hourUtc, weekdayUtc) + 7 * DAY_MS,
      ).toISOString(),
      reason: isRolling ? "rolling_admission" : "no_usable_deadline",
    };

  const closesAt = Date.parse(parsed.closesAt);
  if (!Number.isFinite(closesAt) || closesAt <= reference.getTime())
    return {
      ...base,
      deadline: text,
      isRolling,
      isExpired: true,
      reminderFreshnessAt: freshnessAt,
      cadence: "terminal",
      nextScheduleTime: null,
      reason: "deadline_passed",
    };

  const hoursRemaining = (closesAt - reference.getTime()) / HOUR_MS;
  const daysRemaining = Math.ceil(hoursRemaining / 24);
  let cadence: ScheduleCadence;
  let next: number;
  let reason: string;
  if (hoursRemaining <= hourlyHours) {
    cadence = "hourly";
    next = Math.ceil(reference.getTime() / HOUR_MS) * HOUR_MS;
    if (next <= reference.getTime()) next += HOUR_MS;
    reason = "within_urgent_horizon";
  } else if (daysRemaining <= approachingDays) {
    cadence = "daily";
    next = nextDailySlot(reference.getTime(), hourUtc);
    reason = "within_approaching_horizon";
  } else {
    cadence = "weekly";
    next = nextWeeklySlot(reference.getTime(), hourUtc, weekdayUtc);
    reason = "standard_horizon";
  }
  if (next > closesAt) next = closesAt;
  let pulledForReminder = false;
  if (
    reminderFreshness &&
    reminderFreshness.getTime() < next &&
    reminderFreshness.getTime() >= reference.getTime()
  ) {
    next = reminderFreshness.getTime();
    pulledForReminder = true;
  }
  if (next < reference.getTime())
    return {
      ...base,
      deadline: text,
      isRolling,
      isExpired: true,
      reminderFreshnessAt: freshnessAt,
      cadence: "terminal",
      nextScheduleTime: null,
      reason: "no_future_window",
    };
  return {
    ...base,
    deadline: text,
    isRolling,
    reminderFreshnessAt: freshnessAt,
    cadence,
    nextScheduleTime: new Date(next).toISOString(),
    reason: pulledForReminder ? "reminder_freshness_window" : reason,
  };
}

/** Reports whether a scheduled timestamp is due, and by how much. */
export function isScheduleDue(
  nextScheduleTime: string | number | Date | null | undefined,
  referenceTime: string | number | Date = new Date(),
): ScheduleDueStatus {
  const reference =
    referenceTime instanceof Date
      ? referenceTime.getTime()
      : typeof referenceTime === "number"
        ? referenceTime
        : Date.parse(referenceTime);
  if (!Number.isFinite(reference))
    return {
      due: false,
      delaySeconds: 0,
      overdueSeconds: 0,
      reason: "invalid_reference_time",
    };
  if (nextScheduleTime === null || nextScheduleTime === undefined)
    return {
      due: false,
      delaySeconds: 0,
      overdueSeconds: 0,
      reason: "terminal_schedule",
    };
  const next =
    nextScheduleTime instanceof Date
      ? nextScheduleTime.getTime()
      : typeof nextScheduleTime === "number"
        ? nextScheduleTime
        : Date.parse(nextScheduleTime);
  if (!Number.isFinite(next))
    return {
      due: false,
      delaySeconds: 0,
      overdueSeconds: 0,
      reason: "invalid_schedule_time",
    };
  const difference = next - reference;
  return {
    due: difference <= 0,
    delaySeconds: Math.max(0, Math.floor(difference / 1000)),
    overdueSeconds: Math.max(0, Math.floor(-difference / 1000)),
    reason: difference <= 0 ? "due" : "scheduled",
  };
}
