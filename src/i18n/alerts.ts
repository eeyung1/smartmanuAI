import type { Locale } from "./locale";
const en = {
  synthetic: "SYNTHETIC DELIVERY TEST — not an application opportunity.",
  preview: "LOCAL DIGEST PREVIEW — no provider message sent.",
  fallback: "English fallback; selected template language is unavailable.",
  source:
    "Titles, fees and dates retain source wording. Eligibility needs checking. Open details for complete costs and the source deadline timezone.",
  deadline: "Deadline",
  applicationFee: "Application fee",
  certificateFee: "Certificate fee",
  notStated: "Not stated",
  unsubscribe: "Unsubscribe",
  pause: "Pause email digests",
  subject: "smartmanuAI synthetic digest test",
  funding: {
    fully_funded: "Tuition, accommodation and living costs funded",
    tuition_only: "Tuition covered only",
    free_participation: "Free participation",
    partial: "Partial funding",
    unclear: "Funding unclear",
  } as Record<string, string>,
};
const zh: typeof en = {
  synthetic: "模拟投递测试——这不是可申请的学习机会。",
  preview: "本地摘要预览——未向任何服务商发送消息。",
  fallback: "所选模板语言不可用，已回退至英语。",
  source:
    "标题、费用和日期保留来源原文。申请资格仍需核实。请打开详情查看完整费用，并核实来源截止时间的时区。",
  deadline: "截止日期",
  applicationFee: "申请费",
  certificateFee: "证书费",
  notStated: "未说明",
  unsubscribe: "退订",
  pause: "暂停邮件摘要",
  subject: "smartmanuAI 模拟摘要测试",
  funding: {
    fully_funded: "学费、住宿费和生活费获资助",
    tuition_only: "仅覆盖学费",
    free_participation: "免费参与",
    partial: "部分资助",
    unclear: "资助情况不明确",
  },
};
export function alertCopy(locale: Locale) {
  return locale === "zh-Hans" ? zh : en;
}
type AlertItem = {
  id: string;
  title: string;
  funding: string;
  deadline: string | null;
  applicationFee: string | null;
  certificateFee: string | null;
};
export function renderAlertText(input: {
  language: Locale;
  translationFallback: boolean;
  items: AlertItem[];
  synthetic: boolean;
}) {
  // A legacy fallback snapshot stays in English rather than claiming a translated body.
  const copy = alertCopy(input.translationFallback ? "en" : input.language);
  const short = (value: string | null, max: number) =>
    value === null
      ? copy.notStated
      : Array.from(value).slice(0, max).join("") +
        (Array.from(value).length > max ? "…" : "");
  return [
    input.synthetic ? copy.synthetic : copy.preview,
    ...(input.translationFallback ? [copy.fallback] : []),
    copy.source,
    ...input.items.map(
      (item) =>
        `${short(item.title, 80)}\n${Object.hasOwn(copy.funding, item.funding) ? copy.funding[item.funding] : short(item.funding, 50)} · ${copy.deadline}: ${short(item.deadline, 20)}\n${copy.applicationFee}: ${short(item.applicationFee, 35)}; ${copy.certificateFee}: ${short(item.certificateFee, 35)}\nhttps://smartmanu.example.test/opportunities/${encodeURIComponent(item.id)}`,
    ),
  ].join("\n\n");
}
