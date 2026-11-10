import { publicURL } from "../catalogue/schema";
import { sourceHTMLToText } from "./source-text";

export const MAX_RSS_FEED_BYTES = 256_000;
export const MAX_RSS_FEED_ITEMS = 50;
const MAX_XML_NODES = 5_000;
const MAX_XML_DEPTH = 64;
const MAX_ITEM_TEXT = 10_000;

export type FeedItem = {
  id: string | null;
  title: string | null;
  link: string | null;
  publishedAt: string | null;
  summary: string;
};

export type ParsedFeed = {
  format: "rss" | "atom";
  title: string | null;
  items: FeedItem[];
  truncated: boolean;
};

type XmlNode = {
  name: string;
  localName: string;
  attributes: Record<string, string>;
  content: (string | XmlNode)[];
};

function xmlCharacter(code: number) {
  if (
    !Number.isInteger(code) ||
    code <= 0 ||
    code > 0x10ffff ||
    (code >= 0xd800 && code <= 0xdfff)
  )
    return null;
  return String.fromCodePoint(code);
}

function decodeXml(value: string) {
  let result = "";
  for (let offset = 0; offset < value.length;) {
    const start = value.indexOf("&", offset);
    if (start < 0) return result + value.slice(offset);
    result += value.slice(offset, start);
    const end = value.indexOf(";", start + 1);
    if (end < 0 || end - start > 34) return null;
    const entity = value.slice(start + 1, end);
    const named: Record<string, string> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"',
    };
    let decoded: string | null = named[entity] ?? null;
    if (entity.startsWith("#x"))
      decoded = xmlCharacter(Number.parseInt(entity.slice(2), 16));
    else if (entity.startsWith("#"))
      decoded = xmlCharacter(Number.parseInt(entity.slice(1), 10));
    if (decoded === null) return null;
    result += decoded;
    offset = end + 1;
  }
  return result;
}

function endOfTag(xml: string, start: number) {
  let quote = "";
  for (let index = start; index < xml.length; index++) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") return index;
  }
  return -1;
}

