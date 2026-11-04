export const DEFAULT_AUTH_DESTINATION = "/matches";

const MAX_DESTINATION_LENGTH = 2_048;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function safeAuthDestination(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_DESTINATION_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTER.test(value)
  )
    return DEFAULT_AUTH_DESTINATION;

  try {
    const base = new URL("http://smartmanu.local");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return DEFAULT_AUTH_DESTINATION;
    return destination.pathname + destination.search + destination.hash;
  } catch {
    return DEFAULT_AUTH_DESTINATION;
  }
}
