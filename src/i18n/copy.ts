import type { Locale } from "./locale";
const en = {
  nav: "Main navigation",
  opportunities: "Opportunities",
  space: "My space",
  alerts: "Alerts",
  privacy: "Privacy",
  signIn: "Sign in",
  displayLanguage: "Display language (this browser)",
  apply: "Apply",
  saving: "Applying…",
  localeError: "Unable to change the display language. Please retry.",
  footer:
    "Local prototype · Synthetic opportunities · Notifications stay in a local test sink",
  partial:
    "Navigation, sign-in, catalogue and private workspace are translated. Alert settings, privacy screens and service messages may still use English. Source wording is unchanged.",
  eyebrow: "YOUR OPPORTUNITY SPACE",
  welcome: "Welcome back.",
  signInIntro:
    "Use a synthetic address ending in .test. A sign-in link will be written to the local mail sink.",
  email: "Test email",
  preparing: "Preparing link…",
  getLink: "Get sign-in link",
  linkReady: "Check the local mail sink for your sign-in link.",
  linkError: "Unable to create a link. Check your address and try again.",
  connectionError: "Connection failed. Please retry.",
};
const zh: Record<keyof typeof en, string> = {
  nav: "主导航",
  opportunities: "学习机会",
  space: "我的空间",
  alerts: "提醒",
  privacy: "隐私",
  signIn: "登录",
  displayLanguage: "显示语言（此浏览器）",
  apply: "应用",
  saving: "正在应用…",
  localeError: "无法更改显示语言，请重试。",
  footer: "本地原型 · 模拟学习机会 · 通知仅保存在本地测试收件箱中",
  partial:
    "导航、登录、目录和私人空间已翻译。提醒设置、隐私页面和部分服务消息可能仍使用英语。来源文字保持原文。",
  eyebrow: "您的学习机会空间",
  welcome: "欢迎回来。",
  signInIntro:
    "请使用以 .test 结尾的模拟邮箱地址。登录链接将写入本地邮件收件箱。",
  email: "测试邮箱",
  preparing: "正在准备链接…",
  getLink: "获取登录链接",
  linkReady: "请在本地邮件收件箱中查看登录链接。",
  linkError: "无法创建链接，请检查邮箱地址后重试。",
  connectionError: "连接失败，请重试。",
};
export function interfaceCopy(locale: Locale) {
  return locale === "zh-Hans" ? zh : en;
}
