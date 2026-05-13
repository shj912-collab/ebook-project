import Link from "next/link";

type SearchParams = {
  code?: string;
  message?: string;
  plan?: string;
};

export default function SubscriptionFailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <div className="card w-full">
        <p className="badge-rose">결제 인증 실패</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">정기결제 수단 등록에 실패했습니다</h1>
        <p className="mt-2 text-sm text-slate-600">카드 정보를 확인한 뒤 다시 등록해 주세요.</p>
        {searchParams.code ? (
          <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">
            오류 코드: {searchParams.code}
          </p>
        ) : null}
        {searchParams.message ? <p className="mt-2 text-xs text-slate-500">{searchParams.message}</p> : null}
        <Link href="/subscription" className="btn-secondary mt-6">
          구독 페이지로 돌아가기
        </Link>
      </div>
    </main>
  );
}
