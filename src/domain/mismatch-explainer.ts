import { currentAgeRange } from "./age";
import { checkLanguageTest, languageTestKey } from "./language-tests";
import { evaluateLanguageRequirement } from "./language-scoring";

export type MismatchDimension =
  | "nationality"
  | "residence"
  | "age"
  | "qualification"
  | "study_level"
  | "language_test"
  | "input";

export type MismatchSeverity = "mismatch" | "guidance";

export type MismatchReason = {
  dimension: MismatchDimension;
  severity: MismatchSeverity;
  code: string;
  explanationKey: string;
  explanation: string;
  details: Record<string, string | number | null>;
};

export type MismatchExplanation = {
  isMatch: boolean;
  confirmed: boolean;
  mismatches: MismatchReason[];
  guidance: MismatchReason[];
  affinity: number;
  affinityBasis: { matched: number; evaluated: number };
  locale: "en" | "zh-Hans";
};

export type MismatchOptions = {
  locale?: "en" | "zh-Hans";
  now?: Date;
};

type ProfileFacts = {
  nationality: string | null;
  residenceCountry: string | null;
  qualification: string | null;
  targetLevels: string[];
  languageTest: {
    name: string;
    scale: number;
    score: number;
    testedOn: string | null;
    validUntil: string | null;
  } | null;
  age: number | null;
  birthYear: number | null;
  ageAsOf: string | null;
};

type OpportunityFacts = {
  studyLevel: string | null;
  category: string | null;
  rules: {
    nationalities: string[] | null;
    residenceCountries: string[] | null;
    minAge: number | null;
    maxAge: number | null;
    minQualification: string | null;
    languageTest: {
      name: string;
      scale: number;
      minimumScore: number;
    } | null;
  } | null;
};

const qualificationOrder = ["secondary", "bachelor", "master", "doctorate"];

const messages: Record<string, { en: string; zh: string }> = {
  "nationality.mismatch": {
    en: "This opportunity does not accept applicants of your nationality ({value}).",
    zh: "该机会不接受您当前国籍（{value}）的申请者。",
  },
  "nationality.unknown": {
    en: "Nationality requirements are not stated for this opportunity.",
    zh: "该机会未说明国籍要求。",
  },
  "nationality.missing": {
    en: "Add your nationality to check this restriction.",
    zh: "请补充国籍以核实该限制。",
  },
  "residence.mismatch": {
    en: "This opportunity is not open to residents of your country ({value}).",
    zh: "该机会不向您当前居住国家（{value}）的居民开放。",
  },
  "residence.unknown": {
    en: "Residence requirements are not stated for this opportunity.",
    zh: "该机会未说明居住地要求。",
  },
  "residence.missing": {
    en: "Add your country of residence to check this restriction.",
    zh: "请补充居住国家以核实该限制。",
  },
  "age.below_minimum": {
    en: "The minimum age for this opportunity is {value} and your recorded age is below it.",
    zh: "该机会的最低年龄为 {value}，您记录的年龄低于此要求。",
  },
  "age.above_maximum": {
    en: "The maximum age for this opportunity is {value} and your recorded age is above it.",
    zh: "该机会的最高年龄为 {value}，您记录的年龄高于此要求。",
  },
  "age.overlap": {
    en: "Your birth-year age range overlaps the recorded age limits; check the source and your birthday.",
    zh: "您按出生年份推算的年龄范围与已记录的年龄限制存在重叠，请结合官方来源和生日核实。",
  },
  "age.unknown": {
    en: "Confirm your current age or add your birth year to check age limits.",
    zh: "请确认您当前年龄或补充出生年份以核实年龄限制。",
  },
  "qualification.below": {
    en: "This opportunity requires at least a {value} qualification and your recorded qualification is lower.",
    zh: "该机会要求至少 {value} 学历，而您记录的学历低于此要求。",
  },
  "qualification.unknown": {
    en: "Minimum qualification is not stated for this opportunity.",
    zh: "该机会未说明最低学历要求。",
  },
  "qualification.missing": {
    en: "Your qualification needs checking against the source requirement.",
    zh: "您的学历仍需结合官方来源的学历要求核实。",
  },
  "study_level.mismatch": {
    en: "This opportunity is for {value} study and your saved target levels do not include it.",
    zh: "该机会面向{value}阶段学习，而您保存的目标层次不包含该阶段。",
  },
  "study_level.unknown": {
    en: "The study level for this opportunity is not stated.",
    zh: "该机会的学习层次未说明。",
  },
  "language.below": {
    en: "Your recorded language-test score is below the required minimum ({value}).",
    zh: "您记录的语言考试成绩低于要求的最低分（{value}）。",
  },
  "language.missing": {
    en: "Add your language-test result to check this requirement.",
    zh: "请补充语言考试成绩以核实该项要求。",
  },
  "language.unknown": {
    en: "Language-test evidence needs checking: missing, expired or different test/version/scale.",
    zh: "语言考试资料需要核实：资料缺失、过期或考试、版本、分制不同。",
  },
  "input.invalid": {
    en: "The opportunity or profile details could not be read, so no comparison was made.",
    zh: "无法读取机会或个人资料详情，因此未进行比较。",
  },
};

