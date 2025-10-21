# Polycle Member Web

ホームダッシュボードの初期実装です。Next.js (App Router) を利用し、タピオカミルクティーをテーマにした UI を整えています。

## セットアップ

```bash
cd web
npm install
npm run dev
```

`http://localhost:3000` で UI を確認できます。

## 現状の仮データ

* 直近 1 週間の完了タスク TOP 3
* G / M / N ハイライト
* 本日の Daily Report 提出状況

今後は Slack / Google Sheets から取得した実データをこのページに流し込む想定です。

## 次のステップ例

1. Slack / Sheets 連携の API スタブを用意し、UI へフェッチできるようにする
2. タスク・Daily Report 詳細ページ（`/tasks` `/reports`）のルーティングを追加
3. UI コンポーネントを整理して再利用しやすいディレクトリ構造へ移行する
