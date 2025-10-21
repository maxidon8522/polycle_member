import styles from "./page.module.css";

const weeklyMetrics = {
  weekRange: "2/19 - 2/25",
  tasksCompleted: 42,
  membersReporting: "16 / 18",
  topProject: "Palette",
  nextCheckIn: "本日 23:00 Slack DM"
};

const taskHighlights = [
  {
    project: "Palette",
    member: "山田 太郎",
    count: 6,
    focus: "Slack 連携 PoC",
    trend: "↑ 先週比 +2"
  },
  {
    project: "新規事業",
    member: "佐藤 花",
    count: 5,
    focus: "ユーザーインタビュー整理",
    trend: "→ 先週維持"
  },
  {
    project: "Palette",
    member: "呉 明華",
    count: 4,
    focus: "ダッシュボード KPI 設計",
    trend: "↑ 先週比 +1"
  }
];

const gmHighlights = [
  {
    type: "Good",
    emoji: "👍",
    member: "佐藤 花",
    snippet: "「顧客の声をまとめた Notion を即日共有してくれて助かった！」",
    reactions: 9,
    tag: "good"
  },
  {
    type: "More",
    emoji: "🧠",
    member: "呉 明華",
    snippet: "「スプリント初日にタスク分割を済ませておきたい」",
    reactions: 3,
    tag: "more"
  },
  {
    type: "Next",
    emoji: "📅",
    member: "山田 太郎",
    snippet: "「Slack DM の通知ワークフローを金曜までに固める」",
    reactions: 6,
    tag: "next"
  }
];

const dailyReportStatus = [
  { member: "山田 太郎", project: "Palette", status: "submitted", submittedAt: "24:10", streak: 12 },
  { member: "佐藤 花", project: "Palette", status: "submitted", submittedAt: "23:42", streak: 7 },
  { member: "呉 明華", project: "新規事業", status: "pending", submittedAt: "-", streak: 4 },
  { member: "田中 迅", project: "新規事業", status: "missing", submittedAt: "-", streak: 0 }
] as const;

const statusLabel: Record<(typeof dailyReportStatus)[number]["status"], string> = {
  submitted: "提出済み",
  pending: "下書き保存",
  missing: "未提出"
};

export default function HomePage() {
  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        <div className={styles.heroHeadline}>
          <span className={styles.heroBadge}>今週のダイジェスト</span>
          <h1>Polycle ダッシュボード</h1>
          <p>
            直近 7 日の完了タスク、Daily Report のハイライト、未提出者を
            ひと目でチェック。Slack と Sheets の最新状況をタピオカティーのようにまろやかに整理しました。
          </p>
        </div>
        <div className={styles.heroMetrics}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>完了タスク</span>
            <strong className={styles.metricValue}>{weeklyMetrics.tasksCompleted}</strong>
            <span className={styles.metricCaption}>{weeklyMetrics.weekRange}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Daily Report 提出</span>
            <strong className={styles.metricValue}>{weeklyMetrics.membersReporting}</strong>
            <span className={styles.metricCaption}>メンバー提出状況</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>注目プロジェクト</span>
            <strong className={styles.metricValue}>{weeklyMetrics.topProject}</strong>
            <span className={styles.metricCaption}>{weeklyMetrics.nextCheckIn}</span>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>直近 1 週間の完了タスク Top</h2>
          <button className={styles.secondaryButton}>タスク管理を見る</button>
        </div>
        <div className={styles.cardsGrid}>
          {taskHighlights.map((task) => (
            <article key={`${task.project}-${task.member}`} className={styles.infoCard}>
              <header className={styles.cardHeader}>
                <span className={styles.projectTag}>{task.project}</span>
                <span className={styles.trend}>{task.trend}</span>
              </header>
              <h3>{task.member}</h3>
              <p className={styles.cardFocus}>{task.focus}</p>
              <footer className={styles.cardFooter}>
                <span className={styles.cardCount}>
                  <strong>{task.count}</strong> 件
                </span>
                <span className={styles.cardLink}>詳しく見る →</span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>G / M / N ハイライト</h2>
          <button className={styles.secondaryButton}>Daily Report 一覧</button>
        </div>
        <div className={styles.highlightGrid}>
          {gmHighlights.map((highlight) => (
            <article key={`${highlight.type}-${highlight.member}`} className={`${styles.highlightCard} ${styles[highlight.tag]}`}>
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
                <span className={styles.cardLink}>Slack を開く →</span>
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
                <th>プロジェクト</th>
                <th>ステータス</th>
                <th>提出時刻</th>
                <th>連続提出日数</th>
              </tr>
            </thead>
            <tbody>
              {dailyReportStatus.map((row) => (
                <tr key={row.member}>
                  <td>{row.member}</td>
                  <td>{row.project}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[row.status]}`}>
                      {statusLabel[row.status]}
                    </span>
                  </td>
                  <td>{row.submittedAt}</td>
                  <td>{row.streak} 日</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