const studyLevelLabels: Record<string, { en: string; zh: string }> = {
  bachelor: { en: "bachelor", zh: "本科" },
  master: { en: "master", zh: "硕士" },
  doctorate: { en: "doctorate", zh: "博士" },
};

const qualificationLabels: Record<string, { en: string; zh: string }> = {
  secondary: { en: "secondary", zh: "高中" },
  bachelor: { en: "bachelor", zh: "本科" },
  master: { en: "master", zh: "硕士" },
  doctorate: { en: "doctorate", zh: "博士" },
};

function text(
  code: string,
  locale: "en" | "zh-Hans",
  values: Record<string, string | number | null> = {},
) {
  const entry = messages[code];
  const template = entry ? (locale === "zh-Hans" ? entry.zh : entry.en) : code;
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) =>
    Object.hasOwn(values, name) && values[name] !== null
      ? String(values[name])
      : match,
  );
}

function label(
  map: Record<string, { en: string; zh: string }>,
  key: string,
  locale: "en" | "zh-Hans",
) {
  const entry = map[key];
  if (!entry) return key;
  return locale === "zh-Hans" ? entry.zh : entry.en;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readProfile(value: unknown): ProfileFacts {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const languageTest = record.languageTest as Record<string, unknown> | null;
  return {
    nationality: stringOrNull(record.nationality),
    residenceCountry: stringOrNull(record.residenceCountry),
    qualification: stringOrNull(record.qualification),
    targetLevels: Array.isArray(record.targetLevels)
      ? record.targetLevels.filter(
          (level): level is string =>
            typeof level === "string" &&
            ["bachelor", "master", "doctorate"].includes(level),
        )
      : [],
    languageTest:
      languageTest && typeof languageTest === "object"
        ? {
            name: stringOrNull(languageTest.name) ?? "",
            scale: numberOrNull(languageTest.scale) ?? 0,
            score: numberOrNull(languageTest.score) ?? 0,
            testedOn: stringOrNull(languageTest.testedOn),
            validUntil: stringOrNull(languageTest.validUntil),
          }
        : null,
    age: numberOrNull(record.age),
    birthYear: numberOrNull(record.birthYear),
    ageAsOf: stringOrNull(record.ageAsOf),
  };
}

function readOpportunity(value: unknown): OpportunityFacts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rules = record.eligibilityRules as Record<string, unknown> | null;
  const languageTest = rules?.languageTest as
    Record<string, unknown> | null | undefined;
  const list = (input: unknown) =>
    Array.isArray(input)
      ? input.filter(
          (entry): entry is string =>
            typeof entry === "string" && /^(?:[A-Z]{2}|ALL)$/.test(entry),
        )
      : null;
  return {
    studyLevel: stringOrNull(record.studyLevel),
    category: stringOrNull(record.category),
    rules:
      rules && typeof rules === "object"
        ? {
            nationalities: list(rules.nationalities),
            residenceCountries: list(rules.residenceCountries),
            minAge: numberOrNull(rules.minAge),
            maxAge: numberOrNull(rules.maxAge),
            minQualification: stringOrNull(rules.minQualification),
            languageTest:
              languageTest &&
              typeof languageTest === "object" &&
              stringOrNull(languageTest.name) &&
              numberOrNull(languageTest.scale) !== null &&
              numberOrNull(languageTest.minimumScore) !== null
                ? {
                    name: stringOrNull(languageTest.name)!,
                    scale: numberOrNull(languageTest.scale)!,
                    minimumScore: numberOrNull(languageTest.minimumScore)!,
                  }
                : null,
          }
        : null,
  };
}

