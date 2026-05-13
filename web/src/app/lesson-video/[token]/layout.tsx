import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "레슨 영상 보기 · 골프싱크",
  robots: { index: false, follow: false },
};

export default function LessonVideoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
