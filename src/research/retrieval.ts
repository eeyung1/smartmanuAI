import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import { publicURL } from "../catalogue/schema";
export class RetrievalError extends Error {
  constructor(public code: string) {
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
  const charset = /charset\s*=\s*["\']?([^;"\'\s]+)/i
    .exec(response.headers["content-type"] ?? "")?.[1]
    ?.toLowerCase();
  if (charset && !["utf-8", "utf8", "us-ascii"].includes(charset)) {
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
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
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
export async function retrieveSource(input: string) {
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
  return new Promise<string>((resolve, reject) => {
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
        },
        lookup: (_host, _options, callback) =>
          callback(null, pinned.address, pinned.family),
      },
      (response) => {
        void readPage(response).then(resolve, reject);
      },
    );
    req.on("error", () => reject(new RetrievalError("source_network_error")));
    req.end();
  });
}
