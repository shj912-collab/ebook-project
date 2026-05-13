import { LessonVideoGateClient } from "./LessonVideoGateClient";

export default async function LessonVideoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded = decodeURIComponent(token ?? "").trim();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="card space-y-2">
        <h1 className="text-lg font-semibold text-emerald-800">레슨 영상</h1>
        <p className="text-xs text-slate-600">
          프로가 공유한 링크입니다. QR로 들어온 경우에도 아래 번호 입력이 필요합니다.
        </p>
      </div>
      <div className="card mt-4">
        {!decoded ? (
          <p className="text-sm text-rose-600">잘못된 링크입니다.</p>
        ) : (
          <LessonVideoGateClient token={decoded} />
        )}
      </div>
    </main>
  );
}
