"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/src/i18n/locale";
import type { OnboardingProgress, Preferences } from "@/src/domain/profile";

const english: Record<string, string> = {
  "Set up your opportunity preferences": "Set up your opportunity preferences",
  "A few steps help us find relevant opportunities. You can change these preferences any time.":
    "A few steps help us find relevant opportunities. You can change these preferences any time.",
  "Step {step} of 3": "Step {step} of 3",
  "About you": "About you",
  "Study interests": "Study interests",
  "Opportunity preferences": "Opportunity preferences",
  "Interface language": "Interface language",
  "Alert language": "Alert language",
  English: "English",
  Chinese: "Chinese",
  "Simplified Chinese": "Simplified Chinese",
  "Nationality (two-letter country code)":
    "Nationality (two-letter country code)",
  "Age (optional)": "Age (optional)",
  "Highest qualification": "Highest qualification",
  "Not supplied": "Not supplied",
  Secondary: "Secondary",
  Bachelor: "Bachelor",
  Master: "Master",
  Doctorate: "Doctorate",
  Other: "Other",
  "Target study levels": "Target study levels",
  "Topics, separated by commas": "Topics, separated by commas",
  "smart manufacturing, digital twins": "smart manufacturing, digital twins",
  "Opportunity types": "Opportunity types",
  Scholarships: "Scholarships",
  Courses: "Courses",
  Events: "Events",
  "Funding preferences": "Funding preferences",
  "Fully funded": "Fully funded",
  "Tuition only": "Tuition only",
  "Free participation": "Free participation",
  "Participation modes": "Participation modes",
  Online: "Online",
  "In person": "In person",
  "Acceptable teaching languages": "Acceptable teaching languages",
  "Preferred in-person country codes": "Preferred in-person country codes",
  "Enter two-letter codes separated by commas (for example CN).":
    "Enter two-letter codes separated by commas (for example CN).",
  "Save and continue": "Save and continue",
  Back: "Back",
  "Finish and view matches": "Finish and view matches",
  "Please check your entries and try again.":
    "Please check your entries and try again.",
  "Saving…": "Saving…",
};

const chinese: Record<string, string> = {
  "Set up your opportunity preferences": "设置您的机会偏好",
  "A few steps help us find relevant opportunities. You can change these preferences any time.":
    "完成以下步骤可帮助我们寻找相关机会。您随时可以更改这些偏好。",
  "Step {step} of 3": "第 {step} 步，共 3 步",
  "About you": "关于您",
  "Study interests": "学习兴趣",
  "Opportunity preferences": "机会偏好",
  "Interface language": "界面语言",
  "Alert language": "提醒语言",
  English: "英语",
  Chinese: "中文",
  "Simplified Chinese": "简体中文",
  "Nationality (two-letter country code)": "国籍（两位国家代码）",
  "Age (optional)": "年龄（选填）",
  "Highest qualification": "最高学历",
  "Not supplied": "未提供",
  Secondary: "中学",
  Bachelor: "本科",
  Master: "硕士",
  Doctorate: "博士",
  Other: "其他",
  "Target study levels": "目标学历层次",
  "Topics, separated by commas": "主题（用英文逗号分隔）",
  "smart manufacturing, digital twins": "智能制造, 数字孪生",
  "Opportunity types": "机会类型",
  Scholarships: "奖学金",
  Courses: "课程",
  Events: "活动",
  "Funding preferences": "资助偏好",
  "Fully funded": "全额资助",
  "Tuition only": "仅学费",
  "Free participation": "免费参与",
  "Participation modes": "参与方式",
  Online: "线上",
  "In person": "线下",
  "Acceptable teaching languages": "可接受的授课语言",
  "Preferred in-person country codes": "线下参与的首选国家代码",
  "Enter two-letter codes separated by commas (for example CN).":
    "输入以逗号分隔的两位国家代码（例如 CN）。",
  "Save and continue": "保存并继续",
  Back: "返回",
  "Finish and view matches": "完成并查看匹配",
  "Please check your entries and try again.": "请检查填写内容并重试。",
  "Saving…": "正在保存…",
};

const defaults: Preferences = {
  interfaceLanguage: "en",
  alertLanguage: "en",
  teachingLanguages: ["en"],
  nationality: null,
  age: null,
  qualification: null,
  targetLevels: [],
  topics: [],
  categories: ["scholarship", "course", "event"],
  funding: ["fully_funded", "tuition_only", "free_participation"],
  modes: ["online", "in_person"],
  countries: [],
};

