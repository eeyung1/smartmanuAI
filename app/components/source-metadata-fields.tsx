"use client";
import { useScreenText } from "@/src/i18n/context";
import {
  sourceTypes,
  sourceLanguages,
  sourceTypeLabels,
  sourceLanguageLabels,
} from "@/src/catalogue/source-fields";
export default function SourceMetadataFields({
  sourceType = "unknown",
  sourceLanguage = "unknown",
}: {
  sourceType?: string;
  sourceLanguage?: string;
}) {
  const { t } = useScreenText();
  return (
    <>
      <label>
        {t("Source type")}
        <select name="sourceType" defaultValue={sourceType}>
          {sourceTypes.map((value) => (
            <option key={value} value={value}>
              {t(sourceTypeLabels[value])}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Source language")}
        <select name="sourceLanguage" defaultValue={sourceLanguage}>
          {sourceLanguages.map((value) => (
            <option key={value} value={value}>
              {t(sourceLanguageLabels[value])}
            </option>
          ))}
        </select>
      </label>
      <p>
        {t(
          "Operator labels only. Source type does not prove official status, and source language is separate from teaching and notification languages.",
        )}
      </p>
    </>
  );
}
