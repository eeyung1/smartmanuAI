export type AgeInput = {
  age?: number | null;
  birthYear?: number | null;
  ageAsOf?: string | null;
};

/** Self-reported age is exact only on its stated UTC confirmation date.
 * Birth year supplies a range because the birthday is intentionally not collected.
 */
export function currentAgeRange(input: AgeInput, now = new Date()) {
  if (!Number.isFinite(now.getTime()))
    throw new Error("Invalid matching date.");
  if (input.birthYear != null) {
    if (input.age != null || input.birthYear > now.getUTCFullYear())
      return null;
    const upper = now.getUTCFullYear() - input.birthYear;
    return { min: Math.max(0, upper - 1), max: upper };
  }
  if (input.age == null || input.ageAsOf !== now.toISOString().slice(0, 10))
    return null;
  return { min: input.age, max: input.age };
}
