import { createHash } from "node:crypto";

export const REMINDER_THRESHOLDS_DAYS = [7, 2] as const;
export type ReminderThreshold = (typeof REMINDER_THRESHOLDS_DAYS)[number];

export function daysUntilDeadline(deadline: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline))
    throw new Error("Deadline must be an ISO calendar date.");
  const deadlineMs = Date.parse(`${deadline}T00:00:00.000Z`);
  if (
    !Number.isFinite(deadlineMs) ||
    new Date(deadlineMs).toISOString().slice(0, 10) !== deadline
  )
    throw new Error("Deadline must be a valid ISO calendar date.");
  if (!Number.isFinite(now.getTime()))
    throw new Error("Invalid reminder time.");
  const todayMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return Math.round((deadlineMs - todayMs) / 86400000);
}

/** Returns the outstanding reminder window, allowing one late catch-up run. */
export function deadlineReminderThreshold(
  deadline: string,
  now = new Date(),
): ReminderThreshold | null {
  const days = daysUntilDeadline(deadline, now);
  if (days > 0 && days <= 2) return 2;
  if (days > 2 && days <= 7) return 7;
  return null;
}

export function deadlineReminderEventKey(input: {
  userId: string;
  opportunityId: string;
  revision: number;
  deadline: string;
  threshold: ReminderThreshold;
}) {
  const identity = JSON.stringify([
    "deadline-reminder-v1",
    input.userId,
    input.opportunityId,
    input.revision,
    input.deadline,
    input.threshold,
  ]);
  return (
    "deadline-reminder:" + createHash("sha256").update(identity).digest("hex")
  );
}

export function renderDeadlineReminder(input: {
  language: string;
  title: string;
  deadline: string;
  threshold: ReminderThreshold;
}) {
  if (input.language === "zh-Hans")
    return `申请截止日期还有 ${input.threshold} 天：${input.title}（${input.deadline}）`;
  return `Application deadline in ${input.threshold} days: ${input.title} (${input.deadline})`;
}
