import { isIP } from "node:net";
import { publicURL } from "../catalogue/schema";
import { sourceHTMLToText } from "./source-text";

export const MAX_MULTI_EXTRACTOR_HTML_BYTES = 256_000;
export const MAX_MULTI_EXTRACTOR_RESULTS = 50;

export type MultiExtractorOptions = {
  maxResults?: number;
  maxHtmlBytes?: number;
};

export type ExtractedOpportunity = {
  title: string | null;
  url: string | null;
  deadlineText: string | null;
  funding:
    | "fully_funded"
    | "tuition_only"
    | "free_participation"
    | "partial"
    | "unknown";
  host: string | null;
  confidence: number;
  source: "row" | "item" | "card";
};

const fundingPatterns: {
  pattern: RegExp;
  funding: ExtractedOpportunity["funding"];
}[] = [
  {
    pattern:
      /fully\s+funded|full\s+(?:tuition|funding)|全额(?:资助|奖学金)|学费全免|全额覆盖/i,
    funding: "fully_funded",
  },
  {
    pattern: /tuition\s+(?:only|waiver)|免学费|学费减免/i,
    funding: "tuition_only",
  },
  {
    pattern:
      /free\s+(?:participation|to\s+attend)|免费参加|免学费参加|免费学习/i,
    funding: "free_participation",
  },
  {
    pattern:
      /partial(?:ly)?\s+(?:fund|scholarship|tuition)|部分(?:资助|奖学金)|部分学费/i,
    funding: "partial",
  },
  {
    pattern: /scholarship|fellowship|bursary|奖学金|助学金|助学/i,
    funding: "unknown",
  },
];
const deadlineLabel =
  /deadline|closing(?:\s+date)?|apply\s+by|applications?\s+close|截止/i;
const deadlineDate = /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}\s*日?/;
const hostPattern =
  /((?:[A-Z][\w'’.&\-]*\s+){0,4}(?:University|College|Institute|Polytechnic|Academy)(?:\s+(?:of|and|for|the)\s+[A-Z][\w'’.&\-]*|\s+[A-Z][\w'’.&\-]*){0,3})|([\u4e00-\u9fa5]{2,20}(?:大学|学院|研究院))/;
const cardTokens = new Set([
  "card",
  "cards",
  "listing",
  "listings",
  "opportunity",
  "opportunities",
  "program",
  "programme",
  "programmes",
  "result",
  "results",
  "item",
  "items",
]);
const trackingParameters = /^(?:fbclid|gclid|mc_[ce]id|ref|source|utm_.+)$/i;
const binaryExtension =
  /\.(?:7z|csv|docx?|gif|jpe?g|pdf|png|svg|tiff?|webp|xlsx?|zip)$/i;

function limit(value: number | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error("Multi-opportunity extraction limits are invalid.");
  return value;
}

function attribute(tag: string, name: string) {
  const match = tag.match(
    new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function decodeEntities(value: string) {
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
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    },
  );
}

function plainText(value: string) {
  return decodeEntities(sourceHTMLToText(value)).replace(/\s+/g, " ").trim();
}

type Block = { html: string; kind: ExtractedOpportunity["source"] };

/** Captures the inner content of one element, honouring same-name nesting. */
function innerOf(html: string, start: number, name: string) {
  const pattern = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  pattern.lastIndex = start;
  // The element itself is already open; only its closing tag ends the block.
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    if (match[1]) {
      depth--;
      if (depth === 0)
        return { html: html.slice(start, match.index), end: pattern.lastIndex };
    } else if (!/\/\s*$/.test(match[0])) depth++;
  }
  return null;
}

function blocks(html: string): Block[] {
  const result: Block[] = [];
  const opening = /<(tr|li|div|article|section)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(html))) {
    const name = match[1].toLowerCase();
    const attributes = match[2] ?? "";
    const isRow = name === "tr";
    const isItem = name === "li";
    const isCard =
      !isRow &&
      !isItem &&
      (attribute(`<${name}${attributes}>`, "class") ?? "")
        .split(/[^A-Za-z0-9]+/)
        .some((token) => cardTokens.has(token.toLowerCase()));
    if (!isRow && !isItem && !isCard) continue;
    const inner = innerOf(html, opening.lastIndex, name);
    if (!inner) continue;
    opening.lastIndex = inner.end;
    result.push({
      html: inner.html,
      kind: isRow ? "row" : isItem ? "item" : "card",
    });
  }
  return result;
}

function anchorsOf(html: string) {
  const found: { href: string; text: string }[] = [];
  const opening = /<a\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(html))) {
    const href = attribute(`<a${match[1]}>`, "href");
    if (href === null) continue;
    const inner = innerOf(html, opening.lastIndex, "a");
    if (!inner) continue;
    opening.lastIndex = inner.end;
    found.push({
      href: decodeEntities(href).trim(),
      text: plainText(inner.html),
    });
  }
  return found;
}

