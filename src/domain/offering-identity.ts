/** Formatting equivalence only; no translation, date inference or semantic matching. */
export function offeringIdentityKey(value: string | null | undefined) {
  return (
    value?.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase() || null
  );
}
