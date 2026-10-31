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
    "User-facing screens support English and Simplified Chinese. Source wording, diagnostic codes and some service responses remain in their original language. Admin tools and browser language review are pending.",
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
    "用户页面支持英语和简体中文。来源文字、诊断代码和部分服务响应保持原文。管理工具翻译及浏览器语言检查尚待完成。",
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
