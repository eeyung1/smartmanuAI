import { createHash } from "node:crypto";

export type SearchProvider = "google" | "bing" | "baidu";
export type DiscoveryInstitution = { name: string; domain?: string };
export type DiscoveryQueryOptions = {
  institutions: readonly (string | DiscoveryInstitution)[];
  providers?: readonly SearchProvider[];
  degreeTiers?: readonly string[];
  disciplines?: readonly string[];
  intakeYears?: readonly number[];
  languages?: readonly ("en" | "zh")[];
  negativeTerms?: readonly string[];
  siteDomain?: string;
  maxQueries?: number;
};
export type DiscoveryQuery = {
  id: string;
  query: string;
  provider: SearchProvider;
  priority: number;
  tags: {
    institution: string;
    domain: string | null;
    degree: string;
    discipline: string;
    intakeYear: number | null;
    language: "en" | "zh";
  };
};

const defaults = {
  providers: ["google", "bing", "baidu"] as SearchProvider[],
  degrees: ["master", "doctoral"],
  disciplines: ["smart manufacturing", "robotics"],
  negatives: ["consultancy", "agents", "commercial", "recruitment"],
};
const translations: Record<string, string> = {
  "smart manufacturing": "智能制造",
  robotics: "机器人",
  bachelor: "本科",
  undergraduate: "本科",
  master: "硕士",
  masters: "硕士",
  doctoral: "博士",
  doctorate: "博士",
  phd: "博士",
};
const providerSet = new Set<SearchProvider>(["google", "bing", "baidu"]);

function boundedText(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (
    !normalized ||
    normalized.length > 120 ||
    /[\u0000-\u001f]/.test(normalized)
  )
    throw new Error(`${label} is invalid.`);
  return normalized;
}

function domain(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = boundedText(value, "Institution domain")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(normalized))
    throw new Error("Institution domain is invalid.");
  return normalized;
}

function phrase(value: string) {
  return `"${value.replace(/["\\]/g, " ").trim()}"`;
}

function term(value: string, language: "en" | "zh") {
  const key = value.toLowerCase();
  return language === "zh" ? (translations[key] ?? value) : value;
}

function queryId(parts: unknown[]) {
  return `discovery-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 20)}`;
}

/** Generates bounded operator-reviewable queries; it does not call a search provider. */
export function generateDiscoveryQueries(
  options: DiscoveryQueryOptions,
): DiscoveryQuery[] {
  if (
    !options ||
    !Array.isArray(options.institutions) ||
    !options.institutions.length
  )
    throw new Error("At least one institution is required.");
  if (options.institutions.length > 50)
    throw new Error("Too many institutions.");
  const maxQueries = options.maxQueries ?? 100;
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 500)
    throw new Error("maxQueries must be between 1 and 500.");
  const providers = [...new Set(options.providers ?? defaults.providers)];
  if (
    !providers.length ||
    providers.some((provider) => !providerSet.has(provider))
  )
    throw new Error("Search provider selection is invalid.");
  const languages = [...new Set(options.languages ?? (["en", "zh"] as const))];
  if (
    !languages.length ||
    languages.some((language) => !["en", "zh"].includes(language))
  )
    throw new Error("Discovery language selection is invalid.");
  const degrees = (options.degreeTiers ?? defaults.degrees).map((value) =>
    boundedText(value, "Degree tier"),
  );
  const disciplines = (options.disciplines ?? defaults.disciplines).map(
    (value) => boundedText(value, "Discipline"),
  );
  if (
    !degrees.length ||
    degrees.length > 20 ||
    !disciplines.length ||
    disciplines.length > 20
  )
    throw new Error("Discovery dimensions are invalid.");
  const years = [...new Set(options.intakeYears ?? [])];
  if (
    years.length > 10 ||
    years.some((year) => !Number.isInteger(year) || year < 2000 || year > 2200)
  )
    throw new Error("Intake years are invalid.");
  const yearValues: (number | null)[] = years.length ? years.sort() : [null];
  const negatives = (options.negativeTerms ?? defaults.negatives).map((value) =>
    boundedText(value, "Negative term"),
  );
  if (negatives.length > 20) throw new Error("Too many negative terms.");
  const fallbackDomain = domain(options.siteDomain);
  const institutions = options.institutions.map((value) =>
    typeof value === "string"
      ? { name: boundedText(value, "Institution"), domain: fallbackDomain }
      : {
          name: boundedText(value?.name, "Institution"),
          domain: domain(value?.domain) ?? fallbackDomain,
        },
  );
  const output: DiscoveryQuery[] = [];
  const seen = new Set<string>();

  outer: for (const institution of institutions)
    for (const degree of degrees)
      for (const discipline of disciplines)
        for (const intakeYear of yearValues)
          for (const language of languages)
            for (const provider of providers) {
              const scholarship = language === "zh" ? "奖学金" : "scholarship";
              const words = [
                phrase(institution.name),
                phrase(term(discipline, language)),
                phrase(term(degree, language)),
                scholarship,
                ...(intakeYear ? [String(intakeYear)] : []),
                ...(institution.domain ? [`site:${institution.domain}`] : []),
                ...(provider === "baidu" ? [] : ["filetype:html"]),
                ...negatives.map((value) => `-${value.replace(/\s+/g, "-")}`),
              ];
              const query = words.join(" ");
              const identity = [
                provider,
                institution.name,
                institution.domain,
                degree,
                discipline,
                intakeYear,
                language,
              ];
              const id = queryId(identity);
              if (seen.has(id)) continue;
              seen.add(id);
              output.push({
                id,
                query,
                provider,
                priority: Math.max(
                  1,
                  100 -
                    output.length -
                    (language === "zh" && provider !== "baidu" ? 5 : 0) -
                    (language === "en" && provider === "baidu" ? 10 : 0),
                ),
                tags: {
                  institution: institution.name,
                  domain: institution.domain,
                  degree,
                  discipline,
                  intakeYear,
                  language,
                },
              });
              if (output.length >= maxQueries) break outer;
            }
  return output;
}
