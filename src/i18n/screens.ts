import { adminChinese, researchStateLabels } from "./admin";
import { controlChinese } from "./controls";
import type { Locale } from "./locale";
export const screenChinese: Record<string, string> = {
  ...controlChinese,
  ...adminChinese,
  "SMART MANUFACTURING OPPORTUNITIES": "智能制造学习机会",
  "Find your next": "寻找您的下一个",
  "step forward.": "进步机会。",
  "Explore reviewed scholarships, learning programs and events. Check funding, remaining costs and the official source before applying.":
    "探索经审核的奖学金、学习项目和活动。申请前请核实资助、剩余费用及官方来源。",
  "Local prototype. Any synthetic records are clearly labelled and have no application link.":
    "本地原型。模拟记录均有明确标记，且不提供申请链接。",
  Search: "搜索",
  "Topic, title or organizer": "主题、标题或主办方",
  Type: "类型",
  "All types": "所有类型",
  Scholarships: "奖学金",
  Courses: "课程",
  Events: "活动",
  "Teaching language": "授课语言",
  "All languages": "所有语言",
  English: "英语",
  Chinese: "中文",
  Other: "其他",
  "Not stated": "未说明",
  Funding: "资助",
  "Free and funded opportunities": "免费或获资助的机会",
  "Find opportunities": "查找机会",
  "Explore opportunities": "浏览机会",
  "Results: {count}": "结果：{count}",
  "No reviewed opportunities match these filters. Try a broader search or check back after the next review.":
    "没有符合这些筛选条件的已审核机会。请扩大搜索范围，或在下次审核后再次查看。",
  "Synthetic fixture": "模拟测试记录",
  "Deadline:": "截止日期：",
  "Application fee:": "申请费：",
  "Last verified:": "最近核实：",
  "View details": "查看详情",
  "Results pagination": "搜索结果分页",
  Previous: "上一页",
  Next: "下一页",
  " · Timezone not stated": " · 时区未说明",
  "Back to opportunities": "返回学习机会",
  "Synthetic fixture for local testing. This is not a real opportunity.":
    "仅供本地测试的模拟记录。这不是真实的学习机会。",
  "This opportunity is closed or needs a fresh source check. New saves and application actions are paused.":
    "此机会已关闭或需要重新核实来源。新增收藏及申请操作已暂停。",
  "Funding and remaining costs": "资助及剩余费用",
  Covered: "已覆盖",
  "Not covered": "未覆盖",
  Free: "免费",
  "Not free": "不免费",
  Tuition: "学费",
  Accommodation: "住宿费",
  "Living costs": "生活费",
  "Participation fee": "参与费",
  "Application fee": "申请费",
  "Certificate fee": "证书费",
  "Travel costs": "差旅费",
  "Coverage duration": "资助期限",
  "Fully funded": "学费、住宿费和生活费获资助",
  "Tuition only": "仅覆盖学费",
  "Free participation": "免费参与",
  "Partial funding": "部分资助",
  "Funding unclear": "资助情况不明确",
  "Eligibility and deadline": "申请条件与截止日期",
  "Teaching language:": "授课语言：",
  "Application deadline:": "申请截止日期：",
  " · Date only; timezone not stated.": " · 仅有日期，时区未说明。",
  "Source wording:": "来源原文：",
  "Topics:": "主题：",
  "Official source": "官方来源",
  "No live application link is available for synthetic records.":
    "模拟记录不提供真实申请链接。",
  "· Revision": "· 记录版本",
  "Requirements can change. Review the official information before applying.":
    "要求可能发生变化。申请前请核实官方信息。",
  "Open official application information": "打开官方申请信息",
  "Read the source information": "阅读来源信息",
  "Opportunity saved.": "已收藏此机会。",
  "This opportunity could not be saved. Please refresh and retry.":
    "无法收藏此机会，请刷新后重试。",
  "Connection failed. Please retry.": "连接失败，请重试。",
  "Saving…": "正在保存…",
  "Save opportunity": "收藏此机会",
  "YOUR PRIVATE SPACE": "您的私人空间",
  "A step closer.": "离目标更近一步。",
  "Signed in as": "当前登录邮箱：",
  ". Matches use your saved preferences and reviewed source facts. They do not confirm admission eligibility.":
    "。匹配依据您已保存的偏好及经审核的来源事实，不代表您已符合录取条件。",
  "Your preferences": "您的偏好",
  "Interface, alert and teaching languages are independent. Source wording remains unchanged. Age and qualification are optional; unknown eligibility still needs checking.":
    "界面、提醒和授课语言相互独立。来源原文保持不变。年龄和学历为选填项；未知的申请条件仍需核实。",
  "Interface language": "界面语言",
  "Alert language": "提醒语言",
  "Simplified Chinese": "简体中文",
  "Nationality (two-letter country code)": "国籍（两位国家代码）",
  "Age (optional)": "年龄（选填）",
  "Highest qualification": "最高学历",
  "Not supplied": "未提供",
  "Topics, separated by commas": "主题（用英文逗号分隔）",
  "smart manufacturing, digital twins": "智能制造, 数字孪生",
  "Preferred in-person country codes, separated by commas":
    "线下参与的首选国家代码（用英文逗号分隔）",
  "Acceptable teaching languages (none means no preference)":
    "可接受的授课语言（不选表示不限）",
  "Opportunity types": "机会类型",
  "Funding preferences": "资助偏好",
  "Participation modes": "参与方式",
  "Target scholarship levels (optional)": "目标奖学金学历层次（选填）",
  Secondary: "中学",
  Bachelor: "本科",
  Master: "硕士",
  Doctorate: "博士",
  Online: "线上",
  "In person": "线下",
  "Save preferences and refresh matches": "保存偏好并刷新匹配",
  "Your matches": "为您匹配的机会",
  "Save your preferences to see matches.": "请保存偏好以查看匹配结果。",
  "matches · Profile version": "项匹配 · 个人资料版本",
  "· Rules": "· 规则版本",
  "Matching is limited to the latest 1,000 reviewed records. Broader catalogue coverage is pending.":
    "匹配范围仅限最近的 1,000 条已审核记录。更广泛的目录覆盖尚待实现。",
  "No current matches. Review your preferences or explore the catalogue.":
    "目前没有匹配结果。请调整偏好或浏览目录。",
  "Needs checking · Relevance score": "需核实 · 相关性评分",
  "· Record revision": "· 记录版本",
  "Eligibility and information to check": "需核实的申请条件与信息",
  Save: "收藏",
  Dismiss: "隐藏",
  "Match pages": "匹配结果分页",
  "Saved and dismissed opportunities": "已收藏和已隐藏的机会",
  "Application status is self-reported. Closed or unavailable records remain in your tracker.":
    "申请状态由您自行填写。已关闭或不可用的记录仍保留在您的跟踪列表中。",
  Opportunity: "学习机会",
  "Unavailable opportunity": "不可用的机会",
  Unavailable: "不可用",
  " · Material change since dismissal; may appear in matches again.":
    " · 隐藏后重要信息发生变化，可能再次出现在匹配结果中。",
  " · Dismissed": " · 已隐藏",
  "Application status": "申请状态",
  Interested: "感兴趣",
  Applying: "准备申请",
  Applied: "已申请（自行填报）",
  Published: "已发布",
  Closed: "已关闭",
  "Remove from saved": "取消收藏",
  "Restore to matches": "恢复到匹配结果",
  "Dismiss from matches": "从匹配结果中隐藏",
  "No saved or dismissed opportunities yet.": "尚无已收藏或已隐藏的机会。",
  "Explore all opportunities": "浏览所有机会",
  "Sign out": "退出登录",
  "Unable to refresh. Please reload the page.": "无法刷新，请重新加载页面。",
  "Unable to save. Please retry.": "无法保存，请重试。",
  "Tracker updated. Applied is your own reported status.":
    "跟踪列表已更新。“已申请”为您自行填报的状态。",
  "Preferences saved and matches refreshed.": "偏好已保存，匹配结果已刷新。",
  "Matches your opportunity types.": "符合您选择的机会类型。",
  "Matches your funding preferences.": "符合您的资助偏好。",
  "Matches your participation modes.": "符合您的参与方式。",
  "Teaching language is not stated.": "授课语言未说明。",
  "Matches your teaching languages.": "符合您接受的授课语言。",
  "Location is not stated.": "地点未说明。",
  "Matches your preferred countries.": "符合您的首选国家。",
  "Topic overlap:": "相关主题：",
  "Scholarship study level is not stated.": "奖学金学历层次未说明。",
  "Matches your target study levels.": "符合您的目标学历层次。",
  "Structured nationality, age and qualification requirements are unavailable.":
    "暂无结构化的国籍、年龄及学历要求。",
  "Nationality requirements are not stated.": "国籍要求未说明。",
  "Add your nationality to check this restriction.": "请添加国籍以核实此限制。",
  "Nationality meets the recorded restriction.": "国籍符合已记录的限制。",
  "Add your age to check the recorded age limits.":
    "请添加年龄以核实已记录的年龄限制。",
  "Age meets the recorded limits.": "年龄符合已记录的限制。",
  "Age requirements are not stated.": "年龄要求未说明。",
  "Your qualification needs checking against the source requirement.":
    "您的学历仍需与来源要求核实。",
  "Qualification meets the recorded minimum.": "学历符合已记录的最低要求。",
  "Minimum qualification is not stated.": "最低学历要求未说明。",
  "Check the official eligibility text for additional requirements, including language tests.":
    "请核实官方申请条件原文中的其他要求，包括语言考试。",
  "Your tracker changed. Reload and retry.":
    "跟踪列表已更改，请重新加载后重试。",
  "Saved item not found.": "未找到收藏记录。",
  "Opportunity is unavailable.": "此机会当前不可用。",
  "Save this opportunity before updating its status.":
    "请先收藏此机会，再更新状态。",
  "Sign in required.": "请先登录。",
  "Invalid request fields.": "请求字段无效。",
  "Unable to complete the request.": "无法完成此请求。",
  invalid_profile: "个人资料无效，请检查后重试。",
  unauthorized: "请先登录。",
  invalid_origin: "请求来源无效。",
  "Tracker changed. Reload before updating.":
    "跟踪列表已更改，请重新加载后再更新。",
};
export function screenText(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
) {
  const text =
    locale === "zh-Hans" && Object.hasOwn(screenChinese, key)
      ? screenChinese[key]
      : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
const enumEnglish: Record<string, string> = {
  en: "English",
  zh: "Chinese",
  "zh-Hans": "Simplified Chinese",
  other: "Other",
  unknown: "Not stated",
  scholarship: "Scholarships",
  course: "Courses",
  event: "Events",
  fully_funded: "Fully funded",
  tuition_only: "Tuition only",
  free_participation: "Free participation",
  partial: "Partial funding",
  unclear: "Funding unclear",
  secondary: "Secondary",
  bachelor: "Bachelor",
  master: "Master",
  doctorate: "Doctorate",
  online: "Online",
  in_person: "In person",
  interested: "Interested",
  applying: "Applying",
  applied: "Applied",
  published: "Published",
  closed: "Closed",
  title: "Title",
  funding: "Funding",
  deadline: "Deadline",
  eligibility: "Eligibility",
  draft: "Draft catalogue record",
  rejected: "Rejected catalogue record",
  email: "Email",
  telegram: "Telegram",
  pending: "Pending confirmation",
  active: "Locally confirmed",
  disconnected: "Disconnected",
  revoked: "Revoked",
  blocked: "Blocked",
  queued: "Queued for local worker",
  ready: "Ready for fixture worker",
  sending: "Sending simulation",
  retry: "Retry queued",
  quota_wait: "Waiting for quota",
  failed: "Failed",
  uncertain: "Uncertain — requires review",
  suppressed: "Suppressed",
  bounce: "Bounce",
  complaint: "Complaint",
};
export function screenLabel(locale: Locale, value: string) {
  return screenText(
    locale,
    Object.hasOwn(enumEnglish, value) ? enumEnglish[value] : value,
  );
}
export function matchExplanation(locale: Locale, value: string) {
  if (value.startsWith("Topic overlap: "))
    return (
      screenText(locale, "Topic overlap:") +
      " " +
      value.slice("Topic overlap: ".length)
    );
  return screenText(locale, value);
}
export function screenMessage(locale: Locale, value: string) {
  if (!value) return "";
  if (locale === "zh-Hans" && !Object.hasOwn(screenChinese, value))
    return "服务消息（原文）：" + value;
  return screenText(locale, value);
}

export function researchState(
  locale: Locale,
  kind: "job" | "candidate",
  value: string,
) {
  const labels = researchStateLabels[kind];
  return screenText(
    locale,
    Object.hasOwn(labels, value) ? labels[value] : value,
  );
}
