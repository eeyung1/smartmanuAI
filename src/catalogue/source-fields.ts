export const sourceTypes = [
  "unknown",
  "university",
  "government",
  "scholarship_body",
  "training_provider",
  "event_organizer",
  "other",
] as const;
export const sourceLanguages = [
  "unknown",
  "en",
  "zh",
  "multilingual",
  "other",
] as const;
export const sourceTypeLabels: Record<(typeof sourceTypes)[number], string> = {
  unknown: "Not stated",
  university: "University",
  government: "Government body",
  scholarship_body: "Scholarship body",
  training_provider: "Training provider",
  event_organizer: "Event organizer",
  other: "Other",
};
export const sourceLanguageLabels: Record<
  (typeof sourceLanguages)[number],
  string
> = {
  unknown: "Not stated",
  en: "English",
  zh: "Chinese",
  multilingual: "Multiple languages",
  other: "Other",
};
