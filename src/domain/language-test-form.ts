import type { LanguageTest, LanguageRequirement } from "./language-tests";
function numeric(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value ? Number(value) : NaN;
}
function anyField(form: FormData) {
  return [...form.keys()].some(
    (key) =>
      key.startsWith("languageTest") && String(form.get(key) ?? "").trim(),
  );
}
export function languageTestFromForm(form: FormData): LanguageTest | null {
  if (!anyField(form)) return null;
  return {
    name: String(form.get("languageTestName") ?? "").trim(),
    scale: numeric(form, "languageTestScale"),
    score: numeric(form, "languageTestScore"),
    testedOn: String(form.get("languageTestDate") ?? "") || null,
    validUntil: String(form.get("languageTestValidUntil") ?? "") || null,
  };
}
export function languageRequirementFromForm(
  form: FormData,
): LanguageRequirement | null {
  if (!anyField(form)) return null;
  return {
    name: String(form.get("languageTestName") ?? "").trim(),
    scale: numeric(form, "languageTestScale"),
    minimumScore: numeric(form, "languageTestMinimum"),
  };
}
