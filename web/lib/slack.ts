import { DateTime, Interval } from "luxon";
import type { SlackConfig } from "./env";

type SlackApiParamValue = string | number | boolean | null | undefined | string[];
type SlackApiParams = Record<string, SlackApiParamValue>;

type SlackMessage = {
  text?: string;
  user?: string;
  ts: string;
  subtype?: string;
  reactions?: { name?: string; count?: number }[];
};

type SlackMemberProfile = {
  id: string;
  name: string;
  realName?: string;
  displayName?: string;
};

export type SectionKey = "done" | "good" | "more" | "next";
type SectionMap = Record<SectionKey, string[]>;

export type DailyReport = {
  userId: string;
  userName: string;
  submittedAt: DateTime;
  ts: string;
  permalink: string;
  sections: SectionMap;
  reactionScore: number;
};

export type DailyReportStatus = {
  userId: string;
  userName: string;
  status: "submitted" | "missing";
  submittedAt?: DateTime;
  streakDays: number;
};

export type GMHighlight = {
  type: "Good" | "More" | "Next";
  emoji: "👍" | "🧠" | "📅";
  member: string;
  snippet: string;
  reactions: number;
  permalink: string;
};

type SlackDashboardResult = {
  reports: DailyReport[];
  reportStatuses: DailyReportStatus[];
  gmHighlights: GMHighlight[];
  memberProfiles: Map<string, SlackMemberProfile>;
  warnings: string[];
  notices: string[];
};

const API_BASE = "https://slack.com/api";
let debugChannelCheckPerformed = false;

const SECTION_KEYS: SectionKey[] = ["done", "good", "more", "next"];
const HEADING_LABEL_TO_KEY: Record<string, SectionKey> = {
  done: "done",
  good: "good",
  more: "more",
  next: "next"
};
const HEADING_REGEX = /^(?:[^\w]*\s*)?(Done|Good|More|Next)(?:\s*[:：]\s*(.*))?$/i;
const LIST_BULLET_REGEX = /^([-*・•●◦]|\d+\.)\s*(.*)$/;
const LEADING_TRIM_PATTERN = /^[>\s]+/;

class SlackApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "SlackApiError";
    this.code = code;
  }
}

class SlackMissingScopeError extends SlackApiError {
  requiredScopes: string[];
  constructor(requiredScopes: string[]) {
    super(`Missing Slack scopes: ${requiredScopes.join(", ")}`, "missing_scope");
    this.name = "SlackMissingScopeError";
    this.requiredScopes = requiredScopes;
  }
}

function buildHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
  };
}

type SlackOkResponse<T> = { ok: true } & T;
type SlackErrorResponse = { ok: false; error: string; needed?: string | string[]; provided?: string };

async function slackApi<TResponse>(method: string, token: string, params: SlackApiParams = {}): Promise<SlackOkResponse<TResponse>> {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        body.append(key, value.join(","));
      }
      return;
    }
    body.append(key, String(value));
  });

  const response = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: buildHeaders(token),
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Slack API ${method} request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as SlackOkResponse<TResponse> | SlackErrorResponse;
  if (!data.ok) {
    if (data.error === "missing_scope") {
      const neededRaw = data.needed;
      const scopes =
        typeof neededRaw === "string"
          ? neededRaw.split(",").map((scope) => scope.trim()).filter(Boolean)
          : Array.isArray(neededRaw)
            ? neededRaw.map((scope) => scope.trim()).filter(Boolean)
            : [];
      throw new SlackMissingScopeError(scopes);
    }
    throw new SlackApiError(`Slack API ${method} error: ${data.error || "unknown error"}`, data.error);
  }

  return data;
}

