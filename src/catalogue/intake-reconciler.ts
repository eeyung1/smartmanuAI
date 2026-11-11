export type IntakeRelationship =
  "SAME_EDITION" | "NEW_CYCLE" | "PREVIOUS_CYCLE" | "AMBIGUOUS";

export type IntakeTermName =
  "fall" | "spring" | "summer" | "winter" | "academic-year";

export type IntakeTerm = {
  year: number;
  term: IntakeTermName;
  canonical: string;
  sortKey: number;
};

export type ExistingOffering = {
  id?: string;
  identity: string | null | undefined;
  title?: string | null;
  deadline?: string | null;
  state?: string | null;
};

export type IncomingIntake = {
  identity: string | null | undefined;
  title?: string | null;
  deadline?: string | null;
};

export type IntakeReconciliationOptions = {
  now?: Date;
  /** Reference date used to decide whether an offering cycle is historical. */
  referenceDate?: Date;
  /** Include draft offerings when comparing cycles. */
  includeDrafts?: boolean;
};

export type IntakeReconciliation = {
  relationship: IntakeRelationship;
  canonical: string | null;
  term: IntakeTerm | null;
  confidence: number;
  matchedOfferingId: string | null;
  reasons: string[];
};

const stopWords = new Set([
  "the",
  "and",
  "for",
  "of",
  "a",
  "an",
  "to",
  "in",
  "at",
  "program",
  "programme",
  "programmes",
  "course",
  "courses",
  "scholarship",
  "scholarships",
  "fellowship",
  "fellowships",
  "bursary",
  "奖学金",
  "项目",
  "课程",
]);

const termSort: Record<IntakeTermName, number> = {
  winter: 0,
  spring: 1,
  summer: 2,
  fall: 3,
  "academic-year": 4,
};

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[（(]/g, " ( ")
    .replace(/[)）]/g, " ) ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function canonicalTerm(term: IntakeTermName, year: number, endYear?: number) {
  return term === "academic-year"
    ? `${year}-${endYear ?? year + 1}`
    : `${year}-${term}`;
}

/**
 * Parses English and Chinese intake labels into a normalized term.
 * Returns null when no term or academic year can be read.
 */
export function parseIntakeTerm(
  value: string | null | undefined,
): IntakeTerm | null {
  if (typeof value !== "string") return null;
  const text = normalizeText(value);
  if (!text) return null;

  const academic =
    text.match(
      /(\d{4})\s*(?:-|–|—|~|to|至)\s*(\d{4})\s*(?:academic\s*year|academic|学年)/,
    ) ??
    text.match(/(\d{4})\s*学年/) ??
    text.match(/(\d{4})\s*-\s*(\d{4})\s*学\s*年/);
  if (academic) {
    const year = Number(academic[1]);
    const end = Number(academic[2] ?? year + 1);
    if (!Number.isInteger(year) || !Number.isInteger(end) || end < year)
      return null;
    if (year < 1900 || end > 2200) return null;
    return {
      year,
      term: "academic-year",
      canonical: canonicalTerm("academic-year", year, end),
      sortKey: year * 4 + termSort["academic-year"],
    };
  }

  const english: [RegExp, IntakeTermName][] = [
    [/\b(?:fall|autumn)\s*(\d{4})\b/, "fall"],
    [/\b(?:spring)\s*(\d{4})\b/, "spring"],
    [/\b(?:summer)\s*(\d{4})\b/, "summer"],
    [/\b(?:winter)\s*(\d{4})\b/, "winter"],
    [/\b(\d{4})\s*(?:fall|autumn|spring|summer|winter)\b/, "fall"],
  ];
  for (const [pattern, fallback] of english) {
    const match = text.match(pattern);
    if (!match) continue;
    const year = Number(match[1]);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
    const term =
      fallback === "fall" && /spring|summer|winter/.test(match[0])
        ? match[0].includes("spring")
          ? "spring"
          : match[0].includes("summer")
            ? "summer"
            : match[0].includes("winter")
              ? "winter"
              : "fall"
        : fallback;
    return {
      year,
      term,
      canonical: canonicalTerm(term, year),
      sortKey: year * 4 + termSort[term],
    };
  }

  const chinese: [RegExp, IntakeTermName][] = [
    [/(\d{4})\s*年?\s*(?:度)?\s*(?:秋季|秋季学期|秋)/, "fall"],
    [/(\d{4})\s*年?\s*(?:度)?\s*(?:春季|春季学期|春)/, "spring"],
    [/(\d{4})\s*年?\s*(?:度)?\s*(?:夏季|夏季学期|夏)/, "summer"],
    [/(\d{4})\s*年?\s*(?:度)?\s*(?:冬季|冬季学期|冬)/, "winter"],
    [/(?:秋季|秋季学期|秋)\s*(\d{4})/, "fall"],
    [/(?:春季|春季学期|春)\s*(\d{4})/, "spring"],
    [/(?:夏季|夏季学期|夏)\s*(\d{4})/, "summer"],
    [/(?:冬季|冬季学期|冬)\s*(\d{4})/, "winter"],
  ];
  for (const [pattern, term] of chinese) {
    const match = text.match(pattern);
    if (!match) continue;
    const year = Number(match[1]);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
    return {
      year,
      term,
      canonical: canonicalTerm(term, year),
      sortKey: year * 4 + termSort[term],
    };
  }
  return null;
}

