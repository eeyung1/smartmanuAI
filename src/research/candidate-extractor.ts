import { isIP } from "node:net";
import { sourceHTMLToText } from "./source-text";

export const MAX_CANDIDATE_HTML_BYTES = 256_000;
export const MAX_CANDIDATE_LINKS = 50;

export type CandidateExtractorOptions = {
  maxCandidates?: number;
  maxHtmlBytes?: number;
  allowSubdomains?: boolean;
  permittedHosts?: readonly string[];
  keywords?: readonly string[];
};

const defaultKeywords = [
  "scholarship",
  "scholarships",
  "admission",
  "admissions",
  "international",
  "apply",
  "application",
  "bursary",
  "bursaries",
  "fellowship",
  "fellowships",
  "financial aid",
  "funding",
  "grant",
  "奖学金",
  "招生",
  "留学生",
  "国际学生",
  "申请",
];
const blockedHosts = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "t.me",
  "telegram.me",
  "twitter.com",
  "weibo.com",
  "wechat.com",
  "x.com",
  "youtube.com",
];
const binaryExtension =
  /\.(?:7z|avi|bmp|csv|doc|docx|gif|gz|ico|jpe?g|mov|mp3|mp4|pdf|png|ppt|pptx|rar|svg|tar|tiff?|webm|webp|xls|xlsx|xml|zip)$/i;
const trackingParameters = /^(?:fbclid|gclid|mc_[ce]id|ref|source|utm_.+)$/i;

function positiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error("Candidate extraction limits are invalid.");
  return value;
}

function decodeHtml(value: string) {
  return value.replace(
    /&(?:amp|apos|gt|lt|nbsp|quot|#39|#\d{1,7}|#x[\da-f]{1,6});/gi,
    (entity) => {
      const key = entity.toLowerCase();
      const named: Record<string, string> = {
        "&amp;": "&",
        "&apos;": "'",
        "&gt;": ">",
        "&lt;": "<",
        "&nbsp;": " ",
        "&quot;": '"',
        "&#39;": "'",
      };
      if (named[key]) return named[key];
      const hexadecimal = key.startsWith("&#x");
      const code = Number.parseInt(
        key.slice(hexadecimal ? 3 : 2, -1),
        hexadecimal ? 16 : 10,
      );
      return Number.isInteger(code) &&
        code > 0 &&
        code <= 0x10ffff &&
        !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : "";
    },
  );
}

function tagEnd(html: string, start: number) {
  let quote = "";
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") return index;
  }
  return -1;
}

function hrefFromTag(tag: string) {
  const values = [
    ...tag.matchAll(
      /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
    ),
  ];
  if (values.length !== 1) return null;
  return decodeHtml(values[0][1] ?? values[0][2] ?? values[0][3] ?? "").trim();
}

function anchors(html: string) {
  const safe = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    );
  const found: { href: string; text: string }[] = [];
  const opening = /<a(?=[\s>])/gi;
  for (let match = opening.exec(safe); match; match = opening.exec(safe)) {
    const end = tagEnd(safe, match.index + match[0].length);
    if (end < 0) break;
    const href = hrefFromTag(safe.slice(match.index + 2, end));
    opening.lastIndex = end + 1;
    if (!href) continue;
    const rest = safe.slice(end + 1);
    const closing = /<\/a\s*>/i.exec(rest);
    const inner = closing ? rest.slice(0, closing.index) : "";
    if (closing)
      opening.lastIndex = end + 1 + closing.index + closing[0].length;
    found.push({
      href,
      text: decodeHtml(sourceHTMLToText(inner)).replace(/\s+/g, " ").trim(),
    });
  }
  return found;
}

function academicRoot(hostname: string) {
  const host = hostname.replace(/^www\./, "");
  const labels = host.split(".");
  if (labels.length < 3) return host;
  const secondLast = labels.at(-2)!;
  if (["ac", "edu"].includes(secondLast)) return labels.slice(-3).join(".");
  if (labels.at(-1) === "edu") return labels.slice(-2).join(".");
  return host;
}

function normalizedHost(value: string) {
  try {
    const parsed = value.includes("://")
      ? new URL(value)
      : new URL(`https://${value}`);
    return parsed.hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    return null;
  }
}

function blockedHost(hostname: string) {
  return blockedHosts.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  );
}

function canonicalUrl(url: URL) {
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (trackingParameters.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

/** Extracts bounded, likely opportunity-page URLs. It never fetches discovered links. */
export function extractCandidateLinks(
  html: unknown,
  baseUrl: string,
  options: CandidateExtractorOptions = {},
) {
  const maxCandidates = positiveInteger(
    options.maxCandidates,
    MAX_CANDIDATE_LINKS,
    200,
  );
  const maxHtmlBytes = positiveInteger(
    options.maxHtmlBytes,
    MAX_CANDIDATE_HTML_BYTES,
    1_000_000,
  );
  if (typeof html !== "string" || Buffer.byteLength(html) > maxHtmlBytes)
    return [];
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.port ||
    isIP(base.hostname)
  )
    return [];
  const baseHost = base.hostname.toLowerCase().replace(/\.+$/, "");
  const root = academicRoot(baseHost);
  const permitted = new Set(
    (options.permittedHosts ?? [])
      .map(normalizedHost)
      .filter((host): host is string => host !== null),
  );
  const allowSubdomains = options.allowSubdomains !== false;
  const keywords = [...(options.keywords ?? defaultKeywords)]
    .map((value) => value.normalize("NFKC").trim().toLowerCase())
    .filter(Boolean);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors(html)) {
    if (result.length >= maxCandidates) break;
    if (/^(?:#|data:|javascript:|mailto:|tel:)/i.test(anchor.href)) continue;
    let candidate: URL;
    try {
      candidate = new URL(anchor.href, base);
    } catch {
      continue;
    }
    const hostname = candidate.hostname.toLowerCase().replace(/\.+$/, "");
    const allowedHost =
      hostname === baseHost ||
      permitted.has(hostname) ||
      (allowSubdomains && (hostname === root || hostname.endsWith(`.${root}`)));
    if (
      !allowedHost ||
      blockedHost(hostname) ||
      candidate.protocol !== "https:" ||
      candidate.username ||
      candidate.password ||
      candidate.port ||
      isIP(hostname) ||
      binaryExtension.test(candidate.pathname) ||
      /\/(?:login|logout|redirect|share)(?:\/|$)/i.test(candidate.pathname)
    )
      continue;
    const searchable =
      `${decodeURIComponentSafe(candidate.pathname)} ${anchor.text}`
        .normalize("NFKC")
        .toLowerCase();
    if (!keywords.some((keyword) => searchable.includes(keyword))) continue;
    const canonical = canonicalUrl(candidate);
    if (canonical.length > 2_000 || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
  }
  return result;
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