function cellsOf(html: string) {
  const cells: string[] = [];
  const opening = /<(td|th)\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(html))) {
    const inner = innerOf(html, opening.lastIndex, match[1]);
    if (!inner) continue;
    opening.lastIndex = inner.end;
    cells.push(plainText(inner.html));
  }
  return cells;
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

function resolveUrl(href: string, base: URL, root: string) {
  if (!href || /^(?:#|data:|javascript:|mailto:|tel:)/i.test(href)) return null;
  let candidate: URL;
  try {
    candidate = new URL(href, base);
  } catch {
    return null;
  }
  const hostname = candidate.hostname.toLowerCase().replace(/\.+$/, "");
  const baseHost = base.hostname.toLowerCase().replace(/\.+$/, "");
  if (
    candidate.protocol !== "https:" ||
    candidate.username ||
    candidate.password ||
    candidate.port ||
    isIP(hostname) ||
    binaryExtension.test(candidate.pathname)
  )
    return null;
  if (
    hostname !== baseHost &&
    hostname !== root &&
    !hostname.endsWith(`.${root}`)
  )
    return null;
  const parsed = publicURL.safeParse(candidate.href);
  if (!parsed.success) return null;
  const canonical = new URL(parsed.data);
  canonical.hash = "";
  for (const key of [...canonical.searchParams.keys()])
    if (trackingParameters.test(key)) canonical.searchParams.delete(key);
  canonical.searchParams.sort();
  return canonical.href;
}

/** Reads one labelled value without pulling in neighbouring cell or card text. */
function labelledValue(
  cells: string[],
  text: string,
  label: RegExp,
  preferDate: boolean,
) {
  const fromLabel = (value: string) => {
    const match = value.match(label);
    if (!match) return null;
    const rest = value.slice(match.index! + match[0].length);
    if (preferDate) {
      const date = rest.match(deadlineDate);
      if (date) return date[0].trim();
    }
    const cleaned = rest
      .replace(/^\s*[:：]\s*/, "")
      .split(/[|·]/)
      .join(" ")
      .trim();
    return cleaned || null;
  };
  for (const cell of cells) {
    const value = fromLabel(cell);
    if (value) return value;
  }
  return fromLabel(text);
}

function hostValue(cells: string[], text: string) {
  for (const cell of cells) {
    const match = cell.match(hostPattern);
    if (match) return (match[1] ?? match[2] ?? "").trim();
  }
  const match = text.match(hostPattern);
  return match ? (match[1] ?? match[2] ?? "").trim() : null;
}

/** Extracts bounded, non-cross-contaminated opportunity records from one page. */
export function extractMultipleOpportunities(
  html: unknown,
  baseUrl: string,
  options: MultiExtractorOptions = {},
) {
  const maxResults = limit(
    options.maxResults,
    MAX_MULTI_EXTRACTOR_RESULTS,
    200,
  );
  const maxHtmlBytes = limit(
    options.maxHtmlBytes,
    MAX_MULTI_EXTRACTOR_HTML_BYTES,
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
  const root = academicRoot(base.hostname.toLowerCase().replace(/\.+$/, ""));
  const results: ExtractedOpportunity[] = [];
  const seen = new Set<string>();

  for (const block of blocks(html)) {
    if (results.length >= maxResults) break;
    const anchors = anchorsOf(block.html);
    const cells = block.kind === "row" ? cellsOf(block.html) : [];
    const text = plainText(block.html);
    if (!anchors.length && !cells.length) continue;
    const primary = anchors.find((anchor) => anchor.text) ?? anchors[0];
    const title =
      primary?.text || cells.find((cell) => cell.length > 2) || null;
    if (!title) continue;
    const url = primary ? resolveUrl(primary.href, base, root) : null;
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const deadlineText = labelledValue(cells, text, deadlineLabel, true);
    const funding =
      fundingPatterns.find(
        (entry) =>
          cells.some((cell) => entry.pattern.test(cell)) ||
          entry.pattern.test(text),
      )?.funding ?? "unknown";
    const host = hostValue(cells, text) ?? base.hostname.toLowerCase();
    const confidence = Math.min(
      1,
      0.4 + (deadlineText ? 0.2 : 0) + (funding !== "unknown" ? 0.2 : 0) + 0.2,
    );
    results.push({
      title: title.slice(0, 300),
      url,
      deadlineText: deadlineText ? deadlineText.slice(0, 120) : null,
      funding,
      host: host.slice(0, 200),
      confidence: Math.round(confidence * 100) / 100,
      source: block.kind,
    });
  }
  return results;
}
