import Link from "next/link";

type SearchParams = {
  plan?: string;
  customerKey?: string;
  authKey?: string;
};

export default function SubscriptionSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const planLabel = (searchParams.plan ?? "basic").toUpperCase();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <div className="card w-full">
        <p className="badge-emerald">결제 인증 성공</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">정기결제 수단 등록이 완료되었습니다</h1>
        <p className="mt-2 text-sm text-slate-600">
          선택 플랜: <strong>{planLabel}</strong>
        </p>
        <p className="mt-4 text-sm text-slate-500">이제 매월 자동 청구를 위한 빌링키 발급이 가능한 상태입니다.</p>
        <p className="mt-2 text-xs text-slate-500">
          다음 단계: 서버에서 `authKey`를 빌링키로 전환하고 월간 스케줄러로 정기결제를 실행하세요.
        </p>
        <Link href="/subscription" className="btn-primary mt-6">
          구독 페이지로 돌아가기
        </Link>
      </div>
    </main>
  );
}
