export type BrochureSectionKind =
  "overview" | "funding" | "eligibility" | "documents" | "dates" | "other";

export type BrochureFunding = {
  tuitionWaiver: boolean;
  accommodation: boolean | null;
  monthlyAllowanceCny: number | null;
  otherItems: string[];
};

export type BrochureMilestoneKind =
  | "application_opens"
  | "application_deadline"
  | "interview"
  | "result_notification"
  | "registration"
  | "other";

export type BrochureMilestone = {
  kind: BrochureMilestoneKind;
  label: string;
  date: string;
};

export type BrochureSection = {
  kind: BrochureSectionKind;
  title: string;
  lines: string[];
  confidence: number;
};

export type BrochureDiagnostic = {
  code: string;
  severity: "info" | "warning";
  message: string;
};

export type BrochureDocument = {
  ok: boolean;
  title: string | null;
  sections: BrochureSection[];
  funding: BrochureFunding;
  fundingTier:
    | "fully_funded"
    | "tuition_only"
    | "free_participation"
    | "partial"
    | "unknown";
  milestones: BrochureMilestone[];
  documents: string[];
  confidence: number;
  diagnostics: BrochureDiagnostic[];
};

export type BrochureParseOptions = {
  maxContentLength?: number;
};

const sectionPatterns: { kind: BrochureSectionKind; patterns: RegExp[] }[] = [
  {
    kind: "overview",
    patterns: [
      /program(me)?\s+overview/i,
      /about\s+the\s+program/i,
      /项目概况/,
      /专业介绍/,
      /课程简介/,
    ],
  },
  {
    kind: "funding",
    patterns: [
      /scholarship\s+(coverage|support|benefits)/i,
      /financial\s+(support|aid)/i,
      /\bstipend\b/i,
      /tuition\s+waiver/i,
      /奖学金/,
      /资助/,
      /费用覆盖/,
    ],
  },
  {
    kind: "eligibility",
    patterns: [
      /eligibility\s+(criteria|requirements?)/i,
      /\bwho\s+can\s+apply\b/i,
      /申请条件/,
      /入学要求/,
      /申请资格/,
    ],
  },
  {
    kind: "documents",
    patterns: [
      /application\s+(documents?|materials?)/i,
      /required\s+documents?/i,
      /申请材料/,
      /所需材料/,
      /提交材料/,
    ],
  },
  {
    kind: "dates",
    patterns: [
      /important\s+dates/i,
      /key\s+dates/i,
      /\btimeline\b/i,
      /application\s+schedule/i,
      /时间安排/,
      /重要日期/,
      /时间表/,
      /申请时间/,
    ],
  },
];

const milestonePatterns: {
  kind: BrochureMilestoneKind;
  patterns: RegExp[];
}[] = [
  {
    kind: "application_opens",
    patterns: [
      /application\s+(opens?|opens\s+on|period\s+starts?|window\s+opens?)/i,
      /applications?\s+open/i,
      /申请开放/,
      /申请开始/,
      /申请时间/,
    ],
  },
  {
    kind: "application_deadline",
    patterns: [
      /application\s+deadline/i,
      /\bdeadline\b/i,
      /closing\s+date/i,
      /apply\s+by/i,
      /申请截止/,
      /截止日期/,
      /截止时间/,
    ],
  },
  {
    kind: "interview",
    patterns: [/interview/i, /面试/],
  },
  {
    kind: "result_notification",
    patterns: [
      /result\s+(notification|announcement|release)/i,
      /notification\s+of\s+results?/i,
      /结果通知/,
      /公布结果/,
    ],
  },
  {
    kind: "registration",
    patterns: [/registration/i, /注册/],
  },
];

const monthNames: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isoDate(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;
  return date.toISOString().slice(0, 10);
}

