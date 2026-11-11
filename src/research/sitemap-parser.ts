import { gunzipSync } from "node:zlib";

export type SitemapChangeFrequency =
  "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export type SitemapEntry = {
  loc: string;
  lastmod: string | null;
  changefreq: SitemapChangeFrequency | null;
  priority: number | null;
  kind: "url" | "sitemap";
  weight: number;
};

export type SitemapParseResult = {
  ok: boolean;
  kind: "urlset" | "sitemapindex" | "unknown";
  entries: SitemapEntry[];
  skipped: number;
  reason: string | null;
};

export type SitemapParseOptions = {
  /** Hosts that may appear in the sitemap. Defaults to the base origin host. */
  allowedHosts?: readonly string[];
  allowedOrigins?: readonly string[];
  /** Robots-style excluded path patterns. */
  excludedPaths?: readonly (string | RegExp)[];
  maxEntries?: number;
  maxBytes?: number;
};

const MAX_DEFAULT_ENTRIES = 50_000;
const MAX_DEFAULT_BYTES = 8_000_000;

const frequencyWeights: Record<SitemapChangeFrequency, number> = {
  always: 1,
  hourly: 0.9,
  daily: 0.8,
  weekly: 0.6,
  monthly: 0.4,
  yearly: 0.2,
  never: 0.1,
};

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(
      /&(?:amp|apos|gt|lt|quot|#39|#\d{1,7}|#x[\da-f]{1,6});/gi,
      (entity) => {
        const key = entity.toLowerCase();
        const named: Record<string, string> = {
          "&amp;": "&",
          "&apos;": "'",
          "&gt;": ">",
          "&lt;": "<",
          "&quot;": '"',
          "&#39;": "'",
        };
        if (named[key]) return named[key];
        const hexadecimal = key.startsWith("&#x");
        const code = Number.parseInt(
          key.slice(hexadecimal ? 3 : 2, -1),
          hexadecimal ? 16 : 10,
        );
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : "";
      },
    );
}

/** Extracts the text of every simple element with the given name. */
function elementTexts(xml: string, name: string) {
  const texts: string[] = [];
  const pattern = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)))
    texts.push(decodeEntities(match[1]).trim());
  return texts;
}

function containerBlocks(xml: string, name: string) {
  const blocks: string[] = [];
  const pattern = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) blocks.push(match[1]);
  return blocks;
}

/** Robots-style prefix match with `*` wildcards and an optional `$` anchor. */
export function matchesExcludedPath(path: string, pattern: string) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body
    .split("*")
    .map((part) => part.replace(/[\\^$+?.()|[\]{}]/g, "\\$&"))
    .join(".*");
  try {
    return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path);
  } catch {
    return false;
  }
}

function excluded(pathname: string, patterns: readonly (string | RegExp)[]) {
  return patterns.some((pattern) =>
    pattern instanceof RegExp
      ? pattern.test(pathname)
      : matchesExcludedPath(pathname, pattern),
  );
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

function changefreq(value: string): SitemapChangeFrequency | null {
  const normalized = value.trim().toLowerCase();
  return normalized in frequencyWeights
    ? (normalized as SitemapChangeFrequency)
    : null;
}

function priority(value: string) {
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : null;
}

/**
 * Parses a sitemaps.org XML document into normalized entries. The function
 * never throws: malformed input yields a structured failure result.
 */
export function parseSitemapXml(
  xmlContent: unknown,
  baseOrigin: string,
  options: SitemapParseOptions = {},
): SitemapParseResult {
  const empty: SitemapParseResult = {
    ok: false,
    kind: "unknown",
    entries: [],
    skipped: 0,
    reason: "invalid_content",
  };
  let xml: string;
  if (typeof xmlContent === "string") xml = xmlContent;
  else if (xmlContent instanceof Uint8Array) {
    const bytes = Buffer.from(xmlContent);
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      try {
        xml = gunzipSync(bytes).toString("utf8");
      } catch {
        return { ...empty, reason: "invalid_gzip" };
      }
    } else xml = bytes.toString("utf8");
  } else return empty;

  const maxBytes = options.maxBytes ?? MAX_DEFAULT_BYTES;
  if (!xml.trim() || Buffer.byteLength(xml) > maxBytes)
    return { ...empty, reason: "invalid_content" };
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml))
    return { ...empty, reason: "unsupported_declaration" };

  let base: URL;
  try {
    base = new URL(baseOrigin);
  } catch {
    return { ...empty, reason: "invalid_base_origin" };
  }
  if (base.protocol !== "https:" && base.protocol !== "http:")
    return { ...empty, reason: "invalid_base_origin" };

  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const isUrlSet = /<urlset[\s>]/i.test(xml);
  if (!isIndex && !isUrlSet) return { ...empty, reason: "not_a_sitemap" };

  const maxEntries = options.maxEntries ?? MAX_DEFAULT_ENTRIES;
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 50_000)
    return { ...empty, reason: "invalid_limit" };

  const allowedHosts = new Set(
    (options.allowedHosts ?? [base.hostname]).map(normalizeHost),
  );
  for (const origin of options.allowedOrigins ?? []) {
    try {
      allowedHosts.add(normalizeHost(new URL(origin).hostname));
    } catch {
      /* An invalid origin simply grants no additional host. */
    }
  }
  const patterns = options.excludedPaths ?? [];

  const entries: SitemapEntry[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const block of containerBlocks(xml, isIndex ? "sitemap" : "url")) {
    if (entries.length >= maxEntries) break;
    const loc = elementTexts(block, "loc")[0] ?? "";
    if (!loc) {
      skipped++;
      continue;
    }
    if (/\s/.test(loc)) {
      // A sitemap location must be a single URL without whitespace.
      skipped++;
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(loc, base);
    } catch {
      skipped++;
      continue;
    }
    if (
      resolved.protocol !== "https:" ||
      resolved.username ||
      resolved.password ||
      resolved.port ||
      !allowedHosts.has(normalizeHost(resolved.hostname))
    ) {
      skipped++;
      continue;
    }
    if (excluded(resolved.pathname, patterns)) {
      skipped++;
      continue;
    }
    resolved.hash = "";
    const canonical = resolved.href;
    if (seen.has(canonical)) {
      skipped++;
      continue;
    }
    seen.add(canonical);
    const frequency = changefreq(elementTexts(block, "changefreq")[0] ?? "");
    const weight =
      Math.round(
        (priority(elementTexts(block, "priority")[0] ?? "") ?? 0.5) *
          (frequency ? frequencyWeights[frequency] : 0.5) *
          10_000,
      ) / 10_000;
    entries.push({
      loc: canonical,
      lastmod: elementTexts(block, "lastmod")[0] || null,
      changefreq: frequency,
      priority: priority(elementTexts(block, "priority")[0] ?? ""),
      kind: isIndex ? "sitemap" : "url",
      weight,
    });
  }
  return {
    ok: true,
    kind: isIndex ? "sitemapindex" : "urlset",
    entries,
    skipped,
    reason: entries.length ? null : "no_entries",
  };
}
