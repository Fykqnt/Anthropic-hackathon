import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'

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
  robots: "index, follow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        <ClerkProvider>
          <header className="sticky top-0 z-50 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
              <Link href="/" className="group inline-flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center text-white text-lg shadow-sm">✨</div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-gray-900 tracking-wide group-hover:opacity-90 transition-opacity">美容整形シミュレーション</div>
                  <div className="text-[11px] text-gray-500 hidden sm:block">AI Beauty Simulation</div>
                </div>
              </Link>
              <div className="flex items-center gap-2 sm:gap-3">
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="px-4 py-2 text-sm rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition">ログイン</button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="px-4 py-2 text-sm rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md hover:shadow-lg transition">新規登録</button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn>
                  <UserButton afterSignOutUrl="/" />
                </SignedIn>
              </div>
            </div>
            <div className="h-[1.5px] bg-gradient-to-r from-transparent via-pink-400/50 to-transparent" />
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
