import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polycle Member Dashboard",
  description:
    "Polycle社内メンバーポータル。Daily Reportとタスクのハイライトを一望。",
  icons: [{ rel: "icon", url: "/favicon.ico" }]
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
