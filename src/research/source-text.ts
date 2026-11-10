export function sourceHTMLToText(text: string) {
  return text
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
}
