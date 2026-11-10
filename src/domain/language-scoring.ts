export type LanguageTestKind = "ielts" | "toefl-ibt" | "hsk";
export type IeltsBand = "listening" | "reading" | "writing" | "speaking";

export type IeltsScore = {
  test: "ielts";
  overall: number;
  bands?: Partial<Record<IeltsBand, number>>;
  testedOn?: string | null;
  validUntil?: string | null;
};
export type ToeflScore = {
  test: "toefl-ibt";
  total: number;
  testedOn?: string | null;
  validUntil?: string | null;
};
export type HskScore = {
  test: "hsk";
  level: number;
  total: number;
  testedOn?: string | null;
  validUntil?: string | null;
};
export type LanguageScore = IeltsScore | ToeflScore | HskScore;

type RequirementBase = {
  deadline?: string | null;
  asOf?: string | null;
  validityMonths?: number;
  acceptsExemption?: boolean;
};
export type IeltsRequirement = RequirementBase & {
  test: "ielts";
  minimumOverall: number;
  minimumBands?: Partial<Record<IeltsBand, number>>;
};
export type ToeflRequirement = RequirementBase & {
  test: "toefl-ibt";
  minimumTotal: number;
};
export type HskRequirement = RequirementBase & {
  test: "hsk";
  minimumLevel: number;
  minimumTotal?: number;
};
export type LanguageScoreRequirement =
  IeltsRequirement | ToeflRequirement | HskRequirement;

export type LanguageScoreProfile = {
  scores?: readonly LanguageScore[];
  exempt?: boolean;
  exemptionConfirmed?: boolean;
};

export type LanguageScoreDeficit = {
  field: "test" | "overall" | IeltsBand | "total" | "level" | "validity";
  required: number | string | null;
  actual: number | string | null;
  shortfall: number | null;
  explanationKey: string;
};

export type LanguageScoreMatch = {
  eligible: boolean;
  status: "eligible" | "ineligible" | "unknown" | "exempt";
  test: LanguageTestKind | null;
  deficits: LanguageScoreDeficit[];
  explanationKey: string;
  explanationKeys: string[];
  evaluatedAt: string | null;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const bands: IeltsBand[] = ["listening", "reading", "writing", "speaking"];

function kind(value: unknown): LanguageTestKind | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[ _]+/g, "-");
  if (normalized === "ielts") return "ielts";
  if (["toefl", "toefl-ibt", "toeflibt"].includes(normalized))
    return "toefl-ibt";
  if (normalized === "hsk") return "hsk";
  return null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function date(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
    ? value
    : null;
}

function addMonths(day: string, months: number) {
  const source = new Date(`${day}T00:00:00.000Z`);
  const targetMonth = source.getUTCMonth() + months;
  const year = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay)))
    .toISOString()
    .slice(0, 10);
}

function invalidResult(
  explanationKey: string,
  test: LanguageTestKind | null = null,
): LanguageScoreMatch {
  return {
    eligible: false,
    status: "unknown",
    test,
    deficits: [
      {
        field: "test",
        required: test,
        actual: null,
        shortfall: null,
        explanationKey,
      },
    ],
    explanationKey,
    explanationKeys: [explanationKey],
    evaluatedAt: null,
  };
}

