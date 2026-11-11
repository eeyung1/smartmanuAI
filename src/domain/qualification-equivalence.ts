export type QualificationLevel =
  | "secondary"
  | "vocational"
  | "associate"
  | "bachelor"
  | "master"
  | "doctorate"
  | "unknown";

export type StandardizedTier =
  "secondary" | "bachelor" | "master" | "doctorate" | null;

export type NormalizedQualification = {
  level: QualificationLevel;
  standardized: StandardizedTier;
  reviewRequired: boolean;
  confidence: number;
  reason: string;
  matchedLabel: string | null;
};

export type QualificationNormalizationOptions = {
  /** Extra credential labels the operator has approved. */
  additionalLabels?: readonly string[];
};

export type QualificationEligibilityStatus =
  "meets" | "below" | "review_required" | "no_requirement";

export type QualificationEligibility = {
  eligible: boolean;
  status: QualificationEligibilityStatus;
  reviewRequired: boolean;
  applicantLevel: QualificationLevel;
  applicantTier: StandardizedTier;
  requiredTier: StandardizedTier;
  requiredLevel: number | null;
  explanationKey: string;
  reason: string;
};

export type FieldRelevanceResult = {
  score: number;
  matches: { topic: string; score: number }[];
  reviewRequired: boolean;
  reason: string;
};

const levelOrder: Record<Exclude<QualificationLevel, "unknown">, number> = {
  secondary: 10,
  vocational: 20,
  associate: 30,
  bachelor: 40,
  master: 50,
  doctorate: 60,
};

const tierLevels: Record<Exclude<StandardizedTier, null>, number> = {
  secondary: 10,
  bachelor: 40,
  master: 50,
  doctorate: 60,
};

const tierForLevel: Record<
  Exclude<QualificationLevel, "unknown">,
  StandardizedTier
> = {
  secondary: "secondary",
  vocational: "secondary",
  associate: null,
  bachelor: "bachelor",
  master: "master",
  doctorate: "doctorate",
};

/** Ordered credential labels; the first matching label wins. */
const credentialLabels: {
  level: Exclude<QualificationLevel, "unknown">;
  confidence: number;
  patterns: RegExp[];
}[] = [
  {
    level: "doctorate",
    confidence: 1,
    patterns: [
      /\bdoctorate\b/,
      /\bdoctoral\b/,
      /\bph\s*d\b/,
      /\bd\s*phil\b/,
      /博士/,
    ],
  },
  {
    level: "master",
    confidence: 1,
    patterns: [
      /\bmasters?\b/,
      /\bm\s*[a-z]{0,3}\b/,
      /\bmba\b/,
      /硕士/,
      /研究生/,
    ],
  },
  {
    level: "bachelor",
    confidence: 1,
    patterns: [
      /\bbachelors?\b/,
      /\bb\s*[a-z]{1,2}\b/,
      /\bundergraduate\b/,
      /学士/,
      /本科/,
      /大学本科/,
    ],
  },
  {
    level: "associate",
    confidence: 0.95,
    patterns: [
      /\bassociate(?:s)?\b/,
      /\ba\s*a\s*s\b/,
      /副学士/,
      /专科/,
      /大专/,
    ],
  },
  {
    level: "vocational",
    confidence: 0.95,
    patterns: [
      /\bvocational\b/,
      /\btechnical\s+secondary\b/,
      /\bpolytechnic\s+(?:school|college)\b/,
      /职业高中/,
      /中职/,
      /职高/,
    ],
  },
  {
    level: "secondary",
    confidence: 1,
    patterns: [
      /\bhigh\s+school\b/,
      /\bsecondary\s+school\b/,
      /\bsenior\s+high\b/,
      /高中/,
      /普通高中/,
      /中学/,
    ],
  },
];

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Maps a global credential label onto an ordered academic level. */
export function normalizeQualification(
  credential: unknown,
  options: QualificationNormalizationOptions = {},
): NormalizedQualification {
  const unknownResult = (reason: string): NormalizedQualification => ({
    level: "unknown",
    standardized: null,
    reviewRequired: true,
    confidence: 0,
    reason,
    matchedLabel: null,
  });
  if (typeof credential !== "string" || !credential.trim())
    return unknownResult("missing_credential");
  const normalized = normalizeText(credential);
  if (!normalized) return unknownResult("missing_credential");
  const labels = [
    ...credentialLabels,
    ...(options.additionalLabels ?? []).map((label) => ({
      level: "unknown" as const,
      confidence: 0.8,
      patterns: [new RegExp(normalizeText(label))],
    })),
  ];
  for (const entry of labels)
    for (const pattern of entry.patterns)
      if (pattern.test(normalized)) {
        const level = entry.level;
        return {
          level,
          standardized:
            level === "unknown" ? null : (tierForLevel[level] ?? null),
          reviewRequired: level === "unknown",
          confidence: entry.confidence,
          reason:
            level === "unknown"
              ? "unrecognized_credential"
              : "recognized_credential",
          matchedLabel: credential.trim().slice(0, 120),
        };
      }
  return unknownResult("unrecognized_credential");
}