/** Finds every calendar date written in a line and normalizes it to ISO. */
export function findBrochureDates(line: string) {
  const dates: string[] = [];
  const push = (value: string | null) => {
    if (value && !dates.includes(value)) dates.push(value);
  };
  const patterns: RegExp[] = [
    /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/g,
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/gi,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      if (pattern.source.startsWith("(\\d{4})")) {
        push(isoDate(Number(match[1]), Number(match[2]), Number(match[3])));
      } else if (match.length === 4 && /^\d{1,2}$/.test(match[1])) {
        const month = monthNames[match[2].toLowerCase().slice(0, 3)];
        push(month ? isoDate(Number(match[3]), month, Number(match[1])) : null);
      } else if (match.length === 4) {
        const month = monthNames[match[1].toLowerCase().slice(0, 3)];
        push(month ? isoDate(Number(match[3]), month, Number(match[2])) : null);
      }
    }
  }
  return dates;
}

function sectionKind(line: string): BrochureSectionKind | null {
  const text = line.toLowerCase();
  for (const entry of sectionPatterns)
    if (entry.patterns.some((pattern) => pattern.test(text))) return entry.kind;
  return null;
}

function isHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  // Table rows and list items are content, even when they name a section.
  if (trimmed.includes("|")) return false;
  if (/^(?:[-*•]\s+|\d+[.)]\s+)/.test(trimmed)) return false;
  if (trimmed.length > 80) return false;
  return sectionKind(trimmed) !== null;
}

function stripMarkers(line: string) {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .trim();
}

function fundingFrom(lines: string[]) {
  const text = lines.join("\n");
  const tuitionWaiver =
    /tuition\s+(waiver|waived|exempt|free)|full\s+tuition|100%\s+tuition|免学费|学费全免|全额学费/i.test(
      text,
    );
  let accommodation: boolean | null = null;
  if (/accommodation|dormitory|housing|住宿|公寓/i.test(text))
    accommodation =
      !/no\s+accommodation|without\s+accommodation|不提供住宿|不提供住宿/i.test(
        text,
      );
  let monthlyAllowanceCny: number | null = null;
  const allowance =
    text.match(
      /(?:CNY|RMB|¥|￥)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:CNY|RMB|元)\s*(?:\/|per\s+)?(?:month|每月|月)/i,
    ) ??
    text.match(/monthly\s+(?:living\s+)?allowance[^.\n]*?([\d,]+(?:\.\d+)?)/i);
  if (allowance) {
    const value = Number(
      (allowance[1] ?? allowance[2] ?? "").replace(/,/g, ""),
    );
    if (Number.isFinite(value) && value > 0) monthlyAllowanceCny = value;
  }
  const otherItems = lines
    .map(stripMarkers)
    .filter(
      (line) =>
        line &&
        /(insurance|book|fee|travel|medical|教材|保险|书本|体检)/i.test(line),
    )
    .slice(0, 20);
  return { tuitionWaiver, accommodation, monthlyAllowanceCny, otherItems };
}

function fundingTier(
  funding: BrochureFunding,
  sourceText = "",
): BrochureDocument["fundingTier"] {
  if (
    funding.tuitionWaiver &&
    funding.accommodation === true &&
    funding.monthlyAllowanceCny !== null
  )
    return "fully_funded";
  if (funding.tuitionWaiver) return "tuition_only";
  if (/free\s+participation|免费参加/i.test(sourceText))
    return "free_participation";
  if (funding.tuitionWaiver || funding.monthlyAllowanceCny !== null)
    return "partial";
  return "unknown";
}

/**
 * Parses a plain-text or markdown admissions brochure into structured sections,
 * funding details, required documents and dated milestones.
 */
