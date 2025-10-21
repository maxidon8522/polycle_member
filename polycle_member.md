# 1. 背景 / 目的

* **現状**：Daily Report は Slack（例：#00_dailyreport）、タスク管理は Google スプレッドシートで運用。
* **課題**：情報が分散し、「Good / More / Next（以下 G/M/N）」の蓄積や、今週の完了タスク、各メンバーの成長が俯瞰しづらい。
* **目的**：Slack とスプレッドシートを**継続利用**しつつ、1つの社内Webから集約表示・検索・通知を実現する。

# 2. 対象 / 前提

* 利用者：社内メンバー（最大20名）
* 前提：Google Workspace（SSO）、Slack ワークスペース、既存スプレッドシートを継続使用
* フェーズ：①Web(MVP) → ②iOS（Web機能のモバイル化 + Push）

# 3. 用語

* **Daily Report**：その日やったこと / 完了タスク / Good / More / Next の報告
* **G/M/N**：Good（良かったこと）、More（もっとできたこと）、Next（次やること）

# 4. スコープ（MVP）

* 4.1 集約ダッシュボード（ホーム）

  * 直近1週間の完了タスク一覧（人別 / PJ別）
  * G/M/N ハイライト（人別集計、いいね数等の指標があれば取得）
  * 本日のDaily Report投稿状況（未提出者検出）
* 4.2 タスク管理ビュー

  * 既存スプレッドシートへリンク
  * 進行中 / 未完了の抽出表示（担当者・期限・PJでフィルタ）
  * 未完了タスクの**通知**（条件：期限超過、期限◯日前）
* 4.3 デイリーレポートビュー

  * 日付・人・PJで検索
  * 「その日やったこと / 完了タスク / Good / More / Next」を一覧・詳細表示
  * 元の Slack メッセージ / スレッドへリンク
* 4.4 連携

  * Slack：特定チャンネル（例：#00_dailyreport）から Daily Report を取込
  * Google Sheets：タスク表（指定シート）を読み込み、進行中/未完了抽出
* 4.5 権限

  * ロール：Admin / Member（閲覧は全員、設定変更は Admin）

# 5. 非スコープ（MVP）

* タスクの**編集**機能（初期は Spreadsheet 側で継続運用）
* Slack への**投稿**代行（初期はリードオンリー/リンクバック）

# 6. システム構成（提案）

**Option A（推奨 / 実装容易×小規模）**

* フロント：Next.js（React）
* 認証：Google OAuth（Workspace SSO）
* BFF/API：Next.js API Routes or Cloud Functions
* DB/キャッシュ：Firestore or Supabase(Postgres) ※Slack/Sheetの取り込み結果を保持
* 連携：Slack Web API / Events API、Google Sheets API
* ホスティング：Vercel / Firebase Hosting

**Option B（サーバレス最小）**

* GAS(Apps Script) をハブに：Slack→GAS→シート整形→Webは閲覧用のみ

**決定観点**：実装速度、運用の楽さ、将来のiOS拡張（APIの再利用性）

# 7. データモデル（概略）

```
User { id, name, email, slackUserId, role }
DailyReport { id, date, userId, channelId, messageTs, done[], good[], more[], next[], tasksCompleted[], rawText, links[] }
Task { id, sheetRowId, project, title, assigneeUserId, status, dueDate, startDate, url, notes }
MetricWeekly { weekStart, userId, tasksCompletedCount, goodCount, nextCount, streakDays }
Notification { id, type, userId, taskId?, reportId?, status, sentAt }
```

# 8. 主要機能要件

## 8.1 ホーム（ダッシュボード）

* [必須] 直近7日：完了タスク Top、G/M/N ハイライト
* [必須] 未提出者リスト（当日 Daily Report 未検知）
* [任意] Good のキーワードクラウド（将来）

## 8.2 タスク管理

* [必須] 進行中 / 未完了を一覧（フィルタ：担当者、期限、PJ、ステータス）
* [必須] 行クリックで元スプレッドシート該当行へ遷移
* [必須] 通知条件

  * 期限超過：毎朝 9:00 通知
  * 期限◯日前：前日 18:00 通知（◯は設定値、初期=2日）
