import { AuthGate } from "@/components/AuthGate";
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-emerald-700">
            <span className="rounded-md bg-emerald-600 px-2 py-1 text-sm font-bold text-white">GS</span>
            골프싱크
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            레슨 예약 · 영상 피드백 · 유료 원포인트까지 - 골프 프로 전용 CRM
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/lesson-records" className="btn-secondary">
            레슨 조회
          </Link>
          <Link href="/subscription" className="btn-secondary">
            구독 플랜 보기
          </Link>
        </div>
      </header>
      <AuthGate />
    </main>
  );
}
