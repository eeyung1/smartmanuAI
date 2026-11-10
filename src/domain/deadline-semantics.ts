export type DeadlineKind =
  "date" | "timestamp" | "rolling" | "rounds" | "unknown";

export type DeadlineRound = {
  label: string;
  deadline: ParsedDeadline;
};

export type ParsedDeadline = {
  kind: DeadlineKind;
  original: unknown;
  isRolling: boolean;
  closesAt: string | null;
  timeZone: string | null;
  rounds: DeadlineRound[];
  nextRound: DeadlineRound | null;
};

export type DeadlineOptions = {
  timeZone?: string;
  timezone?: string;
  now?: Date;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

type Zone =
  | { label: string; offsetMinutes: number; iana?: never }
  | { label: string; iana: string; offsetMinutes?: never };

const rollingPattern =
  /\brolling(?:\s+admissions?)?\b|\buntil\s+(?:all\s+places\s+are\s+)?filled\b|滚动录取|滚动招生|额满为止|招满即止/i;

function unknown(original: unknown): ParsedDeadline {
  return {
    kind: "unknown",
    original,
    isRolling: false,
    closesAt: null,
    timeZone: null,
    rounds: [],
    nextRound: null,
  };
}

function validParts(parts: DateParts) {
  if (
    !Number.isInteger(parts.year) ||
    parts.year < 1900 ||
    parts.year > 2200 ||
    !Number.isInteger(parts.month) ||
    parts.month < 1 ||
    parts.month > 12 ||
    !Number.isInteger(parts.day) ||
    parts.day < 1 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  )
    return false;
  return (
    new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate() >= parts.day
  );
}

function offsetLabel(minutes: number) {
  if (minutes === 0) return "UTC";
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function zone(value: string | undefined): Zone | null {
  const input = (value ?? "Asia/Shanghai").trim();
  if (/^(?:z|utc|gmt)$/i.test(input)) return { label: "UTC", offsetMinutes: 0 };
  if (/^(?:cst|china\s+standard\s+time|beijing\s+time)$/i.test(input))
    return { label: "UTC+08:00", offsetMinutes: 480 };
  const offset = input.match(
    /^(?:(?:utc|gmt)\s*)?([+-])(\d{1,2})(?::?(\d{2}))?$/i,
  );
  if (offset) {
    const hours = Number(offset[2]),
      minutes = Number(offset[3] ?? 0);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0))
      return null;
    const total = (hours * 60 + minutes) * (offset[1] === "-" ? -1 : 1);
    return { label: offsetLabel(total), offsetMinutes: total };
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: input }).format(new Date(0));
    return { label: input, iana: input };
  } catch {
    return null;
  }
}

function localPartsAt(timestamp: number, timeZone: string) {
  const entries = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    entries
      .filter((entry) => entry.type !== "literal")
      .map((entry) => [entry.type, Number(entry.value)]),
  );
  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
}

function instant(parts: DateParts, targetZone: Zone) {
  if (!validParts(parts)) return null;
  const local = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  if (targetZone.offsetMinutes !== undefined)
    return new Date(local - targetZone.offsetMinutes * 60_000).toISOString();
  const localSecond = local - parts.millisecond;
  let candidate = localSecond;
  for (let attempt = 0; attempt < 3; attempt++) {
    const represented = localPartsAt(candidate, targetZone.iana);
    candidate += localSecond - represented;
  }
  if (localPartsAt(candidate, targetZone.iana) !== localSecond) return null;
  return new Date(candidate + parts.millisecond).toISOString();
}

function dateParts(match: RegExpMatchArray, endOfDay = false): DateParts {
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: endOfDay ? 23 : Number(match[4] ?? 0),
    minute: endOfDay ? 59 : Number(match[5] ?? 0),
    second: endOfDay ? 59 : Number(match[6] ?? 0),
    millisecond: endOfDay ? 999 : 0,
  };
}

function simpleDeadline(
  input: string,
  original: unknown,
  options: DeadlineOptions,
): ParsedDeadline {
  const text = input.trim();
  if (rollingPattern.test(text))
    return {
      kind: "rolling",
      original,
      isRolling: true,
      closesAt: null,
      timeZone: null,
      rounds: [],
      nextRound: null,
    };
  const configured = options.timeZone ?? options.timezone;
  const dateOnly = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (dateOnly) {
    const targetZone = zone(configured);
    const closesAt = targetZone
      ? instant(dateParts(dateOnly, true), targetZone)
      : null;
    return closesAt
      ? {
          kind: "date",
          original,
          isRolling: false,
          closesAt,
          timeZone: targetZone!.label,
          rounds: [],
          nextRound: null,
        }
      : unknown(original);
  }
  const timestamp = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?\s*(Z|UTC|GMT|CST|China\s+Standard\s+Time|Beijing\s+Time|(?:(?:UTC|GMT)\s*)?[+-]\d{1,2}(?::?\d{2})?|[A-Za-z_]+\/[A-Za-z_+-]+)?$/i,
  );
  if (!timestamp) return unknown(original);
  const targetZone = zone(timestamp[7] || configured);
  const closesAt = targetZone
    ? instant(dateParts(timestamp), targetZone)
    : null;
  return closesAt
    ? {
        kind: "timestamp",
        original,
        isRolling: false,
        closesAt,
        timeZone: targetZone!.label,
        rounds: [],
        nextRound: null,
      }
    : unknown(original);
}