function significantTokens(value: string | null | undefined) {
  if (typeof value !== "string") return new Set<string>();
  const text = normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, " ");
  const tokens = new Set<string>();
  for (const token of text.split(" "))
    if (token.length >= 3 && !stopWords.has(token) && !/^\d{4}$/.test(token))
      tokens.add(token);
  return tokens;
}

function programOverlap(
  incomingTitle: string | null | undefined,
  existingTitle: string | null | undefined,
) {
  const left = significantTokens(incomingTitle);
  const right = significantTokens(existingTitle);
  if (!left.size || !right.size) return "unknown" as const;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  if (shared === left.size && shared === right.size) return "same" as const;
  if (shared > 0) return "partial" as const;
  return "different" as const;
}

function isExpired(deadline: string | null | undefined, reference: Date) {
  if (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deadline))
    return false;
  const time = Date.parse(`${deadline}T00:00:00.000Z`);
  if (!Number.isFinite(time)) return false;
  return time < reference.getTime();
}

/**
 * Reconciles an incoming intake label against existing offerings.
 *
 * The evaluation is deterministic and pure: it never throws for malformed
 * input and never mutates the offerings it is given.
 */
export function reconcileIntakeIdentity(
  incoming: IncomingIntake | null | undefined,
  existingOfferings: readonly ExistingOffering[] | null | undefined,
  options: IntakeReconciliationOptions = {},
): IntakeReconciliation {
  const reference = options.referenceDate ?? options.now ?? new Date();
  if (!Number.isFinite(reference.getTime()))
    return {
      relationship: "AMBIGUOUS",
      canonical: null,
      term: null,
      confidence: 0,
      matchedOfferingId: null,
      reasons: ["invalid_reference_date"],
    };
  const term = parseIntakeTerm(incoming?.identity);
  if (!term)
    return {
      relationship: "AMBIGUOUS",
      canonical: null,
      term: null,
      confidence: 0,
      matchedOfferingId: null,
      reasons: ["unstated_or_unparseable_term"],
    };

  const comparable = (existingOfferings ?? []).filter(
    (offering) =>
      offering &&
      (options.includeDrafts === true ||
        !offering.state ||
        offering.state === "published" ||
        offering.state === "closed"),
  );
  const parsed = comparable
    .map((offering) => ({ offering, term: parseIntakeTerm(offering.identity) }))
    .filter((entry) => entry.term !== null) as {
    offering: ExistingOffering;
    term: IntakeTerm;
  }[];

  if (!parsed.length)
    return {
      relationship: "AMBIGUOUS",
      canonical: term.canonical,
      term,
      confidence: 0.2,
      matchedOfferingId: null,
      reasons: ["no_comparable_offering"],
    };

  const sameEdition = parsed.filter(
    (entry) => entry.term.canonical === term.canonical,
  );
  if (sameEdition.length > 1)
    return {
      relationship: "AMBIGUOUS",
      canonical: term.canonical,
      term,
      confidence: 0.3,
      matchedOfferingId: null,
      reasons: ["duplicate_canonical_offering"],
    };
  if (sameEdition.length === 1) {
    const match = sameEdition[0];
    const identicalLabel =
      normalizeText(incoming?.identity ?? "") ===
      normalizeText(match.offering.identity ?? "");
    const overlap = programOverlap(incoming?.title, match.offering.title);
    if (overlap === "different")
      return {
        relationship: "AMBIGUOUS",
        canonical: term.canonical,
        term,
        confidence: 0.4,
        matchedOfferingId: match.offering.id ?? null,
        reasons: ["same_term_different_program"],
      };
    const deadlineDiffers =
      (incoming?.deadline ?? null) !== (match.offering.deadline ?? null);
    const expired = isExpired(match.offering.deadline, reference);
    let confidence = identicalLabel ? 1 : 0.9;
    if (overlap === "partial") confidence = Math.min(confidence, 0.8);
    if (deadlineDiffers) confidence = Math.min(confidence, 0.75);
    const reasons = ["same_canonical_term"];
    if (!identicalLabel) reasons.push("alias_equivalent_term");
    if (deadlineDiffers) reasons.push("deadline_differs");
    if (expired) reasons.push("existing_edition_expired");
    return {
      relationship: "SAME_EDITION",
      canonical: term.canonical,
      term,
      confidence: Math.round(confidence * 100) / 100,
      matchedOfferingId: match.offering.id ?? null,
      reasons,
    };
  }

  const sameProgram = parsed.filter(
    (entry) =>
      programOverlap(incoming?.title, entry.offering.title) !== "different",
  );
  const candidates = sameProgram.length ? sameProgram : parsed;
  if (!sameProgram.length)
    return {
      relationship: "AMBIGUOUS",
      canonical: term.canonical,
      term,
      confidence: 0.35,
      matchedOfferingId: null,
      reasons: ["different_program"],
    };

  // An existing earlier cycle means the incoming label is a new cycle; an
  // existing later cycle means the incoming label is a historical cycle.
  const earlier = candidates.filter(
    (entry) => entry.term.sortKey < term.sortKey,
  );
  const later = candidates.filter((entry) => entry.term.sortKey > term.sortKey);
  const overlap = programOverlap(incoming?.title, candidates[0].offering.title);
  const base = overlap === "same" ? 0.85 : 0.6;
  if (earlier.length) {
    const nearest = earlier.sort((a, b) => b.term.sortKey - a.term.sortKey)[0];
    return {
      relationship: "NEW_CYCLE",
      canonical: term.canonical,
      term,
      confidence: Math.round(base * 100) / 100,
      matchedOfferingId: nearest.offering.id ?? null,
      reasons: ["later_cycle_than_existing_offering"],
    };
  }
  if (later.length) {
    const nearest = later.sort((a, b) => a.term.sortKey - b.term.sortKey)[0];
    return {
      relationship: "PREVIOUS_CYCLE",
      canonical: term.canonical,
      term,
      confidence: Math.round(base * 100) / 100,
      matchedOfferingId: nearest.offering.id ?? null,
      reasons: ["earlier_cycle_than_existing_offering"],
    };
  }
  return {
    relationship: "AMBIGUOUS",
    canonical: term.canonical,
    term,
    confidence: 0.4,
    matchedOfferingId: null,
    reasons: ["conflicting_cycle_evidence"],
  };
}
