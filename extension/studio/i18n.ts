import type { StudioLocale } from "@readit/schema";

const en = {
  brandBlurb:
    "New Reddit (shreddit) only — not Old Reddit. Coexists with Moderator Toolbox; skip Old Reddit Redirect.",
  noisePack: "Chrome noise pack",
  joinConversation: "Hide “Join the conversation”",
  relatedCommunities: "Hide Related Communities",
  redditPro: "Hide Reddit Pro",
  aiSummary: "Hide AI summaries",
  searchAnswers: "Hide Search Answers",
  announcements: "Hide announcements",
  awards: "Hide awards",
  crosspost: "Hide crosspost",
  joinButton: "Hide Join pills on posts",
  feedPhilosophy: "Feed philosophy",
  followingFeed: "Start on Following (not For You)",
  lurkerMode: "Lurker mode (disable vote taps)",
  feedDensity: "Feed density",
  keyboardMode: "Keyboard nav mode",
  keyboardDefer: "Defer to Reddit hotkeys",
  keyboardReadit: "Readit J/K scroll posts",
  keyboardCheat: "Official hotkeys: J/K navigate · A/Z vote · R reply · S save · H hide · F collapse · Shift+?",
  markRead: "Mark read / dim visited",
  antiRefresh: "Disable home auto-refresh chips",
  commentUx: "Comment quote + formatting",
  accountSwitcher: "Open Reddit account switcher",
  exportPreview: "Import preview",
  healthOverview: "Feature health overview",
  locale: "Studio language",
} as const;

const zh: Record<keyof typeof en, string> = {
  brandBlurb:
    "仅支持新版 Reddit（shreddit），不支持旧版。可与 Moderator Toolbox 共存；无需 Old Reddit Redirect。",
  noisePack: "界面噪音包",
  joinConversation: "隐藏 “Join the conversation”",
  relatedCommunities: "隐藏相关社区",
  redditPro: "隐藏 Reddit Pro",
  aiSummary: "隐藏 AI 摘要",
  searchAnswers: "隐藏搜索回答",
  announcements: "隐藏公告",
  awards: "隐藏奖励",
  crosspost: "隐藏转发",
  joinButton: "隐藏帖子 Join 按钮",
  feedPhilosophy: "信息流哲学",
  followingFeed: "首页默认 Following（非 For You）",
  lurkerMode: "潜水模式（禁用投票点击）",
  feedDensity: "信息流密度",
  keyboardMode: "键盘导航模式",
  keyboardDefer: "交给 Reddit 快捷键",
  keyboardReadit: "readit J/K 滚动帖子",
  keyboardCheat:
    "官方快捷键：J/K 导航 · A/Z 投票 · R 回复 · S 收藏 · H 隐藏 · F 折叠 · Shift+?",
  markRead: "已读标记 / 淡化已访问",
  antiRefresh: "禁用首页自动刷新提示",
  commentUx: "评论引用 + 格式工具",
  accountSwitcher: "打开 Reddit 账号切换",
  exportPreview: "导入预览",
  healthOverview: "功能健康总览",
  locale: "Studio 语言",
};

const catalogs: Record<StudioLocale, Record<keyof typeof en, string>> = {
  en: { ...en },
  zh,
};

export type StudioStringKey = keyof typeof en;

export function t(locale: StudioLocale, key: StudioStringKey): string {
  return catalogs[locale]?.[key] ?? catalogs.en[key] ?? key;
}

export const STUDIO_LOCALES: { id: StudioLocale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
];