function normalizeRequirement(value: unknown) {
  if (!record(value)) return null;
  const test = kind(value.test ?? value.type ?? value.name);
  if (!test) return null;
  const validityMonths = number(value.validityMonths) ?? 24;
  if (
    !Number.isInteger(validityMonths) ||
    validityMonths < 0 ||
    validityMonths > 120
  )
    return null;
  const deadlineValue = value.deadline ?? value.asOf;
  const evaluatedAt =
    deadlineValue === undefined || deadlineValue === null
      ? null
      : date(deadlineValue);
  if (deadlineValue !== undefined && deadlineValue !== null && !evaluatedAt)
    return null;
  const base = {
    test,
    validityMonths,
    evaluatedAt,
    acceptsExemption: value.acceptsExemption !== false,
  };
  if (test === "ielts") {
    const minimumOverall = number(value.minimumOverall ?? value.overall);
    if (minimumOverall === null || minimumOverall < 0 || minimumOverall > 9)
      return null;
    const sourceBands = record(value.minimumBands)
      ? value.minimumBands
      : record(value.bands)
        ? value.bands
        : {};
    const minimumBands: Partial<Record<IeltsBand, number>> = {};
    for (const band of bands) {
      if (sourceBands[band] === undefined) continue;
      const minimum = number(sourceBands[band]);
      if (minimum === null || minimum < 0 || minimum > 9) return null;
      minimumBands[band] = minimum;
    }
    return { ...base, test, minimumOverall, minimumBands };
  }
  if (test === "toefl-ibt") {
    const minimumTotal = number(value.minimumTotal ?? value.total);
    if (
      minimumTotal === null ||
      !Number.isInteger(minimumTotal) ||
      minimumTotal < 0 ||
      minimumTotal > 120
    )
      return null;
    return { ...base, test, minimumTotal };
  }
  const minimumLevel = number(value.minimumLevel ?? value.level);
  const rawTotal = value.minimumTotal ?? value.total;
  const minimumTotal = rawTotal === undefined ? null : number(rawTotal);
  if (
    minimumLevel === null ||
    !Number.isInteger(minimumLevel) ||
    minimumLevel < 1 ||
    minimumLevel > 6 ||
    (minimumTotal !== null &&
      (!Number.isInteger(minimumTotal) ||
        minimumTotal < 0 ||
        minimumTotal > (minimumLevel <= 2 ? 200 : 300)))
  )
    return null;
  return { ...base, test, minimumLevel, minimumTotal };
}

function normalizeScore(value: unknown): LanguageScore | null {
  if (!record(value)) return null;
  const test = kind(value.test ?? value.type ?? value.name);
  if (!test) return null;
  const testedOnValue = value.testedOn ?? value.testDate;
  const validUntilValue = value.validUntil ?? value.expiresOn;
  const testedOn =
    testedOnValue === undefined || testedOnValue === null
      ? null
      : date(testedOnValue);
  const validUntil =
    validUntilValue === undefined || validUntilValue === null
      ? null
      : date(validUntilValue);
  if (
    (testedOnValue !== undefined && testedOnValue !== null && !testedOn) ||
    (validUntilValue !== undefined &&
      validUntilValue !== null &&
      !validUntil) ||
    (testedOn && validUntil && validUntil < testedOn)
  )
    return null;
  if (test === "ielts") {
    const overall = number(value.overall ?? value.score);
    if (overall === null || overall < 0 || overall > 9) return null;
    const sourceBands = record(value.bands)
      ? value.bands
      : record(value.subBands)
        ? value.subBands
        : {};
    const resultBands: Partial<Record<IeltsBand, number>> = {};
    for (const band of bands) {
      if (sourceBands[band] === undefined) continue;
      const score = number(sourceBands[band]);
      if (score === null || score < 0 || score > 9) return null;
      resultBands[band] = score;
    }
    return { test, overall, bands: resultBands, testedOn, validUntil };
  }
  if (test === "toefl-ibt") {
    const total = number(value.total ?? value.score);
    if (total === null || !Number.isInteger(total) || total < 0 || total > 120)
      return null;
    return { test, total, testedOn, validUntil };
  }
  const level = number(value.level);
  const total = number(value.total ?? value.score);
  if (
    level === null ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 6 ||
    total === null ||
    !Number.isInteger(total) ||
    total < 0 ||
    total > (level <= 2 ? 200 : 300)
  )
    return null;
  return { test, level, total, testedOn, validUntil };
}

function profile(value: unknown) {
  if (Array.isArray(value))
    return {
      scores: value.map(normalizeScore).filter(Boolean) as LanguageScore[],
      exempt: false,
    };
  if (!record(value)) return { scores: [], exempt: false };
  const exempt = value.exempt === true || value.exemptionConfirmed === true;
  if (Array.isArray(value.scores))
    return {
      scores: value.scores
        .map(normalizeScore)
        .filter(Boolean) as LanguageScore[],
      exempt,
    };
  const possible = [
    value.ielts,
    value.toeflIbt ?? value.toefl,
    value.hsk,
    value.test || value.type ? value : null,
  ];
  return {
    scores: possible.map(normalizeScore).filter(Boolean) as LanguageScore[],
    exempt,
  };
}