async function fetchChannelMembers(config: SlackConfig): Promise<string[]> {
  const members: string[] = [];
  let cursor: string | undefined;

  if (!debugChannelCheckPerformed && process.env.NODE_ENV !== "production") {
    debugChannelCheckPerformed = true;
    const dump = (value: string) => `[len=${value.length}] ` + Array.from(value).map((char) => char.charCodeAt(0).toString(16)).join(" ");
    const literalChannel = "C0957N7D0MP";
    const formatError = (err: unknown) => {
      if (err instanceof SlackApiError) {
        return err.code || err.message;
      }
      if (err instanceof Error) {
        return err.message;
      }
      return String(err);
    };
    console.log("[DBG] channel raw =", JSON.stringify(config.channelId));
    console.log("[DBG] channel hex =", dump(config.channelId));

    try {
      const response = await slackApi<{ members: string[] }>("conversations.members", config.botToken, {
        channel: config.channelId,
        limit: 3
      });
      console.log("[DBG] members.ok =", true, "first =", response.members?.[0]);
    } catch (error) {
      console.log("[DBG] members.error =", formatError(error));
    }

    try {
      const responseLiteral = await slackApi<{ members: string[] }>("conversations.members", config.botToken, {
        channel: literalChannel,
        limit: 3
      });
      console.log("[DBG] members(literal).ok =", true, "first =", responseLiteral.members?.[0]);
    } catch (error) {
      console.log("[DBG] members(literal).error =", formatError(error));
    }
  }

  do {
    const response = await slackApi<{ members: string[]; response_metadata?: { next_cursor?: string } }>(
      "conversations.members",
      config.botToken,
      {
        channel: config.channelId,
        cursor,
        limit: 200
      }
    );
    members.push(...response.members);
    cursor = response.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return members;
}

type FetchProfileResult = {
  profiles: Map<string, SlackMemberProfile>;
  warnings: string[];
  notices: string[];
};

async function fetchUserProfiles(config: SlackConfig, userIds: string[]): Promise<FetchProfileResult> {
  const profiles = new Map<string, SlackMemberProfile>();
  const warnings: string[] = [];
  const notices: string[] = [];
  const missingScopeNotified = new Set<string>();
  const userNotFoundNotified = new Set<string>();

  for (const userId of userIds) {
    try {
      const response = await slackApi<{ user: { id: string; name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string } } }>(
        "users.info",
        config.botToken,
        { user: userId }
      );
      const profile = response.user;
      const displayName = profile.profile?.display_name?.trim();
      const realName = profile.profile?.real_name?.trim() || profile.real_name?.trim();
      profiles.set(userId, {
        id: profile.id,
        name: displayName || realName || profile.name || userId,
        realName: realName || profile.name,
        displayName: displayName || undefined
      });
    } catch (error) {
      // Store fallback entry to avoid breaking downstream logic.
      profiles.set(userId, {
        id: userId,
        name: userId
      });
      if (error instanceof SlackMissingScopeError) {
        const scopeKey = error.requiredScopes.sort().join(",");
        if (!missingScopeNotified.has(scopeKey)) {
          missingScopeNotified.add(scopeKey);
          const scopeMessage =
            error.requiredScopes.length > 0
              ? `users.info 用に追加スコープが必要です: ${error.requiredScopes.join(", ")}`
              : "Slack アプリ設定で users.info を許可してください。";
          notices.push(`Slack のユーザー名取得をスキップしました。${scopeMessage}`);
        }
        break;
      }

      if (error instanceof SlackApiError && error.code === "user_not_found") {
        if (!userNotFoundNotified.has(userId)) {
          userNotFoundNotified.add(userId);
          notices.push(
            `Slack ユーザー ${userId} を取得できませんでした (user_not_found)。Bot を対象ワークスペースに再インストールするか、対象ユーザーが有効か確認してください。`
          );
        }
        continue;
      }

      warnings.push(`Slack のユーザープロフィール取得に失敗しました (${userId}): ${(error as Error).message}`);
    }
  }

  return { profiles, warnings, notices };
}

async function fetchChannelMessages(config: SlackConfig, oldestTs: number): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    const response = await slackApi<{ messages: SlackMessage[]; response_metadata?: { next_cursor?: string } }>("conversations.history", config.botToken, {
      channel: config.channelId,
      oldest: oldestTs.toFixed(6),
      cursor,
      limit: 200,
      inclusive: true
    });
    messages.push(...response.messages);
    cursor = response.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return messages;
}

