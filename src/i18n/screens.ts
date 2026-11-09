import { adminChinese, researchStateLabels } from "./admin";
import { errorChinese } from "./errors";
import { controlChinese } from "./controls";
import type { Locale } from "./locale";
export const screenChinese: Record<string, string> = {
  "Intake / event edition:": "入学批次／活动届次：",
  "Catalogue review status": "目录审核状态",
  "Last reviewed publication (UTC):": "最近一次已发布记录的审核时间（UTC）：",
  "No reviewed non-synthetic publications are recorded yet.":
    "目前尚无经过审核的非模拟发布记录。",
  "This catalogue-wide timestamp covers currently published records, including records hidden by filters or freshness limits. It does not confirm a complete source refresh or current availability.":
    "此目录级时间涵盖当前已发布的记录，包括因筛选或时效限制而隐藏的记录。它不表示所有来源均已刷新，也不保证机会当前仍然有效。",
  ...controlChinese,
  ...adminChinese,
  ...errorChinese,
  "Title, organizer or summary": "标题、主办方或简介",
  "Topic contains": "主题包含",
  "For example: digital twins": "例如：digital twins",
  "Study level": "学历层次",
  "All study levels": "所有学历层次",
  "Participation mode": "参与方式",
  "All modes": "所有参与方式",
  Location: "地点",
  "All locations": "所有地点",
  "China (CN)": "中国（CN）",
  "Location not stated": "地点未说明",
  "Deadline filter": "截止日期筛选",
  "All deadline states": "所有截止日期状态",
  "Next 30 calendar days (UTC)": "未来 30 个日历日（UTC）",
  "Dated deadlines only": "仅显示已注明截止日期的记录",
  "Deadline not stated": "截止日期未说明",
  "Clear filters": "清除筛选",
  "Some filters are invalid. Clear them or choose valid options before searching.":
    "部分筛选条件无效，请清除或选择有效选项后再搜索。",
  "Date-only filters use UTC calendar dates; the source deadline timezone remains unknown. Unstated values do not confirm eligibility.":
    "仅日期筛选使用 UTC 日历日期，来源截止时间的时区仍未知。未说明的值不代表符合申请条件。",
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
  "Country of residence (optional two-letter code)":
    "居住国家（可选，两位国家代码）",
  "Residence requirements are not stated.": "居住地要求未说明。",
  "Add your country of residence to check this restriction.":
    "请添加您的居住国家以核对此项限制。",
  "Your country of residence does not meet the recorded restriction.":
    "您的居住国家不符合已记录的限制。",
  "Residence meets the recorded restriction.": "居住地符合已记录的限制。",
  "Nationality (two-letter country code)": "国籍（两位国家代码）",
  "I confirm this age is current today (UTC).":
    "我确认此年龄截至今天（UTC）仍准确。",
  "Birth year (optional)": "出生年份（可选）",
  "Provide age or birth year, not both. Old ages need confirmation; birth year gives a range without collecting your birthday.":
    "请填写年龄或出生年份，不要同时填写。旧年龄需要确认；出生年份提供年龄范围，无需收集您的生日。",
  "Confirm your current age or add your birth year to check age limits.":
    "请确认您目前的年龄或添加出生年份，以核对年龄限制。",
  "Your birth-year age range overlaps an age limit; check the source and your birthday.":
    "根据出生年份计算的年龄范围跨越年龄限制；请结合官方来源和您的生日核实。",
  "Mandatory language-test requirement (optional)":
    "必需的语言考试要求（可选）",
  "Language-test result (optional)": "语言考试成绩（可选）",
  "Use the exact test name and version. Different score scales are not converted. Leave all fields blank if unknown.":
    "请使用准确的考试名称及版本。不转换不同分制；如未知，请全部留空。",
  "Record one mandatory overall-score requirement supported by source evidence. Alternatives, waivers and section scores need manual review.":
    "仅记录有来源证据支持的一项必需总分要求。替代考试、豁免及单项分数须人工审核。",
  "Self-reported results only. Enter validity from your result and the source; do not guess an expiry date.":
    "仅使用自报成绩。请根据成绩记录及来源填写有效期，不要猜测到期日期。",
  "Test name and version": "考试名称及版本",
  "Maximum score on this scale": "此分制的满分",
  "Required minimum overall score": "所需最低总分",
  "Your overall score": "您的总分",
  "Test date": "考试日期",
  "Valid through (if known)": "有效期至（如已知）",
  "Your recorded language-test score is below the source minimum.":
    "您记录的语言考试成绩低于来源要求的最低分数。",
  "Your recorded language-test score meets the source minimum.":
    "您记录的语言考试成绩达到来源要求的最低分数。",
  "Language-test evidence needs checking: missing, expired or different test/version/scale.":
    "语言考试资料需要核实：资料缺失、过期或考试、版本、分制不一致。",
  "Return to active sign-ins": "返回活跃登录",
  "Active sign-ins": "活跃登录",
  "Manage active sign-ins": "管理活跃登录",
  "These are active sign-ins, not a complete activity history. Browser hints may be missing or inaccurate; update times are session updates, not last activity.":
    "此处显示活跃登录，并非完整活动记录。浏览器提示可能缺失或不准确；更新时间指会话更新，并非最后活动时间。",
  "Viewing and revoking sessions requires a sign-in within the last ten minutes. Revoking this sign-in signs you out.":
    "查看及撤销会话需要在最近十分钟内登录。撤销当前登录会使您退出。",
  "Sign in again": "重新登录",
  "This sign-in": "当前登录",
  "Another sign-in": "其他登录",
  "Browser information unavailable": "无浏览器信息",
  "Created (UTC)": "创建时间（UTC）",
  "Session updated (UTC)": "会话更新时间（UTC）",
  "Expires (UTC)": "到期时间（UTC）",
  "Confirm revoking this sign-in": "确认撤销此登录",
  "Revoke sign-in": "撤销登录",
  "No active sign-ins on this page.": "本页无活跃登录。",
  "Session pages": "登录会话分页",
  "Sign-in revoked or already unavailable.": "登录已撤销或已不可用。",
  "Sign in again before managing your sessions.":
    "请重新登录后再管理您的会话。",
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
