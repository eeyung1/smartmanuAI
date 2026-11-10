export const MAX_ROBOTS_CRAWL_DELAY_SECONDS = 3600;

export type RobotsPathRule = {
  path: string;
  allow: boolean;
};

export type RobotsGroup = {
  userAgents: string[];
  allow: string[];
  disallow: string[];
  rules: RobotsPathRule[];
  crawlDelaySeconds: number | null;
  crawlDelayCapped: boolean;
};

export type RobotsRules = {
  groups: RobotsGroup[];
  /** Conservative host-wide maximum. Use getCrawlDelaySeconds for one agent. */
  crawlDelaySeconds: number | null;
};

const MAX_DIRECTIVE_LENGTH = 2048;
const MAX_USER_AGENT_LENGTH = 256;

function emptyGroup(): RobotsGroup {
  return {
    userAgents: [],
    allow: [],
    disallow: [],
    rules: [],
    crawlDelaySeconds: null,
    crawlDelayCapped: false,
  };
}

function parseDelay(value: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const seconds = Math.ceil(parsed);
  return {
    seconds: Math.min(seconds, MAX_ROBOTS_CRAWL_DELAY_SECONDS),
    capped: seconds > MAX_ROBOTS_CRAWL_DELAY_SECONDS,
  };
}

/** Parses supported robots.txt records without treating unknown or malformed lines as rules. */
export function parseRobotsTxt(content: unknown): RobotsRules {
  if (typeof content !== "string" || !content) {
    return { groups: [], crawlDelaySeconds: null };
  }

  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let hasRecords = false;
  const finish = () => {
    if (current?.userAgents.length) groups.push(current);
    current = null;
    hasRecords = false;
  };

  for (const rawLine of content.replace(/^\uFEFF/, "").split(/\r\n?|\n/)) {
    const withoutComment = rawLine.split("#", 1)[0].trim();
    if (!withoutComment) {
      if (hasRecords) finish();
      continue;
    }
    const separator = withoutComment.indexOf(":");
    if (separator < 1) continue;
    const field = withoutComment.slice(0, separator).trim().toLowerCase();
    const value = withoutComment.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (hasRecords) finish();
      current ??= emptyGroup();
      const product = value.toLowerCase().split(/\s+/, 1)[0];
      if (
        product &&
        product.length <= MAX_USER_AGENT_LENGTH &&
        (product === "*" || /^[a-z0-9_.-]+$/.test(product)) &&
        !current.userAgents.includes(product)
      )
        current.userAgents.push(product);
      continue;
    }

    if (!current?.userAgents.length) continue;
    if (field === "allow" || field === "disallow") {
      // Empty Disallow means no restriction; empty Allow has no matching value.
      if (!value || value.length > MAX_DIRECTIVE_LENGTH) continue;
      const allow = field === "allow";
      current.rules.push({ path: value, allow });
      current[allow ? "allow" : "disallow"].push(value);
      hasRecords = true;
      continue;
    }
    if (field === "crawl-delay") {
      const delay = parseDelay(value);
      if (!delay) continue;
      current.crawlDelaySeconds = Math.max(
        current.crawlDelaySeconds ?? 0,
        delay.seconds,
      );
      current.crawlDelayCapped ||= delay.capped;
      hasRecords = true;
    }
  }
  if (current?.userAgents.length) finish();

  const delays = groups
    .map((group) => group.crawlDelaySeconds)
    .filter((delay): delay is number => delay !== null);
  return {
    groups,
    crawlDelaySeconds: delays.length ? Math.max(...delays) : null,
  };
}

function selectedGroups(rules: RobotsRules, userAgent: string) {
  const product = userAgent.trim().toLowerCase();
  let specificity = -1;
  const selected: RobotsGroup[] = [];
  for (const group of rules.groups) {
    const match = Math.max(
      ...group.userAgents.map((agent) =>
        agent === "*" ? 0 : product.includes(agent) ? agent.length : -1,
      ),
    );
    if (match < 0 || match < specificity) continue;
    if (match > specificity) {
      specificity = match;
      selected.length = 0;
    }
    selected.push(group);
  }
  return selected;
}

function normalizeOctets(value: string) {
  const utf8 = [...value]
    .map((character) =>
      character.codePointAt(0)! > 0x7f
        ? [...Buffer.from(character)]
            .map(
              (byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`,
            )
            .join("")
        : character,
    )
    .join("");
  return utf8.replace(/%[0-9a-f]{2}/gi, (encoded) => {
    const code = Number.parseInt(encoded.slice(1), 16);
    const character = String.fromCharCode(code);
    return /^[A-Za-z0-9._~-]$/.test(character)
      ? character
      : `%${encoded.slice(1).toUpperCase()}`;
  });
}

function pathRuleMatch(pattern: string, target: string) {
  const normalized = normalizeOctets(pattern);
  const anchored = normalized.endsWith("$");
  const body = anchored ? normalized.slice(0, -1) : normalized;
  const expression = body
    .split("*")
    .map((part) => part.replace(/[\\^$+?.()|[\]{}]/g, "\\$&"))
    .join(".*");
  try {
    return {
      matches: new RegExp(`^${expression}${anchored ? "$" : ""}`).test(target),
      specificity: body.replaceAll("*", "").length,
    };
  } catch {
    return { matches: false, specificity: 0 };
  }
}

/** Applies the most specific matching path rule; Allow wins an equal-length tie. */
export function isUrlAllowed(
  robotsRules: RobotsRules,
  url: string | URL,
  userAgent: string,
) {
  let parsed: URL;
  try {
    parsed = url instanceof URL ? url : new URL(url);
  } catch {
    return false;
  }
  const target = normalizeOctets(parsed.pathname + parsed.search);
  let winner: { allow: boolean; specificity: number } | null = null;
  for (const group of selectedGroups(robotsRules, userAgent))
    for (const rule of group.rules) {
      const match = pathRuleMatch(rule.path, target);
      if (
        match.matches &&
        (!winner ||
          match.specificity > winner.specificity ||
          (match.specificity === winner.specificity && rule.allow))
      )
        winner = { allow: rule.allow, specificity: match.specificity };
    }
  return winner?.allow ?? true;
}

/** Returns the conservative delay for all equally specific groups matching an agent. */
export function getCrawlDelaySeconds(
  robotsRules: RobotsRules,
  userAgent: string,
) {
  const delays = selectedGroups(robotsRules, userAgent)
    .map((group) => group.crawlDelaySeconds)
    .filter((delay): delay is number => delay !== null);
  return delays.length ? Math.max(...delays) : null;
}
