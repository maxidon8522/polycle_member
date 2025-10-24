import { DateTime } from "luxon";
import { loadDashboardData } from "../lib/dashboard";
import styles from "./page.module.css";

const statusLabel: Record<"submitted" | "missing", string> = {
  submitted: "提出済み",
  missing: "未提出"
};

function formatWeekRange(start: DateTime, end: DateTime, timezone: string) {
  const startLabel = start.setZone(timezone).toFormat("M/d");
  const endLabel = end.setZone(timezone).toFormat("M/d");
  return `${startLabel} - ${endLabel}`;
}

function formatDateTime(value: DateTime | null | undefined, timezone: string) {
  if (!value) {
    return "-";
  }
  return value.setZone(timezone).toFormat("M/d HH:mm");
}

export default async function HomePage() {
  const data = await loadDashboardData();
  const { weeklyMetrics, taskHighlights, gmHighlights, dailyReportStatus, errors, warnings, notices, timezone } = data;

  const weekRange = formatWeekRange(weeklyMetrics.start, weeklyMetrics.end, timezone);
  const membersReporting =
    weeklyMetrics.membersTotal > 0 ? `${weeklyMetrics.reportsSubmitted} / ${weeklyMetrics.membersTotal}` : "-";
  const topProject = weeklyMetrics.topProject ?? "記録なし";
  const nextFocus = weeklyMetrics.nextFocus ?? "Slack の Next を確認してください";
  const primaryTaskLink = taskHighlights.find((task) => task.relatedUrls.length > 0)?.relatedUrls[0];

  return (
    <main className={styles.main}>
      {(errors.length > 0 || warnings.length > 0 || notices.length > 0) && (
        <div className={styles.alertStack}>
          {errors.map((error, index) => (
            <div key={`error-${index}`} className={`${styles.alert} ${styles.error}`}>
              {error}
            </div>
          ))}
          {warnings.map((warning, index) => (
            <div key={`warning-${index}`} className={`${styles.alert} ${styles.warning}`}>
              {warning}
            </div>
          ))}
          {notices.map((notice, index) => (
            <div key={`notice-${index}`} className={`${styles.alert} ${styles.notice}`}>
              {notice}
            </div>
          ))}
        </div>
      )}

      <header className={styles.hero}>
        <div className={styles.heroHeadline}>
          <span className={styles.heroBadge}>今週のダイジェスト</span>
          <h1>Polycle ダッシュボード</h1>
          <p>
            Slack と Google Sheets のデータを集約して、完了タスク・G/M/N ハイライト・Daily Report 提出状況をまとめて確認できます。
          </p>
        </div>
        <div className={styles.heroMetrics}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>完了タスク</span>
            <strong className={styles.metricValue}>{weeklyMetrics.tasksCompleted}</strong>
            <span className={styles.metricCaption}>{weekRange}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Daily Report 提出</span>
            <strong className={styles.metricValue}>{membersReporting}</strong>
            <span className={styles.metricCaption}>メンバー提出状況</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>注目プロジェクト</span>
            <strong className={styles.metricValue}>{topProject}</strong>
            <span className={styles.metricCaption}>{nextFocus}</span>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>直近 1 週間の完了タスク Top</h2>
          {primaryTaskLink ? (
            <a className={styles.secondaryButton} href={primaryTaskLink} target="_blank" rel="noreferrer">
              タスク管理を見る
            </a>
          ) : (
            <span className={`${styles.secondaryButton} ${styles.secondaryButtonDisabled}`}>リンク未設定</span>
          )}
        </div>
        <div className={styles.cardsGrid}>
          {taskHighlights.length === 0 && <p className={styles.emptyMessage}>完了タスクがまだありません。</p>}
          {taskHighlights.map((task) => (
            <article key={`${task.project}-${task.member}`} className={styles.infoCard}>
              <header className={styles.cardHeader}>
                <span className={styles.projectTag}>{task.project}</span>
                <span className={styles.trend}>{formatDateTime(task.latestCompletedAt, timezone)}</span>
              </header>
              <h3>{task.member}</h3>
              <p className={styles.cardFocus}>{task.sampleTask ?? "最近完了したタスクをチェック"}</p>
              <footer className={styles.cardFooter}>
                <span className={styles.cardCount}>
                  <strong>{task.count}</strong> 件
                </span>
                {task.relatedUrls[0] ? (
                  <a className={styles.cardLink} href={task.relatedUrls[0]} target="_blank" rel="noreferrer">
                    シートを開く →
                  </a>
                ) : (
                  <span className={styles.cardLink}>シート情報未設定</span>
                )}
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>G / M / N ハイライト</h2>
          <a className={styles.secondaryButton} href="https://slack.com/app_redirect" target="_blank" rel="noreferrer">
            Slack を開く
          </a>
        </div>
        <div className={styles.highlightGrid}>
          {gmHighlights.length === 0 && <p className={styles.emptyMessage}>今週の G/M/N ハイライトはまだありません。</p>}
          {gmHighlights.map((highlight) => (
            <article key={`${highlight.type}-${highlight.member}`} className={`${styles.highlightCard} ${styles[highlight.type.toLowerCase()]}`}>
              <header className={styles.highlightHeader}>
                <span className={styles.highlightIcon}>{highlight.emoji}</span>
                <div>
                  <span className={styles.highlightType}>{highlight.type}</span>
                  <h3>{highlight.member}</h3>
                </div>
              </header>
              <p className={styles.highlightText}>{highlight.snippet}</p>
              <footer className={styles.highlightFooter}>
                <span>リアクション {highlight.reactions}</span>
                <a className={styles.cardLink} href={highlight.permalink} target="_blank" rel="noreferrer">
                  Slack を開く →
                </a>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>本日の Daily Report 提出状況</h2>
          <span className={styles.cutoffBadge}>締め時刻 25:00（翌 1:00）</span>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>メンバー</th>
                <th>ステータス</th>
                <th>提出時刻</th>
                <th>連続提出日数</th>
                <th>リンク</th>
              </tr>
            </thead>
            <tbody>
              {dailyReportStatus.length === 0 && (
                <tr>
                  <td colSpan={5}>Slack から Daily Report が取得できませんでした。</td>
                </tr>
              )}
              {dailyReportStatus.map((row) => (
                <tr key={row.userId}>
                  <td>{row.member}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[row.status]}`}>
                      {statusLabel[row.status]}
                    </span>
                  </td>
                  <td>{formatDateTime(row.submittedAt ?? null, timezone)}</td>
                  <td>{row.streak} 日</td>
                  <td>
                    {row.permalink ? (
                      <a className={styles.cardLink} href={row.permalink} target="_blank" rel="noreferrer">
                        投稿を見る →
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