function reason(
  dimension: MismatchDimension,
  severity: MismatchSeverity,
  code: string,
  locale: "en" | "zh-Hans",
  details: Record<string, string | number | null> = {},
): MismatchReason {
  return {
    dimension,
    severity,
    code,
    explanationKey: `mismatch.${code}`,
    explanation: text(code, locale, details),
    details,
  };
}

/** Maps a recorded catalogue requirement onto a standardized scoring rule. */
function standardizedRequirement(requirement: {
  name: string;
  scale: number;
  minimumScore: number;
}) {
  const name = languageTestKey(requirement.name);
  if (name.includes("ielts") && requirement.scale <= 9)
    return {
      test: "ielts" as const,
      requirement: {
        test: "ielts" as const,
        minimumOverall: requirement.minimumScore,
      },
    };
  if (name.includes("toefl") && requirement.scale > 9)
    return {
      test: "toefl-ibt" as const,
      requirement: {
        test: "toefl-ibt" as const,
        minimumTotal: requirement.minimumScore,
      },
    };
  return null;
}

function languageReasons(
  profile: ProfileFacts,
  requirement: { name: string; scale: number; minimumScore: number },
  locale: "en" | "zh-Hans",
  now: Date,
): MismatchReason[] {
  const standardized = standardizedRequirement(requirement);
  if (standardized && profile.languageTest) {
    const record = profile.languageTest;
    if (record.scale === requirement.scale) {
      const score =
        standardized.test === "ielts"
          ? { test: "ielts" as const, overall: record.score }
          : { test: "toefl-ibt" as const, total: record.score };
      const evaluated = evaluateLanguageRequirement(
        {
          ...score,
          testedOn: record.testedOn,
          validUntil: record.validUntil,
        },
        { ...standardized.requirement, asOf: now.toISOString().slice(0, 10) },
      );
      if (evaluated.status === "ineligible") {
        // Expired or undated evidence needs checking; only a real score
        // deficit is a fatal mismatch.
        const scoreDeficit = evaluated.deficits.find(
          (item) => item.field !== "validity" && item.shortfall !== null,
        );
        if (!scoreDeficit)
          return [
            reason("language_test", "guidance", "language.unknown", locale),
          ];
        const shortfall = scoreDeficit.shortfall ?? null;
        return [
          reason("language_test", "mismatch", "language.below", locale, {
            value: requirement.minimumScore,
            score: record.score,
            shortfall,
            test: standardized.test,
          }),
        ];
      }
      if (evaluated.status === "eligible") return [];
      return [reason("language_test", "guidance", "language.unknown", locale)];
    }
  }
  const generic = checkLanguageTest(
    profile.languageTest
      ? {
          name: profile.languageTest.name,
          scale: profile.languageTest.scale,
          score: profile.languageTest.score,
          testedOn: profile.languageTest.testedOn,
          validUntil: profile.languageTest.validUntil,
        }
      : null,
    requirement,
    now,
  );
  if (generic === "below")
    return [
      reason("language_test", "mismatch", "language.below", locale, {
        value: requirement.minimumScore,
        score: profile.languageTest?.score ?? null,
        test: requirement.name,
      }),
    ];
  if (generic === "unknown")
    return [
      profile.languageTest
        ? reason("language_test", "guidance", "language.unknown", locale)
        : reason("language_test", "guidance", "language.missing", locale),
    ];
  return [];
}

/**
 * Explains, without side effects, why an opportunity does not match a saved
 * profile. Missing profile facts are guidance, never a fabricated mismatch.
 */