* [任意] 「今週完了」セクションの自動抽出

## 8.3 デイリーレポート

* [必須] 一覧：日付/人/PJ/キーワード検索
* [必須] 詳細：Done / Good / More / Next / 完了タスク を構造化表示
* [必須] 元Slack投稿へのディープリンク
* [任意] 「今週のGoodベスト」などランキング

# 9. 連携要件

## 9.1 Slack 取込

* 対象チャンネル：例）#00_dailyreport
* 方式：

  1. **Pull**：バックグラウンドで chat.history を定期取得
  2. **Push**：Events API（message.channels）でWebhook受信
* 解析：投稿テンプレから `Done / Good / More / Next` を正規表現で抽出
* 同期頻度：Pull=5〜10分間隔 / Push=即時
* 冪等性：message `channel + ts` をキーに UPSERT

## 9.2 Google Sheets 取込

* 対象：タスク管理シート（シート名 / カラム定義を設定画面で登録）
* 読込：Sheets API（範囲指定、ヘッダ行マッピング）
* 抽出条件：`ステータス in {進行中, 未着手, 未完了}` 等を設定化
* 冪等性：`シートの行ID or URL` をキーに UPSERT

# 10. 画面一覧 & 要件

* **/login**：Google SSO 認証
* **/**（ホーム）：KPIカード（今週完了数、提出率、Good件数）、未提出者、G/M/Nハイライト
* **/tasks**：フィルタ、テーブル、詳細パネル、元Sheetリンク
* **/reports**：日付/人/PJ検索、カード/リスト表示、詳細モーダル
* **/settings**（Admin）：Slack/Sheets 認証、対象チャンネル/シート設定、通知閾値

# 11. 非機能要件

* 性能：同時ユーザ < 20、初回ロード < 2.5s、一覧応答 < 1.5s（キャッシュ前提）
* 可用性：平日日中 99.9%
* セキュリティ：Google SSO、RBAC、監査ログ（閲覧/設定変更）
* 監視：エラーログ（Sentry等）、取込失敗検知と再試行
* バックアップ：Firestore/Supabase の自動バックアップ、設定エクスポート

# 12. 通知設計

* 媒体：Slack DM（Bot）またはメール（Google Workspace）
* 種別：未提出リマインド、期限超過、期限◯日前
* サイクル：毎朝 9:00（未提出/期限）、毎日18:00（翌日期限）
* 抑制：既読/完了でキャンセル、土日祝スキップ設定

# 13. セキュリティ / 権限

* ログイン：Google SSO のみ（ドメイン制限）
* ロール：Admin（設定/再同期/通知設定）/ Member（閲覧）
* データ保護：Slack/Google のアクセストークンはKMSで暗号化保管

# 14. 受け入れ基準（MVP）

1. ホームに直近7日の完了タスク集計が表示される
2. レポート一覧で G/M/N が正しく抽出される
3. タスク一覧がスプレッドシートの状態と一致する
4. 未提出者/期限超過の通知が設定時刻に届く
5. すべての行から元リソース（Slack/Sheet）へ遷移できる

# 15. マイルストーン（案）

* W1：要件FIX / 設計
* W2：Slack / Sheets 取込 PoC、正規表現抽出
* W3：画面実装（/ /tasks /reports）
* W4：通知 / 設定 / 権限
* W5：社内トライアル → 調整 → リリース

# 16. リスクと対策

* 投稿フォーマットの揺れ → テンプレ提示＋柔軟な抽出ルール（正規表現/見出し記号）
* Sheets列構成の変更 → 設定画面で列マッピング＆検証
* APIレート制限 → 取込キャッシュ / バッチ化 / 差分同期

# 17. 将来拡張（iOS）

* 認証：同じ Google SSO（Auth via Web）
* 機能：閲覧＋通知受信（Push）
* オフライン：最近1週間のキャッシュ

---

# 付録A：抽出ルール（例）

* セクション記号例：

  * `Done`/`Good`/`More`/`Next` 行頭キーワード or 絵文字（:Done: など）
  * 正規表現例：

    * `(?s)Done\s*[:：\n](.*?)(?=\n\s*(Good|More|Next)[:：]|$)`（他同様）

