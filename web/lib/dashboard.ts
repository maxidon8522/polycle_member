import { DateTime, Interval } from "luxon";
import { fetchSheetTasks, SheetTask } from "./googleSheets";
import { resolveGoogleConfig, resolveSlackConfig, resolveTimezone, formatMissingEnv } from "./env";
import { fetchSlackDashboardData, GMHighlight, DailyReport } from "./slack";

export type WeeklyMetrics = {
  start: DateTime;
  end: DateTime;
  tasksCompleted: number;
  reportsSubmitted: number;
  membersTotal: number;
  topProject: string | null;
  nextFocus: string | null;
};

export type TaskHighlight = {
  project: string;
  member: string;
  count: number;
  sampleTask: string | null;
  latestCompletedAt: DateTime | null;
  relatedUrls: string[];
};

export type DailyStatus = {
  userId: string;
  member: string;
  status: "submitted" | "missing";
  submittedAt?: DateTime;
  streak: number;
  permalink?: string;
};

export type DashboardData = {
  generatedAt: DateTime;
  timezone: string;
  weeklyMetrics: WeeklyMetrics;
  taskHighlights: TaskHighlight[];
  gmHighlights: GMHighlight[];
  dailyReportStatus: DailyStatus[];
  errors: string[];
  warnings: string[];
  notices: string[];
};

export async function loadDashboardData(): Promise<DashboardData> {
  const timezone = resolveTimezone();
  const now = DateTime.now().setZone(timezone);
  const errors: string[] = [];
  const warnings: string[] = [];
  const notices: string[] = [];

  const { config: slackConfig, missing: slackMissing } = resolveSlackConfig();
  if (slackMissing.length > 0) {
    errors.push(formatMissingEnv(slackMissing));
  }

  const { config: googleConfig, missing: googleMissing } = resolveGoogleConfig();
  if (googleMissing.length > 0) {
    errors.push(formatMissingEnv(googleMissing));
  }

  let slackReports: DailyReport[] = [];
  let gmHighlights: GMHighlight[] = [];
  let reportStatuses: DailyStatus[] = [];

  if (slackConfig) {
    try {
      const slackData = await fetchSlackDashboardData(slackConfig, timezone);
      slackReports = slackData.reports;
      gmHighlights = slackData.gmHighlights;
      warnings.push(...slackData.warnings);
      notices.push(...slackData.notices);
      reportStatuses = slackData.reportStatuses.map((status) => ({
        userId: status.userId,
        member: status.userName,
        status: status.status,
        submittedAt: status.submittedAt,
        streak: status.streakDays
      }));

      const todaysReports = extractTodaysReports(slackReports, now);
      reportStatuses = reportStatuses.map((status) => ({
        ...status,
        permalink: status.status === "submitted" ? todaysReports.get(status.userId)?.permalink : undefined
      }));
    } catch (error) {
      errors.push(`Slack連携でエラーが発生しました: ${(error as Error).message}`);
    }
  } else {
    warnings.push("Slack の環境変数が不足しているため、Daily Report の取得をスキップしました。");
  }

  let sheetTasks: SheetTask[] = [];
  if (googleConfig) {
    try {
      sheetTasks = await fetchSheetTasks(googleConfig, timezone);
      if (sheetTasks.length === 0) {
        notices.push("Google Sheets からタスクデータが取得できませんでした。SHEET_ID とシート範囲を確認してください。");
      }
    } catch (error) {
      errors.push(`Google Sheets 連携でエラーが発生しました: ${(error as Error).message}`);
    }
  } else {
    warnings.push("Google Sheets の環境変数が不足しているため、タスク読み込みをスキップしました。");
  }

  const weeklyInterval = Interval.fromDateTimes(now.minus({ days: 6 }).startOf("day"), now.endOf("day"));
  const completedTasks = sheetTasks.filter((task) => taskIsCompleted(task) && isTaskWithinInterval(task, weeklyInterval));

  const weeklyMetrics: WeeklyMetrics = {
    start: weeklyInterval.start ?? now.startOf("day"),
    end: weeklyInterval.end ?? now.endOf("day"),
    tasksCompleted: completedTasks.length,
    reportsSubmitted: reportStatuses.filter((status) => status.status === "submitted").length,
    membersTotal: reportStatuses.length,
    topProject: determineTopProject(completedTasks),
    nextFocus: determineNextFocus(gmHighlights, slackReports)
  };

  const taskHighlights = buildTaskHighlights(completedTasks);

  return {
    generatedAt: now,
    timezone,
    weeklyMetrics,
    taskHighlights,
    gmHighlights,
    dailyReportStatus: reportStatuses,
    errors,
    warnings,
    notices
  };
}