export function qualificationLevelValue(level: QualificationLevel) {
  return level === "unknown" ? null : levelOrder[level];
}

export type ApplicantQualificationProfile = {
  qualification?: string | null;
  qualifications?: readonly (string | null)[];
};

export type OpportunityQualificationRules = {
  minQualification?: string | null;
};

/**
 * Evaluates whether an applicant's academic background meets the minimum
 * degree prerequisite. Unrecognized credentials raise a review flag instead of
 * a definitive rejection.
 */
export function evaluateQualificationEligibility(
  applicantProfile: ApplicantQualificationProfile | null | undefined,
  opportunityRules: OpportunityQualificationRules | null | undefined,
  options: QualificationNormalizationOptions = {},
): QualificationEligibility {
  const requiredLabel = opportunityRules?.minQualification ?? null;
  const requiredTier = requiredLabel
    ? ((["secondary", "bachelor", "master", "doctorate"] as const).find(
        (tier) => tier === requiredLabel,
      ) ?? null)
    : null;
  const base = {
    applicantLevel: "unknown" as QualificationLevel,
    applicantTier: null as StandardizedTier,
    requiredTier,
    requiredLevel: requiredTier ? tierLevels[requiredTier] : null,
  };
  if (!requiredTier)
    return {
      ...base,
      eligible: true,
      status: "no_requirement",
      reviewRequired: false,
      explanationKey: "qualification.no_requirement",
      reason: "no_minimum_qualification_stated",
    };
  const candidates = [
    ...(applicantProfile?.qualifications ?? []),
    applicantProfile?.qualification ?? null,
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  if (!candidates.length)
    return {
      ...base,
      eligible: false,
      status: "review_required",
      reviewRequired: true,
      explanationKey: "qualification.review_required",
      reason: "missing_qualification",
    };
  const normalized = candidates.map((value) =>
    normalizeQualification(value, options),
  );
  const known = normalized.filter((entry) => entry.level !== "unknown");
  if (!known.length)
    return {
      ...base,
      eligible: false,
      status: "review_required",
      reviewRequired: true,
      explanationKey: "qualification.review_required",
      reason: "unrecognized_credential",
    };
  const best = known.sort(
    (left, right) =>
      (qualificationLevelValue(right.level) ?? 0) -
      (qualificationLevelValue(left.level) ?? 0),
  )[0];
  const applicantLevel = best.level;
  const applicantTier = best.standardized;
  const level = qualificationLevelValue(applicantLevel) ?? 0;
  const meets = level >= tierLevels[requiredTier];
  return {
    eligible: meets,
    status: meets ? "meets" : "below",
    reviewRequired: false,
    applicantLevel,
    applicantTier,
    requiredTier,
    requiredLevel: tierLevels[requiredTier],
    explanationKey: meets
      ? "qualification.meets_requirement"
      : "qualification.below_requirement",
    reason: meets
      ? "applicant_level_meets_requirement"
      : "applicant_level_below_requirement",
  };
}

type DisciplineFamily = {
  key: string;
  aliases: string[];
};

const disciplineFamilies: DisciplineFamily[] = [
  {
    key: "robotics",
    aliases: ["robotics", "robotic", "robot", "industrial robotics"],
  },
  {
    key: "mechatronics",
    aliases: ["mechatronics", "mechatronic", "mechatronical"],
  },
  {
    key: "industrial_automation",
    aliases: [
      "industrial automation",
      "automation",
      "industrial control",
      "control systems",
      "process control",
      "plc",
      "scada",
    ],
  },
  {
    key: "smart_manufacturing",
    aliases: [
      "smart manufacturing",
      "intelligent manufacturing",
      "digital twin",
      "digital twins",
      "predictive maintenance",
    ],
  },
  {
    key: "computer_science",
    aliases: [
      "computer science",
      "software engineering",
      "artificial intelligence",
      "data science",
      "information technology",
      "programming",
    ],
  },
  {
    key: "mechanical_engineering",
    aliases: [
      "mechanical engineering",
      "mechanical",
      "manufacturing engineering",
      "machine design",
      "thermodynamics",
    ],
  },
  {
    key: "electrical_engineering",
    aliases: [
      "electrical engineering",
      "electrical",
      "electronics",
      "power systems",
      "signal processing",
    ],
  },
  {
    key: "manufacturing",
    aliases: [
      "manufacturing",
      "industrial manufacturing",
      "production engineering",
      "lean manufacturing",
      "process manufacturing",
    ],
  },
  {
    key: "civil_engineering",
    aliases: ["civil engineering", "civil", "structural engineering"],
  },
  {
    key: "chemical_engineering",
    aliases: ["chemical engineering", "chemical", "process safety"],
  },
];

const chineseDisciplines: Record<string, string> = {
  机器人: "robotics",
  机电一体化: "mechatronics",
  机电: "mechatronics",
  工业自动化: "industrial_automation",
  自动化: "industrial_automation",
  智能制造: "smart_manufacturing",
  计算机科学: "computer_science",
  计算机: "computer_science",
  软件工程: "computer_science",
  机械工程: "mechanical_engineering",
  电气工程: "electrical_engineering",
  制造工程: "manufacturing",
  土木工程: "civil_engineering",
  化学工程: "chemical_engineering",
};

const relations: Record<string, number> = {
  "robotics|mechatronics": 0.85,
  "robotics|industrial_automation": 0.8,
  "robotics|smart_manufacturing": 0.8,
  "mechatronics|industrial_automation": 0.8,
  "mechatronics|smart_manufacturing": 0.75,
  "industrial_automation|smart_manufacturing": 0.85,
  "computer_science|smart_manufacturing": 0.7,
  "computer_science|industrial_automation": 0.65,
  "computer_science|robotics": 0.6,
  "mechanical_engineering|smart_manufacturing": 0.7,
  "mechanical_engineering|manufacturing": 0.8,
  "electrical_engineering|industrial_automation": 0.7,
  "electrical_engineering|mechatronics": 0.6,
  "manufacturing|smart_manufacturing": 0.85,
  "mechanical_engineering|robotics": 0.55,
  "civil_engineering|manufacturing": 0.45,
  "chemical_engineering|manufacturing": 0.45,
};

const coreFamilies = new Set([
  "robotics",
  "mechatronics",
  "industrial_automation",
  "smart_manufacturing",
  "computer_science",
  "mechanical_engineering",
  "electrical_engineering",
  "manufacturing",
]);

const peripheralFamilies = new Set([
  "civil_engineering",
  "chemical_engineering",
]);

function disciplineKey(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  for (const [chinese, key] of Object.entries(chineseDisciplines))
    if (normalized.includes(chinese)) return key;
  for (const family of disciplineFamilies)
    if (family.aliases.some((alias) => alias === normalized)) return family.key;
  return null;
}

function relationScore(left: string, right: string) {
  if (left === right) return 1;
  const direct =
    relations[`${left}|${right}`] ?? relations[`${right}|${left}`] ?? 0;
  if (direct) return direct;
  // A general STEM baseline: related engineering fields share some foundation,
  // but distant fields only reach a weak overlap.
  if (coreFamilies.has(left) && coreFamilies.has(right)) return 0.4;
  if (
    (coreFamilies.has(left) && peripheralFamilies.has(right)) ||
    (peripheralFamilies.has(left) && coreFamilies.has(right))
  )
    return 0.25;
  if (peripheralFamilies.has(left) && peripheralFamilies.has(right)) return 0.2;
  return 0;
}

/**
 * Scores how closely an applicant's discipline matches the target topics of an
 * opportunity. Unrecognized disciplines return an uncertainty flag instead of
 * a confident zero.
 */
export function scoreFieldRelevance(
  applicantDiscipline: unknown,
  targetTopics: unknown,
): FieldRelevanceResult {
  const topics = Array.isArray(targetTopics)
    ? targetTopics.filter(
        (topic): topic is string =>
          typeof topic === "string" && topic.trim().length > 0,
      )
    : [];
  if (typeof applicantDiscipline !== "string" || !applicantDiscipline.trim())
    return {
      score: 0,
      matches: [],
      reviewRequired: true,
      reason: "missing_discipline",
    };
  if (!topics.length)
    return {
      score: 0,
      matches: [],
      reviewRequired: false,
      reason: "no_target_topics",
    };
  const applicant = disciplineKey(applicantDiscipline);
  if (!applicant)
    return {
      score: 0,
      matches: [],
      reviewRequired: true,
      reason: "unrecognized_discipline",
    };
  const matches = topics.map((topic) => {
    const key = disciplineKey(topic);
    return {
      topic,
      score: key ? Math.round(relationScore(applicant, key) * 100) / 100 : 0,
    };
  });
  const score =
    Math.round(Math.max(...matches.map((match) => match.score)) * 100) / 100;
  return {
    score,
    matches,
    reviewRequired: false,
    reason:
      score >= 0.6
        ? "discipline_matched"
        : score > 0
          ? "weak_discipline_overlap"
          : "no_discipline_overlap",
  };
}