function normalizeSlackText(text: string, userProfiles: Map<string, SlackMemberProfile>): string {
  return text
    .replace(/<@([A-Z0-9]+)>/g, (_, id: string) => `@${userProfiles.get(id)?.name || id}`)
    .replace(/<#!?([A-Z0-9]+)\|([^>]+)>/g, (_, _channelId: string, channelName: string) => `#${channelName}`)
    .replace(/<([^|>]+)\|([^>]+)>/g, (_, url: string, label: string) => `${label} (${url})`)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseSectionContent(text: string): SectionMap {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  const rawBuffers: Record<SectionKey, string[]> = {
    done: [],
    good: [],
    more: [],
    next: []
  };

  let currentSection: SectionKey | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(HEADING_REGEX);

    if (headingMatch) {
      const key = HEADING_LABEL_TO_KEY[headingMatch[1].toLowerCase()];
      if (key) {
        currentSection = key;
        rawBuffers[key] = rawBuffers[key] ?? [];
        const inlineContent = headingMatch[2]?.trim();
        if (inlineContent) {
          rawBuffers[key].push(inlineContent);
        }
        continue;
      }
    }

    if (!currentSection) {
      continue;
    }

    rawBuffers[currentSection].push(line);
  }

  const sections: SectionMap = {
    done: [],
    good: [],
    more: [],
    next: []
  };

  SECTION_KEYS.forEach((key) => {
    const buffer = rawBuffers[key];
    if (!buffer || buffer.length === 0) {
      sections[key] = [];
      return;
    }

    const items: string[] = [];
    let currentItem: string | null = null;

    buffer.forEach((rawLine) => {
      const trimmedLine = rawLine.trim();

      if (!trimmedLine) {
        if (currentItem) {
          items.push(currentItem.trim());
          currentItem = null;
        }
        return;
      }

      const unquotedLine = rawLine.replace(LEADING_TRIM_PATTERN, "").trimEnd();
      const bulletMatch = unquotedLine.match(LIST_BULLET_REGEX);

      if (bulletMatch && bulletMatch[2]) {
        if (currentItem) {
          items.push(currentItem.trim());
        }
        currentItem = bulletMatch[2].trim();
        return;
      }

      const cleanLine = unquotedLine.trim();
      if (!cleanLine) {
        return;
      }

      if (currentItem) {
        currentItem = `${currentItem} ${cleanLine}`.trim();
      } else {
        currentItem = cleanLine;
      }
    });

    if (currentItem) {
      items.push(currentItem.trim());
    }

    sections[key] = items.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  });

  return sections;
}

function buildPermalink(channelId: string, ts: string): string {
  const sanitizedTs = ts.replace(".", "");
  return `https://slack.com/archives/${channelId}/p${sanitizedTs}`;
}

function calculateReactionScore(message: SlackMessage): number {
  return (message.reactions || []).reduce((acc, reaction) => acc + (reaction.count || 0), 0);
}

function filterReportMessages(messages: SlackMessage[]): SlackMessage[] {
  return messages.filter((message) => {
    if (!message.text || !message.user) {
      return false;
    }
    if (message.subtype && message.subtype !== "bot_message") {
      return false;
    }
    return true;
  });
}

function toDateTime(ts: string, timezone: string): DateTime {
  return DateTime.fromSeconds(Number(ts), { zone: "utc" }).setZone(timezone);
}

export async function fetchSlackDashboardData(config: SlackConfig, timezone: string): Promise<SlackDashboardResult> {
  const warnings: string[] = [];
  const notices: string[] = [];

  let channelMembers: string[] = [];
  try {
    channelMembers = await fetchChannelMembers(config);
  } catch (error) {
    if (error instanceof SlackMissingScopeError) {
      const scopeMessage =
        error.requiredScopes.length > 0
          ? `追加が必要なスコープ: ${error.requiredScopes.join(", ")}`
          : "Slack アプリ設定で conversations.members を許可してください。";
      notices.push(`Slack のメンバー一覧取得をスキップしました。${scopeMessage}`);
    } else if (error instanceof SlackApiError) {
      warnings.push(`Slack のメンバー取得に失敗しました: ${error.message}`);
    } else {
      throw error;
    }
    channelMembers = [];
  }

  const now = DateTime.now().setZone(timezone);
  const todayInterval = Interval.fromDateTimes(now.startOf("day"), now.endOf("day"));
  const historyOldest = now.minus({ days: 14 }).startOf("day");

  const messages = await fetchChannelMessages(config, historyOldest.toSeconds());
  const candidateMessages = filterReportMessages(messages);

  const messageAuthors = Array.from(
    new Set(candidateMessages.map((message) => message.user).filter((userId): userId is string => Boolean(userId)))
  );

  const profilesToFetch = Array.from(new Set([...channelMembers, ...messageAuthors]));
  const profileResult = await fetchUserProfiles(config, profilesToFetch);
  const userProfiles = profileResult.profiles;
  warnings.push(...profileResult.warnings);
  notices.push(...profileResult.notices);

  const reports: DailyReport[] = candidateMessages.map((message) => {
    const submittedAt = toDateTime(message.ts, timezone);
    const normalizedText = normalizeSlackText(message.text || "", userProfiles);
    const sections = parseSectionContent(normalizedText);
    const userProfile = userProfiles.get(message.user as string);
    return {
      userId: message.user as string,
      userName: userProfile?.name || message.user || "Unknown",
      submittedAt,
      ts: message.ts,
      permalink: buildPermalink(config.channelId, message.ts),
      sections,
      reactionScore: calculateReactionScore(message)
    };
  });

  const reportsByUser = new Map<string, DailyReport[]>();
  reports.forEach((report) => {
    const existing = reportsByUser.get(report.userId) || [];
    existing.push(report);
    reportsByUser.set(report.userId, existing);
  });

  reportsByUser.forEach((userReports) => {
    userReports.sort((a, b) => b.submittedAt.toMillis() - a.submittedAt.toMillis());
  });

  const targetUserIds = Array.from(new Set(channelMembers.length > 0 ? channelMembers : messageAuthors));
  if (channelMembers.length === 0) {
    notices.push("Slack メンバー一覧を取得できなかったため、直近の投稿者のみを対象にしています。");
  }

  const todayStatuses = targetUserIds.map<DailyReportStatus>((userId) => {
    const profile = userProfiles.get(userId);
    const userReports = reportsByUser.get(userId) || [];
    const todaysReport = userReports.find((report) => todayInterval.contains(report.submittedAt));

    const streak = computeSubmissionStreak(userReports, now);

    if (!todaysReport) {
      return {
        userId,
        userName: profile?.name || userId,
        status: "missing",
        streakDays: streak
      };
    }

    return {
      userId,
      userName: profile?.name || userId,
      status: "submitted",
      submittedAt: todaysReport.submittedAt,
      streakDays: streak
    };
  });

  const highlights = buildGMHighlights(reports);

  return {
    reports,
    reportStatuses: todayStatuses,
    gmHighlights: highlights,
    memberProfiles: userProfiles,
    warnings,
    notices
  };
}

function computeSubmissionStreak(userReports: DailyReport[] | undefined, now: DateTime): number {
  if (!userReports || userReports.length === 0) {
    return 0;
  }

  let streak = 0;
  let cursor = now.startOf("day");

  const reportsByDate = new Map<string, boolean>();
  userReports.forEach((report) => {
    const key = report.submittedAt.toISODate() ?? report.submittedAt.toFormat("yyyy-MM-dd");
    if (!reportsByDate.has(key)) {
      reportsByDate.set(key, true);
    }
  });

  while (true) {
    const dateKey = cursor.toISODate() ?? cursor.toFormat("yyyy-MM-dd");
    if (reportsByDate.get(dateKey)) {
      streak += 1;
      cursor = cursor.minus({ days: 1 });
    } else {
      break;
    }
  }

  return streak;
}

function buildGMHighlights(reports: DailyReport[]): GMHighlight[] {
  const priorities: { key: SectionKey; label: GMHighlight["type"]; emoji: GMHighlight["emoji"] }[] = [
    { key: "good", label: "Good", emoji: "👍" },
    { key: "more", label: "More", emoji: "🧠" },
    { key: "next", label: "Next", emoji: "📅" }
  ];

  const highlights: GMHighlight[] = [];
  type HighlightCandidate = { report: DailyReport; snippet: string };

  priorities.forEach(({ key, label, emoji }) => {
    let bestEntry: HighlightCandidate | null = null;

    reports.forEach((report) => {
      const items = report.sections[key];
      if (!items || items.length === 0) {
        return;
      }
      const snippet = items[0];
      if (!bestEntry || report.reactionScore > bestEntry.report.reactionScore) {
        bestEntry = { report, snippet };
      }
    });

    if (bestEntry !== null) {
      const candidate = bestEntry as HighlightCandidate;
      highlights.push({
        type: label,
        emoji,
        member: candidate.report.userName,
        snippet: candidate.snippet,
        reactions: candidate.report.reactionScore,
        permalink: candidate.report.permalink
      });
    }
  });

  return highlights;
}
