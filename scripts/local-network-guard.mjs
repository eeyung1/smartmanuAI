// The fixture agent must never use an external HTTP provider, including eve's
// optional model catalogue request during compilation. Fail before fetch sends.
const originalFetch = globalThis.fetch;
globalThis.fetch = function localFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
  ) {
    return Promise.reject(
      new Error("External fetch is disabled for the local fixture agent."),
    );
  }
  return originalFetch(input, { ...init, redirect: "error" });
};
