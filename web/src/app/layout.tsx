import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "골프싱크 (Golf-Sync)",
  description:
    "레슨 예약부터 영상 피드백, 유료 원포인트까지 한 번에 - 골프 프로 전용 CRM & 레슨 자산화 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-emerald-50/40 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