export function explainOpportunityMismatch(
  opportunity: unknown,
  profile: unknown,
  options: MismatchOptions = {},
): MismatchExplanation {
  const locale = options.locale === "zh-Hans" ? "zh-Hans" : "en";
  const now = options.now ?? new Date();
  const facts = readOpportunity(opportunity);
  const empty: MismatchExplanation = {
    isMatch: false,
    confirmed: false,
    mismatches: [],
    guidance: [reason("input", "guidance", "input.invalid", locale)],
    affinity: 0,
    affinityBasis: { matched: 0, evaluated: 0 },
    locale,
  };
  if (!facts || !Number.isFinite(now.getTime())) return empty;

  const applicant = readProfile(profile);
  const mismatches: MismatchReason[] = [];
  const guidance: MismatchReason[] = [];
  let matched = 0;
  let evaluated = 0;

  const rules = facts.rules;
  if (rules?.nationalities) {
    evaluated++;
    if (rules.nationalities.includes("ALL")) matched++;
    else if (!applicant.nationality)
      guidance.push(
        reason("nationality", "guidance", "nationality.missing", locale),
      );
    else if (!rules.nationalities.includes(applicant.nationality)) {
      mismatches.push(
        reason("nationality", "mismatch", "nationality.mismatch", locale, {
          value: applicant.nationality,
        }),
      );
    } else matched++;
  } else
    guidance.push(
      reason("nationality", "guidance", "nationality.unknown", locale),
    );

  if (rules?.residenceCountries) {
    evaluated++;
    if (rules.residenceCountries.includes("ALL")) matched++;
    else if (!applicant.residenceCountry)
      guidance.push(
        reason("residence", "guidance", "residence.missing", locale),
      );
    else if (!rules.residenceCountries.includes(applicant.residenceCountry)) {
      mismatches.push(
        reason("residence", "mismatch", "residence.mismatch", locale, {
          value: applicant.residenceCountry,
        }),
      );
    } else matched++;
  } else
    guidance.push(reason("residence", "guidance", "residence.unknown", locale));

  if (rules && (rules.minAge !== null || rules.maxAge !== null)) {
    evaluated++;
    const range = currentAgeRange(
      {
        age: applicant.age,
        birthYear: applicant.birthYear,
        ageAsOf: applicant.ageAsOf,
      },
      now,
    );
    if (!range) guidance.push(reason("age", "guidance", "age.unknown", locale));
    else if (
      (rules.minAge !== null && range.max < rules.minAge) ||
      (rules.maxAge !== null && range.min > rules.maxAge)
    ) {
      if (rules.minAge !== null && range.max < rules.minAge)
        mismatches.push(
          reason("age", "mismatch", "age.below_minimum", locale, {
            value: rules.minAge,
            age: range.max,
          }),
        );
      else
        mismatches.push(
          reason("age", "mismatch", "age.above_maximum", locale, {
            value: rules.maxAge,
            age: range.min,
          }),
        );
    } else if (
      (rules.minAge !== null && range.min < rules.minAge) ||
      (rules.maxAge !== null && range.max > rules.maxAge)
    )
      guidance.push(reason("age", "guidance", "age.overlap", locale));
    else matched++;
  } else guidance.push(reason("age", "guidance", "age.unknown", locale));

  if (rules?.minQualification) {
    evaluated++;
    if (!applicant.qualification || applicant.qualification === "other")
      guidance.push(
        reason("qualification", "guidance", "qualification.missing", locale),
      );
    else if (
      qualificationOrder.indexOf(applicant.qualification) <
      qualificationOrder.indexOf(rules.minQualification)
    )
      mismatches.push(
        reason("qualification", "mismatch", "qualification.below", locale, {
          value: label(qualificationLabels, rules.minQualification, locale),
        }),
      );
    else matched++;
  } else
    guidance.push(
      reason("qualification", "guidance", "qualification.unknown", locale),
    );

  if (facts.category === "scholarship") {
    evaluated++;
    if (!facts.studyLevel)
      guidance.push(
        reason("study_level", "guidance", "study_level.unknown", locale),
      );
    else if (!applicant.targetLevels.length)
      guidance.push(
        reason("study_level", "guidance", "study_level.unknown", locale),
      );
    else if (!applicant.targetLevels.includes(facts.studyLevel))
      mismatches.push(
        reason("study_level", "mismatch", "study_level.mismatch", locale, {
          value: label(studyLevelLabels, facts.studyLevel, locale),
        }),
      );
    else matched++;
  }

  if (rules?.languageTest) {
    evaluated++;
    const reasons = languageReasons(applicant, rules.languageTest, locale, now);
    const fatal = reasons.filter((item) => item.severity === "mismatch");
    if (fatal.length) mismatches.push(...fatal);
    else if (reasons.length) guidance.push(...reasons);
    else matched++;
  }

  const affinity = evaluated ? Math.round((matched / evaluated) * 100) : 0;
  return {
    isMatch: mismatches.length === 0 && guidance.length === 0,
    confirmed: mismatches.length === 0 && guidance.length === 0,
    mismatches,
    guidance,
    affinity,
    affinityBasis: { matched, evaluated },
    locale,
  };
}