# 付録B：環境変数（例）

* SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
* GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
* SHEET_ID, SHEET_RANGE

# 付録C：権限（外部API）

* Slack：channels:history, chat:write (通知時), users:read.basic
* Google：Sheets API（readonly）、OAuth（Workspace 制限）

# 未確定事項（要回答）

1. Daily Report の**投稿テンプレ**は固定？（見出し語や絵文字のルール）
2. G/M/N 以外のセクション（例：Blocker、Thanks）はある？
3. タスク表の**カラム構成**（列名・値域・ステータス定義）
4. 「完了タスク」の判定条件（ステータス=完了／完了日列？）
5. 未提出の〆時刻（何時で当日締め？ 例：23:59）
6. 通知は Slack DM / チャンネル / メールのどれを使う？優先順位は？
7. 祝日カレンダー（台湾/日本）を反映する？
8. プロジェクトの識別（PJ名の正規化ルールあり？）
9. MVP リリースの目標時期
10. iOS の最小機能（閲覧のみ / 投稿も？）

---

## Addendum v0.2（ユーザー回答反映）

### 決定事項

* **ステータス値（正式）**：未着手 / 進行中 / 保留 / 完了 / 中止
* **完了判定**：ステータス=完了 **または** 終了日に値がある
* **締め時刻（当日境界）**：25:00（翌日1:00）
* **通知媒体**：Slack DM 優先（将来チャンネル/メール切替はオプション）
* **祝日スキップ**：ON（台湾カレンダー）
* **PJ名の正規化**：Palette / 新規事業
* **MVP優先度**：①閲覧 → ②通知 → ③検索
* **Slack投稿テンプレ**：下記テンプレを採用（絵文字で分割）

#### 投稿テンプレ（Slack）

```
🧾 Done:
- ...

👍 Good:
- ...

🧠 More:
- ...

📅 Next:
- ...
```

（同義語許容：Done=🧾/✅、Good=👍/✨、More=🧠/🛠️、Next=📅/➡️）

### 仕様補足（該当セクションの上書きルール）

* **9.1 Slack 取込**：絵文字見出しベースで `Done/Good/More/Next` を抽出。#00_dailyreport のみ対象。
* **9.2 Google Sheets 取込**：対象カラム＝PJ名/タスク名/担当者/ステータス/期限/開始日/終了日/詳細URL/備考。抽出は「未着手/進行中/保留」を未完了とする。
* **12. 通知設計**：25:00 を当日の締め境界として未提出判定。Daily Report リマインドは 23:00 / 24:30 / 25:00。期限通知は前日18:00・超過翌朝9:00。祝日（台湾）は既定でスキップ（設定で変更可）。

### 開発プロセス（GitHub利用方針）

* **リポジトリ**：mono-repo（`/web` `/functions` `/infra`）を推奨。将来 iOS（`/ios`）を追加。
* **ブランチ戦略**：`main`（保護） / `dev`（統合） / `feature/*`。PR 必須、レビュー1名以上。
* **CI/CD**：

  * Web：Vercel 連携（Preview=PR、Production=main）。
  * Functions：Cloud Functions/Firebase or Supabase Edge Functions を GitHub Actions でデプロイ。
* **シークレット管理**：GitHub Secrets に `SLACK_BOT_TOKEN` `SLACK_SIGNING_SECRET` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `SHEET_ID` などを保存。ローカルは `.env.local` を使用。
* **Issue運用**：`type:feat/bug/chore` と `area:web/api/ingestion/ios` ラベル。Milestone を W1〜W5 に対応させる。
* **コード規約**：TypeScript / ESLint / Prettier / Husky + lint-staged を適用。

### 初回セットアップTODO（W1）

1. Slack App 作成（Bot トークン・イベント権限・インストール）
2. Google Cloud プロジェクト作成（OAuth同意・Sheets API有効化）
3. 対象スプレッドシートの共有（閲覧権限サービスアカウント付与）
4. Vercel or Firebase プロジェクト作成（ドメイン/環境変数設定）
5. GitHub リポジトリ作成（ブランチ保護・Secrets登録）