export function parseBrochureDocument(
  content: unknown,
  options: BrochureParseOptions = {},
): BrochureDocument {
  const maxLength = options.maxContentLength ?? 200_000;
  const diagnostics: BrochureDiagnostic[] = [];
  const base = {
    ok: false,
    title: null as string | null,
    sections: [] as BrochureSection[],
    funding: {
      tuitionWaiver: false,
      accommodation: null,
      monthlyAllowanceCny: null,
      otherItems: [] as string[],
    } as BrochureFunding,
    fundingTier: "unknown" as BrochureDocument["fundingTier"],
    milestones: [] as BrochureMilestone[],
    documents: [] as string[],
    confidence: 0,
    diagnostics,
  };
  if (typeof content !== "string" || !content.trim()) {
    diagnostics.push({
      code: "empty_content",
      severity: "warning",
      message: "The brochure has no readable content.",
    });
    return base;
  }
  if (content.length > maxLength) {
    diagnostics.push({
      code: "content_truncated",
      severity: "warning",
      message: "The brochure exceeded the parsing limit and was truncated.",
    });
  }
  const text = content.slice(0, maxLength);
  const lines = text.split(/\r?\n/);

  const titleLine = lines.find((line) => /^#{1,6}\s+/.test(line.trim()));
  const title = titleLine ? stripMarkers(titleLine) : null;

  const sections: BrochureSection[] = [];
  let current: BrochureSection | null = null;
  for (const line of lines) {
    if (isHeading(line)) {
      const heading = stripMarkers(line);
      const kind = sectionKind(line) ?? "other";
      current = {
        kind,
        title: heading,
        lines: [],
        confidence: kind === "other" ? 0.3 : 0.8,
      };
      sections.push(current);
      continue;
    }
    if (current && line.trim()) current.lines.push(line.trim());
  }
  if (!sections.length) {
    diagnostics.push({
      code: "no_sections_detected",
      severity: "warning",
      message: "No recognisable brochure sections were found.",
    });
    sections.push({
      kind: "other",
      title: "Unstructured content",
      lines: lines.map((line) => line.trim()).filter(Boolean),
      confidence: 0.2,
    });
  }

  const fundingSectionLines = sections
    .filter((section) => section.kind === "funding")
    .flatMap((section) => section.lines);
  // Funding is read from the funding section when present, so unrelated prose
  // cannot invent coverage. Unlabelled sections are only a fallback.
  const fundingLines = fundingSectionLines.length
    ? fundingSectionLines
    : sections
        .filter((section) => section.kind === "other")
        .flatMap((section) => section.lines);
  const funding = fundingFrom(fundingLines);

  const milestones: BrochureMilestone[] = [];
  for (const line of lines) {
    const dates = findBrochureDates(line);
    if (!dates.length) continue;
    const label = line.toLowerCase();
    let kind: BrochureMilestoneKind = "other";
    for (const entry of milestonePatterns)
      if (entry.patterns.some((pattern) => pattern.test(label))) {
        kind = entry.kind;
        break;
      }
    for (const date of dates)
      milestones.push({
        kind: kind === "other" && dates.indexOf(date) > 0 ? "other" : kind,
        label: stripMarkers(line).slice(0, 200),
        date,
      });
  }

  const documents = sections
    .filter((section) => section.kind === "documents")
    .flatMap((section) => section.lines)
    .map(stripMarkers)
    .filter(
      (line) =>
        line.length > 1 &&
        line.length < 200 &&
        !/^(?:no|none|n\/a|无|不适用)\b/i.test(line),
    )
    .slice(0, 40);

  const expectedKinds = new Set(
    sections.filter((section) => section.kind !== "other").map((s) => s.kind),
  );
  const coverage = expectedKinds.size / 5;
  const detail =
    (funding.tuitionWaiver || funding.monthlyAllowanceCny !== null ? 0.2 : 0) +
    (milestones.length ? 0.2 : 0) +
    (documents.length ? 0.1 : 0);
  const confidence =
    Math.round(Math.min(1, coverage * 0.7 + detail) * 100) / 100;
  if (!expectedKinds.has("funding"))
    diagnostics.push({
      code: "missing_funding_section",
      severity: "info",
      message: "No scholarship coverage section was found.",
    });
  if (!milestones.length)
    diagnostics.push({
      code: "no_dated_milestones",
      severity: "info",
      message: "No dated milestones were found.",
    });

  return {
    ok: true,
    title,
    sections,
    funding,
    fundingTier: fundingTier(funding, fundingLines.join("\n")),
    milestones,
    documents,
    confidence,
    diagnostics,
  };
}
