import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "美容整形シミュレーション - AIによる施術プレビュー",
  description: "AIを使った美容整形シミュレーション。写真をアップロードして各施術の強度を調整し、理想の仕上がりをプレビューできます。",
  keywords: ["美容整形", "シミュレーション", "AI", "整形手術", "美容外科", "プレビュー", "施術"],
  authors: [{ name: "Seikei Sim" }],
  openGraph: {
    title: "美容整形シミュレーション",
    description: "AIによる美容整形シミュレーション - 理想の仕上がりをプレビュー",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "美容整形シミュレーション",
    description: "AIによる美容整形シミュレーション - 理想の仕上がりをプレビュー",
  },
  viewport: "width=device-width, initial-scale=1",
  robots: "index, follow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