export default function OnboardingWizard({
  locale,
  initialProgress,
}: {
  locale: Locale;
  initialProgress: OnboardingProgress;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialProgress.step);
  const [values, setValues] = useState<Partial<Preferences>>(
    initialProgress.values,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = (value: string) =>
    locale === "zh-Hans"
      ? (chinese[value] ?? value)
      : (english[value] ?? value);
  const p = { ...defaults, ...values };
  const words = (data: FormData, name: string) =>
    data.getAll(name).map(String).filter(Boolean);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const stepValues: Partial<Preferences> =
      step === 1
        ? {
            interfaceLanguage: String(form.get("interfaceLanguage")) as
              "en" | "zh-Hans",
            alertLanguage: String(form.get("alertLanguage")) as
              "en" | "zh-Hans",
            nationality:
              String(form.get("nationality") ?? "")
                .trim()
                .toUpperCase() || null,
            age: form.get("age") ? Number(form.get("age")) : null,
            qualification: (form.get("qualification") || null) as
              Preferences["qualification"] | null,
          }
        : step === 2
          ? {
              targetLevels: words(
                form,
                "targetLevels",
              ) as Preferences["targetLevels"],
              topics: String(form.get("topics") ?? "")
                .split(",")
                .map((topic) => topic.trim())
                .filter(Boolean),
              categories: words(
                form,
                "categories",
              ) as Preferences["categories"],
            }
          : {
              funding: words(form, "funding") as Preferences["funding"],
              modes: words(form, "modes") as Preferences["modes"],
              teachingLanguages: words(
                form,
                "teachingLanguages",
              ) as Preferences["teachingLanguages"],
              countries: String(form.get("countries") ?? "")
                .split(",")
                .map((country) => country.trim().toUpperCase())
                .filter(Boolean),
            };
    setBusy(true);
    setError("");
    try {
      const saved = await fetch("/api/me/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, values: stepValues }),
      });
      if (!saved.ok) throw new Error("invalid");
      const merged = { ...values, ...stepValues };
      setValues(merged);
      if (submitter?.name === "direction" && submitter.value === "back") {
        setStep(step - 1);
        return;
      }
      if (step < 3) {
        setStep(step + 1);
        return;
      }
      const completed = await fetch("/api/me/onboarding", {
        method: "POST",
      });
      if (!completed.ok) throw new Error("invalid");
      router.push("/matches");
      router.refresh();
    } catch {
      setError(t("Please check your entries and try again."));
    } finally {
      setBusy(false);
    }
  }

  function checkboxes(
    name: keyof Preferences,
    label: string,
    options: readonly (readonly [string, string])[],
    selected: readonly string[],
  ) {
    return (
      <fieldset>
        <legend>{t(label)}</legend>
        {options.map(([value, optionLabel]) => (
          <label className="inline" key={value}>
            <input
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={selected.includes(value)}
            />{" "}
            {t(optionLabel)}
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <section className="form" lang={locale}>
      <p className="eyebrow">
        {t("Step {step} of 3").replace("{step}", String(step))}
      </p>
      <h1>{t("Set up your opportunity preferences")}</h1>
      <p>
        {t(
          "A few steps help us find relevant opportunities. You can change these preferences any time.",
        )}
      </p>
      <nav aria-label={locale === "zh-Hans" ? "引导步骤" : "Onboarding steps"}>
        <ol>
          {["About you", "Study interests", "Opportunity preferences"].map(
            (title, index) => (
              <li
                key={title}
                aria-current={step === index + 1 ? "step" : undefined}
              >
                {index + 1}. {t(title)}
              </li>
            ),
          )}
        </ol>
      </nav>
      <form onSubmit={(event) => void submit(event)}>
        {step === 1 ? (
          <>
            {(["interfaceLanguage", "alertLanguage"] as const).map((name) => (
              <label key={name}>
                {t(
                  name === "interfaceLanguage"
                    ? "Interface language"
                    : "Alert language",
                )}
                <select name={name} defaultValue={p[name]}>
                  <option value="en">{t("English")}</option>
                  <option value="zh-Hans">{t("Simplified Chinese")}</option>
                </select>
              </label>
            ))}
            <label>
              {t("Nationality (two-letter country code)")}
              <input
                name="nationality"
                maxLength={2}
                defaultValue={p.nationality ?? ""}
                placeholder="NG"
              />
            </label>
            <label>
              {t("Age (optional)")}
              <input
                name="age"
                type="number"
                min={0}
                max={120}
                defaultValue={p.age ?? ""}
              />
            </label>
            <label>
              {t("Highest qualification")}
              <select name="qualification" defaultValue={p.qualification ?? ""}>
                <option value="">{t("Not supplied")}</option>
                {(
                  [
                    "secondary",
                    "bachelor",
                    "master",
                    "doctorate",
                    "other",
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {t(
                      value === "secondary"
                        ? "Secondary"
                        : value[0].toUpperCase() + value.slice(1),
                    )}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {step === 2 ? (
          <>
            {checkboxes(
              "targetLevels",
              "Target study levels",
              [
                ["bachelor", "Bachelor"],
                ["master", "Master"],
                ["doctorate", "Doctorate"],
              ],
              p.targetLevels,
            )}
            <label>
              {t("Topics, separated by commas")}
              <input
                name="topics"
                maxLength={700}
                defaultValue={p.topics.join(", ")}
                placeholder={t("smart manufacturing, digital twins")}
              />
            </label>
            {checkboxes(
              "categories",
              "Opportunity types",
              [
                ["scholarship", "Scholarships"],
                ["course", "Courses"],
                ["event", "Events"],
              ],
              p.categories,
            )}
          </>
        ) : null}
        {step === 3 ? (
          <>
            {checkboxes(
              "funding",
              "Funding preferences",
              [
                ["fully_funded", "Fully funded"],
                ["tuition_only", "Tuition only"],
                ["free_participation", "Free participation"],
              ],
              p.funding,
            )}
            {checkboxes(
              "modes",
              "Participation modes",
              [
                ["online", "Online"],
                ["in_person", "In person"],
              ],
              p.modes,
            )}
            {checkboxes(
              "teachingLanguages",
              "Acceptable teaching languages",
              [
                ["en", "English"],
                ["zh", "Chinese"],
              ],
              p.teachingLanguages,
            )}
            <label>
              {t("Preferred in-person country codes")}
              <input
                name="countries"
                maxLength={100}
                defaultValue={p.countries.join(", ")}
                placeholder="CN, NG"
              />
            </label>
            <p>
              {t(
                "Enter two-letter codes separated by commas (for example CN).",
              )}
            </p>
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className="actions">
          {step > 1 ? (
            <button
              type="submit"
              name="direction"
              value="back"
              className="secondary"
              disabled={busy}
            >
              {t("Back")}
            </button>
          ) : null}
          <button disabled={busy}>
            {busy
              ? t("Saving…")
              : t(step === 3 ? "Finish and view matches" : "Save and continue")}
          </button>
        </div>
      </form>
    </section>
  );
}