function parseRounds(input: unknown, options: DeadlineOptions) {
  let source: unknown[] = [];
  if (Array.isArray(input)) source = input;
  else if (
    input &&
    typeof input === "object" &&
    Array.isArray((input as { rounds?: unknown }).rounds)
  )
    source = (input as { rounds: unknown[] }).rounds;
  else if (typeof input === "string") {
    source = input
      .split(/[;\n]+/)
      .map((line) =>
        line.match(
          /^\s*((?:round|intake)\s*\d+|第\s*\d+\s*轮)\s*[:：-]\s*(.+)$/i,
        ),
      )
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => ({ label: match[1], deadline: match[2] }));
  }
  const rounds: DeadlineRound[] = [];
  for (let index = 0; index < source.length && index < 20; index++) {
    const value = source[index];
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
    const label = String(
      record?.label ?? record?.name ?? `Round ${index + 1}`,
    ).trim();
    const deadlineValue = record?.deadline ?? record?.date ?? record?.closesAt;
    if (!label || typeof deadlineValue !== "string") continue;
    const deadline = simpleDeadline(deadlineValue, deadlineValue, options);
    if (!["date", "timestamp"].includes(deadline.kind)) continue;
    rounds.push({ label: label.slice(0, 100), deadline });
  }
  if (!rounds.length) return null;
  rounds.sort((left, right) =>
    left.deadline.closesAt!.localeCompare(right.deadline.closesAt!),
  );
  const now = options.now ?? new Date();
  const nextRound = Number.isFinite(now.getTime())
    ? (rounds.find(
        (round) =>
          new Date(round.deadline.closesAt!).getTime() >= now.getTime(),
      ) ?? null)
    : null;
  return { rounds, nextRound };
}

export function parseDeadline(
  input: unknown,
  options: DeadlineOptions = {},
): ParsedDeadline {
  const rounds = parseRounds(input, options);
  if (rounds)
    return {
      kind: "rounds",
      original: input,
      isRolling: false,
      closesAt: rounds.nextRound?.deadline.closesAt ?? null,
      timeZone: rounds.nextRound?.deadline.timeZone ?? null,
      rounds: rounds.rounds,
      nextRound: rounds.nextRound,
    };
  if (input instanceof Date && Number.isFinite(input.getTime()))
    return simpleDeadline(
      input.toISOString().replace(/\.\d{3}Z$/, "Z"),
      input,
      options,
    );
  if (typeof input === "string") return simpleDeadline(input, input, options);
  if (input && typeof input === "object") {
    const value = input as Record<string, unknown>;
    const deadline = value.deadline ?? value.value;
    if (typeof deadline === "string")
      return simpleDeadline(deadline, input, options);
  }
  return unknown(input);
}

export function evaluateDeadlineStatus(
  parsed: ParsedDeadline,
  now = new Date(),
) {
  if (!Number.isFinite(now.getTime()))
    throw new Error("Invalid evaluation time.");
  if (parsed.kind === "rolling")
    return {
      isClosed: false,
      daysRemaining: null,
      isUrgent: false,
      badgeKey: "deadline.status.rolling",
    };
  const closesAt = parsed.closesAt ? new Date(parsed.closesAt).getTime() : NaN;
  if (!Number.isFinite(closesAt)) {
    const roundsClosed = parsed.kind === "rounds" && parsed.rounds.length > 0;
    return {
      isClosed: roundsClosed,
      daysRemaining: roundsClosed ? 0 : null,
      isUrgent: false,
      badgeKey: roundsClosed
        ? "deadline.status.rounds_closed"
        : "deadline.status.unknown",
    };
  }
  const remaining = closesAt - now.getTime();
  const isClosed = remaining <= 0;
  const daysRemaining = isClosed ? 0 : Math.ceil(remaining / 86_400_000);
  const isUrgent = !isClosed && daysRemaining <= 7;
  return {
    isClosed,
    daysRemaining,
    isUrgent,
    badgeKey: isClosed
      ? "deadline.status.closed"
      : isUrgent
        ? "deadline.status.urgent"
        : parsed.kind === "rounds"
          ? "deadline.status.next_round"
          : "deadline.status.open",
  };
}