function deficit(
  field: LanguageScoreDeficit["field"],
  required: number | string | null,
  actual: number | string | null,
  explanationKey: string,
): LanguageScoreDeficit {
  return {
    field,
    required,
    actual,
    shortfall:
      typeof required === "number" && typeof actual === "number"
        ? Math.max(0, required - actual)
        : null,
    explanationKey,
  };
}

function evaluateScore(
  score: LanguageScore,
  requirement: NonNullable<ReturnType<typeof normalizeRequirement>>,
): LanguageScoreMatch {
  const deficits: LanguageScoreDeficit[] = [];
  if (requirement.evaluatedAt) {
    const testedOn = date(score.testedOn);
    const explicitExpiry = date(score.validUntil);
    const expires =
      explicitExpiry ??
      (testedOn ? addMonths(testedOn, requirement.validityMonths) : null);
    if (
      !testedOn ||
      testedOn > requirement.evaluatedAt ||
      !expires ||
      expires < requirement.evaluatedAt
    )
      deficits.push(
        deficit(
          "validity",
          requirement.evaluatedAt,
          expires,
          "language.score.expired_or_undated",
        ),
      );
  }
  if (score.test === "ielts" && requirement.test === "ielts") {
    if (score.overall < requirement.minimumOverall)
      deficits.push(
        deficit(
          "overall",
          requirement.minimumOverall,
          score.overall,
          "language.score.ielts.overall_below",
        ),
      );
    for (const band of bands) {
      const minimum = requirement.minimumBands[band];
      if (minimum === undefined) continue;
      const actual = score.bands?.[band] ?? null;
      if (actual === null || actual < minimum)
        deficits.push(
          deficit(band, minimum, actual, `language.score.ielts.${band}_below`),
        );
    }
  } else if (score.test === "toefl-ibt" && requirement.test === "toefl-ibt") {
    if (score.total < requirement.minimumTotal)
      deficits.push(
        deficit(
          "total",
          requirement.minimumTotal,
          score.total,
          "language.score.toefl.total_below",
        ),
      );
  } else if (score.test === "hsk" && requirement.test === "hsk") {
    if (score.level < requirement.minimumLevel)
      deficits.push(
        deficit(
          "level",
          requirement.minimumLevel,
          score.level,
          "language.score.hsk.level_below",
        ),
      );
    if (
      requirement.minimumTotal !== null &&
      score.total < requirement.minimumTotal
    )
      deficits.push(
        deficit(
          "total",
          requirement.minimumTotal,
          score.total,
          "language.score.hsk.total_below",
        ),
      );
  }
  const eligible = deficits.length === 0;
  const explanationKey = eligible
    ? "language.score.meets"
    : "language.score.below_or_expired";
  return {
    eligible,
    status: eligible ? "eligible" : "ineligible",
    test: requirement.test,
    deficits,
    explanationKey,
    explanationKeys: [
      explanationKey,
      ...new Set(deficits.map((item) => item.explanationKey)),
    ],
    evaluatedAt: requirement.evaluatedAt,
  };
}

/** Deterministic score comparison only; it never converts one test into another. */
export function evaluateLanguageRequirement(
  profileScores: unknown,
  requirementValue: unknown,
): LanguageScoreMatch {
  const requirement = normalizeRequirement(requirementValue);
  if (!requirement) return invalidResult("language.requirement.invalid");
  const candidate = profile(profileScores);
  if (candidate.exempt) {
    if (requirement.acceptsExemption)
      return {
        eligible: true,
        status: "exempt",
        test: requirement.test,
        deficits: [],
        explanationKey: "language.score.exempt",
        explanationKeys: ["language.score.exempt"],
        evaluatedAt: requirement.evaluatedAt,
      };
    return invalidResult(
      "language.score.exemption_not_accepted",
      requirement.test,
    );
  }
  const matching = candidate.scores.filter(
    (score) => score.test === requirement.test,
  );
  if (!matching.length)
    return invalidResult("language.score.missing", requirement.test);
  return matching
    .map((score) => evaluateScore(score, requirement))
    .sort(
      (left, right) =>
        Number(right.eligible) - Number(left.eligible) ||
        left.deficits.length - right.deficits.length ||
        left.deficits.reduce((sum, item) => sum + (item.shortfall ?? 0), 0) -
          right.deficits.reduce((sum, item) => sum + (item.shortfall ?? 0), 0),
    )[0];
}