function taskIsCompleted(task: SheetTask): boolean {
  const status = task.status?.trim();
  if (!status) {
    return Boolean(task.endDate);
  }

  const normalized = status.replace(/\s/g, "").toLowerCase();
  const completionKeywords = ["完了", "done", "complete", "completed", "finished", "終了", "closed", "achieved", "済", "済み"];
  if (completionKeywords.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  return Boolean(task.endDate);
}

function isTaskWithinInterval(task: SheetTask, interval: Interval): boolean {
  const reference = task.endDate || task.dueDate || task.startDate;
  if (!reference || !interval.isValid) {
    return false;
  }
  return interval.contains(reference);
}

function determineTopProject(tasks: SheetTask[]): string | null {
  if (tasks.length === 0) {
    return null;
  }

  const projectCounts = new Map<string, number>();
  tasks.forEach((task) => {
    const project = task.project?.trim();
    if (!project) {
      return;
    }
    const current = projectCounts.get(project) ?? 0;
    projectCounts.set(project, current + 1);
  });

  const sorted = Array.from(projectCounts.entries()).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

function determineNextFocus(highlights: GMHighlight[], reports: DailyReport[]): string | null {
  const nextHighlight = highlights.find((highlight) => highlight.type === "Next");
  if (nextHighlight) {
    return `${nextHighlight.member}: ${nextHighlight.snippet}`;
  }

  for (const report of reports) {
    const nextItem = report.sections.next?.[0];
    if (nextItem) {
      return `${report.userName}: ${nextItem}`;
    }
  }

  return null;
}

function buildTaskHighlights(completedTasks: SheetTask[]): TaskHighlight[] {
  const groups = new Map<string, SheetTask[]>();

  completedTasks.forEach((task) => {
    const project = task.project?.trim() || "不明プロジェクト";
    const assignee = task.assignee?.trim() || "担当未設定";
    const key = `${project}__${assignee}`;
    const tasks = groups.get(key) ?? [];
    tasks.push(task);
    groups.set(key, tasks);
  });

  const highlights = Array.from(groups.entries())
    .map(([key, tasks]) => {
      const [project, member] = key.split("__");
      tasks.sort((a, b) => {
        const aTime = (a.endDate || a.dueDate || DateTime.fromMillis(0)).toMillis();
        const bTime = (b.endDate || b.dueDate || DateTime.fromMillis(0)).toMillis();
        return bTime - aTime;
      });
      const sampleTask = tasks[0]?.title || null;
      const latestCompletedAt = tasks[0]?.endDate || tasks[0]?.dueDate || null;
      const relatedUrls = tasks
        .map((task) => task.url?.trim())
        .filter((url): url is string => Boolean(url));

      return {
        project,
        member,
        count: tasks.length,
        sampleTask,
        latestCompletedAt,
        relatedUrls
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return highlights;
}

function extractTodaysReports(reports: DailyReport[], reference: DateTime): Map<string, DailyReport> {
  const todayStart = reference.startOf("day");
  const todayEnd = reference.endOf("day");
  const interval = Interval.fromDateTimes(todayStart, todayEnd);
  const map = new Map<string, DailyReport>();

  reports.forEach((report) => {
    if (interval.contains(report.submittedAt)) {
      map.set(report.userId, report);
    }
  });

  return map;
}
