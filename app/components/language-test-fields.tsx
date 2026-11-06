"use client";
import { useScreenText } from "@/src/i18n/context";
import type {
  LanguageRequirement,
  LanguageTest,
} from "@/src/domain/language-tests";
export default function LanguageTestFields({
  result,
  requirement,
  source = false,
}: {
  result?: LanguageTest | null;
  requirement?: LanguageRequirement | null;
  source?: boolean;
}) {
  const { t } = useScreenText();
  const value = source ? requirement : result;
  return (
    <fieldset>
      <legend>
        {t(
          source
            ? "Mandatory language-test requirement (optional)"
            : "Language-test result (optional)",
        )}
      </legend>
      <p>
        {t(
          "Use the exact test name and version. Different score scales are not converted. Leave all fields blank if unknown.",
        )}
      </p>
      {source ? (
        <p>
          {t(
            "Record one mandatory overall-score requirement supported by source evidence. Alternatives, waivers and section scores need manual review.",
          )}
        </p>
      ) : (
        <p>
          {t(
            "Self-reported results only. Enter validity from your result and the source; do not guess an expiry date.",
          )}
        </p>
      )}
      <label>
        {t("Test name and version")}
        <input
          name="languageTestName"
          maxLength={80}
          defaultValue={value?.name ?? ""}
        />
      </label>
      <label>
        {t("Maximum score on this scale")}
        <input
          name="languageTestScale"
          type="number"
          min={0.001}
          max={1000}
          step="any"
          defaultValue={value?.scale ?? ""}
        />
      </label>
      {source ? (
        <label>
          {t("Required minimum overall score")}
          <input
            name="languageTestMinimum"
            type="number"
            min={0}
            step="any"
            defaultValue={requirement?.minimumScore ?? ""}
          />
        </label>
      ) : (
        <>
          <label>
            {t("Your overall score")}
            <input
              name="languageTestScore"
              type="number"
              min={0}
              step="any"
              defaultValue={result?.score ?? ""}
            />
          </label>
          <label>
            {t("Test date")}
            <input
              name="languageTestDate"
              type="date"
              defaultValue={result?.testedOn ?? ""}
            />
          </label>
          <label>
            {t("Valid through (if known)")}
            <input
              name="languageTestValidUntil"
              type="date"
              defaultValue={result?.validUntil ?? ""}
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
