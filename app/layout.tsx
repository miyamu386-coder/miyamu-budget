import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "miyamu budget",
  description: "家計簿・予算管理",
  manifest: "/manifest.webmanifest",
  themeColor: "#ffffff",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "miyamu budget",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}