import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import { publicURL } from "../catalogue/schema";
export type RetryAfter = { until: string | null; requiresReview: boolean };
export function parseRetryAfter(
  value: unknown,
  now = new Date(),
): RetryAfter | null {
  if (typeof value !== "string" || value.length > 128) return null;
  let delay: number;
  if (/^\d+$/.test(value)) delay = Number(value) * 1000;
  else {
    const date = safeValidators({ lastModified: value }).lastModified;
    if (!date) return null;
    delay = Math.max(0, new Date(date).getTime() - now.getTime());
  }
  if (delay > 7 * 86400000) return { until: null, requiresReview: true };
  return {
    until: new Date(now.getTime() + delay).toISOString(),
    requiresReview: false,
  };
}
export class RetrievalError extends Error {
  constructor(
    public code: string,
    public retryAfter: RetryAfter | null = null,
  ) {
    super(code);
  }
}
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const specialV6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  specialV6.addSubnet(address, prefix, "ipv6");
export function isPublicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !specialV6.check(address, "ipv6");
}
export function validateAddresses(
  records: { address: string; family: number }[],
) {
  if (
    !records.length ||
    records.some(
      (r) => !isPublicAddress(r.address) || isIP(r.address) !== r.family,
    )
  )
    throw new RetrievalError("unsafe_dns");
  return records[0];
}
/** Conservative direct meta-charset subset: first 1,024 bytes, before active/body content. */
export function earlyMetaCharset(bytes: Buffer): string | null {
  const prefix = bytes.subarray(0, 1024).toString("latin1");
  // Stop at an unclosed comment as well as removing complete comments.
  const withoutComments = prefix.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
  const declarations: string[] = [];
  for (const tag of withoutComments.matchAll(
    /<([a-z][a-z0-9:-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
  )) {
    const name = tag[1].toLowerCase();
    if (
      [
        "body",
        "script",
        "style",
        "noscript",
        "template",
        "title",
        "textarea",
      ].includes(name)
    )
      break;
    if (name !== "meta") continue;
    const attributes = tag[0].slice(5, -1);
    for (const attribute of attributes.matchAll(
      /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
    )) {
      if (attribute[1].toLowerCase() === "charset")
        declarations.push(
          (attribute[2] ?? attribute[3] ?? attribute[4] ?? "")
            .trim()
            .toLowerCase(),
        );
    }
  }
  if (declarations.length > 1 || declarations.some((value) => !value))
    throw new RetrievalError("unsupported_encoding");
  return declarations[0] ?? null;
}

export async function readPage(response: IncomingMessage) {
  if (response.statusCode !== 200) {
    response.destroy();
    throw new RetrievalError(
      response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400
        ? "redirect_disallowed"
        : "source_http_error",
    );
  }
  const type = response.headers["content-type"]
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (
    !["text/plain", "text/html"].includes(type ?? "") ||
    (response.headers["content-encoding"] &&
      response.headers["content-encoding"] !== "identity")
  ) {
    response.destroy();
    throw new RetrievalError("unsupported_content");
  }
  const declarations = [
    ...(response.headers["content-type"] ?? "").matchAll(
      /(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/gi,
    ),
  ];
  const charsetParameters = (response.headers["content-type"] ?? "")
    .split(";")
    .slice(1)
    .filter((parameter) => /^\s*charset\b/i.test(parameter));
  let charset = declarations[0]?.[1].toLowerCase() ?? "utf-8";
  const encodings: Record<string, string> = {
    "utf-8": "utf-8",
    utf8: "utf-8",
    "us-ascii": "utf-8",
    gb18030: "gb18030",
    gbk: "gb18030",
    gb2312: "gb18030",
    big5: "big5",
    "big5-hkscs": "big5",
  };
  let encoding = encodings[charset];
  if (
    declarations.length > 1 ||
    charsetParameters.length !== declarations.length ||
    !encoding
  ) {
    response.destroy();
    throw new RetrievalError("unsupported_encoding");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    const part = Buffer.from(chunk);
    size += part.length;
    if (size > 256000) {
      response.destroy();
      throw new RetrievalError("source_too_large");
    }
    chunks.push(part);
  }
  const bytes = Buffer.concat(chunks);
  if (
    !declarations.length &&
    type === "text/html" &&
    !bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
  ) {
    charset = earlyMetaCharset(bytes) ?? "utf-8";
    encoding = encodings[charset];
    if (!encoding) throw new RetrievalError("unsupported_encoding");
  }
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new RetrievalError("unsupported_encoding");
  }
  if (type === "text/html")
    text = text
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(
        /&(nbsp|amp|lt|gt|quot|#39);/g,
        (s) =>
          ({
            "&nbsp;": " ",
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&#39;": "'",
          })[s] ?? s,
      );
  text = text.replace(/\s+/g, " ").trim();
  if (text.length < 20) throw new RetrievalError("empty_source");
  while (Buffer.byteLength(text) > 10000)
    text = text.slice(0, Math.max(0, text.length - 100));
  return text;
}
export type SourceValidators = {
  etag: string | null;
  lastModified: string | null;
};
export type SourceResponse =
  | { status: "content"; content: string; validators: SourceValidators }
  | { status: "not_modified"; validators: SourceValidators };
export function safeValidators(
  input: { etag?: unknown; lastModified?: unknown } = {},
): SourceValidators {
  const etag =
    typeof input.etag === "string" &&
    input.etag.length <= 512 &&
    /^(?:W\/)?"[\x21\x23-\x7e]*"$/.test(input.etag)
      ? input.etag
      : null;
  const date = input.lastModified;
  const lastModified =
    typeof date === "string" &&
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      date,
    ) &&
    new Date(date).toUTCString() === date
      ? date
      : null;
  return { etag, lastModified };
}
export function conditionalHeaders(input: SourceValidators) {
  const v = safeValidators(input);
  return v.etag
    ? { "If-None-Match": v.etag }
    : v.lastModified
      ? { "If-Modified-Since": v.lastModified }
      : {};
}
function responseValidators(
  response: IncomingMessage,
  previous: SourceValidators,
): SourceValidators {
  const headers = response.headers,
    control = headers["cache-control"],
    vary = headers.vary;
  // Only reuse validators for the fixed anonymous representation requested by this adapter.
  if (typeof control === "string" && /\bno-store\b/i.test(control))
    return safeValidators();
  if (
    vary &&
    vary
      .split(",")
      .some(
        (name) =>
          !["accept", "accept-encoding", "user-agent"].includes(
            name.trim().toLowerCase(),
          ),
      )
  )
    return safeValidators();
  return safeValidators({
    etag: headers.etag === undefined ? previous.etag : headers.etag,
    lastModified:
      headers["last-modified"] === undefined
        ? previous.lastModified
        : headers["last-modified"],
  });
}
export async function readSourceResponse(
  response: IncomingMessage,
  input: SourceValidators = safeValidators(),
): Promise<SourceResponse> {
  const requested = safeValidators(input);
  if (response.statusCode === 429 || response.statusCode === 503) {
    response.destroy();
    throw new RetrievalError(
      response.statusCode === 429
        ? "source_rate_limited"
        : "source_unavailable",
      parseRetryAfter(response.headers["retry-after"]),
    );
  }
  if (response.statusCode === 304) {
    response.destroy();
    if (!requested.etag && !requested.lastModified)
      throw new RetrievalError("unexpected_not_modified");
    const returned = safeValidators({ etag: response.headers.etag }).etag;
    if (
      requested.etag &&
      response.headers.etag !== undefined &&
      (!returned ||
        returned.replace(/^W\//, "") !== requested.etag.replace(/^W\//, ""))
    )
      throw new RetrievalError("validator_mismatch");
    return {
      status: "not_modified",
      validators: responseValidators(response, requested),
    };
  }
  const content = await readPage(response);
  return {
    status: "content",
    content,
    validators: responseValidators(response, safeValidators()),
  };
}
export async function retrieveSourceResponse(
  input: string,
  validators: SourceValidators = safeValidators(),
): Promise<SourceResponse> {
  const url = new URL(publicURL.parse(input));
  if (url.hostname.endsWith(".test"))
    throw new RetrievalError("synthetic_source");
  const signal = AbortSignal.timeout(15000);
  const records = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) =>
      signal.addEventListener(
        "abort",
        () => reject(new RetrievalError("source_timeout")),
        { once: true },
      ),
    ),
  ]);
  const pinned = validateAddresses(records);
  return new Promise<SourceResponse>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        signal,
        agent: false,
        family: pinned.family,
        headers: {
          Accept: "text/html, text/plain",
          "Accept-Encoding": "identity",
          "User-Agent": "smartmanuAI/0.1",
          ...conditionalHeaders(validators),
        },
        lookup: (_host, _options, callback) =>
          callback(null, pinned.address, pinned.family),
      },
      (response) => {
        void readSourceResponse(response, validators).then(resolve, reject);
      },
    );
    req.on("error", () => reject(new RetrievalError("source_network_error")));
    req.end();
  });
}

export async function retrieveSource(input: string) {
  const result = await retrieveSourceResponse(input);
  if (result.status !== "content")
    throw new RetrievalError("unexpected_not_modified");
  return result.content;
}
