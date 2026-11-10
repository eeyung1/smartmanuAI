import { publicURL } from "../catalogue/schema";
import { sourceHTMLToText } from "./source-text";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/** Core JSON Feed subset, never a crawler. At most ten entries enter one review excerpt. */
export function jsonFeedText(value: unknown): string | null {
  if (
    !record(value) ||
    ![
      "https://jsonfeed.org/version/1",
      "https://jsonfeed.org/version/1.1",
    ].includes(String(value.version)) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    !Array.isArray(value.items) ||
    !value.items.length ||
    value.items.length > 1000
  )
    return null;
  const ids = new Set<string>();
  for (const item of value.items) {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      ids.has(item.id) ||
      (item.title !== undefined && typeof item.title !== "string") ||
      (item.content_text !== undefined &&
        typeof item.content_text !== "string") ||
      (item.content_html !== undefined &&
        typeof item.content_html !== "string") ||
      (typeof item.content_text !== "string" &&
        typeof item.content_html !== "string")
    )
      return null;
    ids.add(item.id);
  }
  const items = value.items.slice(0, 10) as Record<string, unknown>[];
  return [
    "Feed title: " + value.title,
    ...items.map((item, index) => {
      const content =
        typeof item.content_text === "string"
          ? item.content_text
          : sourceHTMLToText(String(item.content_html));
      const link = publicURL.safeParse(item.url);
      return [
        `Item ${index + 1}: ${typeof item.title === "string" ? item.title : ""}`,
        content,
        ...(link.success ? ["Item URL (not fetched): " + link.data] : []),
      ].join("\n");
    }),
  ].join("\n\n");
}