function parseStartTag(source: string) {
  const selfClosing = /\/\s*$/.test(source);
  const body = source.replace(/\/\s*$/, "");
  const nameMatch = body.match(/^\s*([A-Za-z_][\w:.-]*)/);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  const attributes: Record<string, string> = {};
  let offset = nameMatch[0].length;
  while (offset < body.length) {
    const whitespace = body.slice(offset).match(/^\s+/)?.[0] ?? "";
    offset += whitespace.length;
    if (offset === body.length) break;
    const match = body
      .slice(offset)
      .match(/^([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/);
    if (!match) return null;
    const key = match[1].toLowerCase();
    if (Object.hasOwn(attributes, key)) return null;
    const value = decodeXml(match[3]);
    if (value === null) return null;
    attributes[key] = value;
    offset += match[0].length;
  }
  return { name, attributes, selfClosing };
}

/** Small non-validating XML tree parser with no DTD or external-entity support. */
function parseXml(xml: string): XmlNode | null {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) return null;
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let nodes = 0;
  const appendText = (text: string, cdata = false) => {
    if (!text) return true;
    const decoded = cdata ? text : decodeXml(text);
    if (decoded === null) return false;
    if (!stack.length) return !decoded.trim();
    stack.at(-1)!.content.push(decoded);
    return true;
  };

  for (let offset = 0; offset < xml.length;) {
    const tag = xml.indexOf("<", offset);
    if (tag < 0)
      return appendText(xml.slice(offset)) && !stack.length ? root : null;
    if (!appendText(xml.slice(offset, tag))) return null;
    if (xml.startsWith("<!--", tag)) {
      const end = xml.indexOf("-->", tag + 4);
      if (end < 0) return null;
      offset = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", tag)) {
      const end = xml.indexOf("]]>", tag + 9);
      if (end < 0 || !appendText(xml.slice(tag + 9, end), true)) return null;
      offset = end + 3;
      continue;
    }
    if (xml.startsWith("<?", tag)) {
      const end = xml.indexOf("?>", tag + 2);
      if (end < 0) return null;
      offset = end + 2;
      continue;
    }
    if (xml.startsWith("</", tag)) {
      const end = xml.indexOf(">", tag + 2);
      if (end < 0) return null;
      const name = xml.slice(tag + 2, end).trim();
      if (!/^[A-Za-z_][\w:.-]*$/.test(name) || stack.at(-1)?.name !== name)
        return null;
      stack.pop();
      offset = end + 1;
      continue;
    }
    if (xml.startsWith("<!", tag)) return null;
    const end = endOfTag(xml, tag + 1);
    if (end < 0) return null;
    const parsed = parseStartTag(xml.slice(tag + 1, end));
    if (!parsed || ++nodes > MAX_XML_NODES) return null;
    const node: XmlNode = {
      name: parsed.name,
      localName: parsed.name.split(":").at(-1)!.toLowerCase(),
      attributes: parsed.attributes,
      content: [],
    };
    if (stack.length) stack.at(-1)!.content.push(node);
    else if (root) return null;
    else root = node;
    if (!parsed.selfClosing) {
      stack.push(node);
      if (stack.length > MAX_XML_DEPTH) return null;
    }
    offset = end + 1;
  }
  return stack.length ? null : root;
}

const children = (node: XmlNode, name: string) =>
  node.content.filter(
    (value): value is XmlNode =>
      typeof value !== "string" && value.localName === name,
  );
const child = (node: XmlNode, ...names: string[]) =>
  node.content.find(
    (value): value is XmlNode =>
      typeof value !== "string" && names.includes(value.localName),
  );

function nodeText(node: XmlNode | undefined): string {
  if (!node || ["script", "style", "noscript"].includes(node.localName))
    return "";
  return node.content
    .map((value) => (typeof value === "string" ? value : nodeText(value)))
    .join(" ");
}

function cleanText(node: XmlNode | undefined, limit = MAX_ITEM_TEXT) {
  const value = sourceHTMLToText(nodeText(node)).replace(/\s+/g, " ").trim();
  return value.slice(0, limit);
}

function attribute(node: XmlNode, name: string) {
  const exact = node.attributes[name];
  if (exact !== undefined) return exact;
  const match = Object.entries(node.attributes).find(
    ([key]) => key.split(":").at(-1) === name,
  );
  return match?.[1];
}

function safeLink(value: string, root?: string) {
  if (!value.trim()) return null;
  try {
    const resolved = root ? new URL(value.trim(), root).href : value.trim();
    const parsed = publicURL.safeParse(resolved);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function publicationDate(value: string) {
  if (!value || value.length > 128) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function nullable(value: string) {
  return value || null;
}

function rssItem(node: XmlNode, root?: string): FeedItem {
  return {
    id: nullable(cleanText(child(node, "guid"), 2_000)),
    title: nullable(cleanText(child(node, "title"), 2_000)),
    link: safeLink(cleanText(child(node, "link"), 2_000), root),
    publishedAt: publicationDate(
      cleanText(child(node, "pubdate", "date"), 128),
    ),
    summary: cleanText(child(node, "description", "encoded")),
  };
}

function atomLink(node: XmlNode, root?: string) {
  const links = children(node, "link");
  const selected =
    links.find(
      (link) =>
        !attribute(link, "rel") || attribute(link, "rel") === "alternate",
    ) ?? links[0];
  return selected
    ? safeLink(attribute(selected, "href") ?? cleanText(selected, 2_000), root)
    : null;
}

function atomItem(node: XmlNode, root?: string): FeedItem {
  return {
    id: nullable(cleanText(child(node, "id"), 2_000)),
    title: nullable(cleanText(child(node, "title"), 2_000)),
    link: atomLink(node, root),
    publishedAt: publicationDate(
      cleanText(child(node, "published", "updated"), 128),
    ),
    summary: cleanText(child(node, "summary", "content")),
  };
}

/** Parses a bounded RSS 2.0 or Atom feed. It never follows feed or item links. */
export function parseRssOrAtomFeed(
  xmlText: unknown,
  feedRootUrl?: string,
): ParsedFeed | null {
  if (
    typeof xmlText !== "string" ||
    !xmlText.trim() ||
    Buffer.byteLength(xmlText) > MAX_RSS_FEED_BYTES
  )
    return null;
  const root = parseXml(xmlText.replace(/^\uFEFF/, ""));
  if (!root) return null;
  const normalizedRoot = feedRootUrl
    ? publicURL.safeParse(feedRootUrl).success
      ? feedRootUrl
      : undefined
    : undefined;

  if (root.localName === "rss") {
    const channel = child(root, "channel");
    if (!channel) return null;
    const allItems = children(channel, "item");
    return {
      format: "rss",
      title: nullable(cleanText(child(channel, "title"), 2_000)),
      items: allItems
        .slice(0, MAX_RSS_FEED_ITEMS)
        .map((item) => rssItem(item, normalizedRoot)),
      truncated: allItems.length > MAX_RSS_FEED_ITEMS,
    };
  }
  if (root.localName === "feed") {
    const allItems = children(root, "entry");
    return {
      format: "atom",
      title: nullable(cleanText(child(root, "title"), 2_000)),
      items: allItems
        .slice(0, MAX_RSS_FEED_ITEMS)
        .map((item) => atomItem(item, normalizedRoot)),
      truncated: allItems.length > MAX_RSS_FEED_ITEMS,
    };
  }
  return null;
}
