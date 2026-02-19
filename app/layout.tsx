import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "みやむMaker",
  description: "家計簿・予算管理",
  manifest: "/manifest.webmanifest",

  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "みやむMaker",
  },
};

export const viewport = {
  themeColor: "#ffffff",
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