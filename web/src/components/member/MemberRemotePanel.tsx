"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, LessonLog, RemoteRequest } from "@/lib/types";
import { formatDateTime, formatKRW } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";
import { splitFeedbackCommentsForDisplay } from "@/lib/feedbackCommentSections";
import { getPublicLessonVideoPageUrl } from "@/lib/lessonVideoPublic";
import { VideoQrBlock } from "@/components/lesson/VideoQrBlock";
import { MemberSwingVideoRequestForm } from "./MemberSwingVideoRequestForm";

type Props = { user: AppUser };

type ProOption = { id: string; name: string | null; email: string };

export function MemberRemotePanel({ user }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [requests, setRequests] = useState<RemoteRequest[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, LessonLog>>({});
  const [proMap, setProMap] = useState<Record<string, ProOption>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const proList = await supabase.from("users").select("id, name, email").eq("role", "PRO");
      if (proList.error) throw proList.error;

      const myReq = await supabase
        .from("remote_requests")
        .select("*")
        .eq("member_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (myReq.error) throw myReq.error;

      const proListData = (proList.data as ProOption[]) ?? [];
      const reqs = (myReq.data as RemoteRequest[]) ?? [];
      setRequests(reqs);

      const proIds = Array.from(new Set(reqs.map((r) => r.pro_id)));
      const proLookup: Record<string, ProOption> = {};
      for (const p of proListData) proLookup[p.id] = p;
      const missing = proIds.filter((id) => !proLookup[id]);
      if (missing.length > 0) {
        const { data: extra, error: e } = await supabase.from("users").select("id, name, email").in("id", missing);
        if (e) throw e;
        for (const u of (extra as ProOption[]) ?? []) proLookup[u.id] = u;
      }
      setProMap(proLookup);

      const feedbackIds = reqs.map((r) => r.feedback_id).filter((v): v is string => Boolean(v));
      if (feedbackIds.length > 0) {
        const { data: logs, error: lErr } = await supabase.from("lesson_logs").select("*").in("id", feedbackIds);
        if (lErr) throw lErr;
        const fb: Record<string, LessonLog> = {};
        for (const l of (logs as LessonLog[]) ?? []) fb[l.id] = l;
        setFeedbackMap(fb);
      } else {
        setFeedbackMap({});
      }
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-4">
      <MemberSwingVideoRequestForm
        user={user}
        heading="원포인트 레슨 요청"
        description="프로에게 스윙 영상과 메모를 보냅니다. 파일을 업로드하거나 URL을 입력할 수 있습니다. 프로가 설정한 플랜 A/B(시간·금액) 중 선택합니다. (MVP: 결제 모의 처리)"
        onSubmitted={() => void reload()}
      />

      <section className="card">
        <h3 className="text-sm font-semibold">내 원포인트 요청</h3>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
        ) : requests.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">아직 요청이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {requests.map((r) => {
              const pro = proMap[r.pro_id];
              const fb = r.feedback_id ? feedbackMap[r.feedback_id] : null;
              const tierLabel =
                r.lesson_minutes_quoted != null
                  ? `${r.lesson_minutes_quoted}분`
                  : r.pricing_tier === "60m"
                    ? "플랜 B"
                    : "플랜 A";
              const amt = r.amount_quoted != null ? formatKRW(r.amount_quoted) : "—";
              return (
                <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{formatDateTime(r.created_at)}</span>
                    <span>프로: {pro ? pro.name ?? pro.email : r.pro_id.slice(0, 8)}</span>
                    <span>
                      {tierLabel} · {amt}
                    </span>
                    <span className={paymentBadge(r.payment_status)}>{r.payment_status}</span>
                    <span className={r.feedback_id ? "badge-emerald" : "badge-amber"}>
                      {r.feedback_id ? "응답완료" : "대기중"}
                    </span>
                  </div>
                  {r.video_url ? (
                    <a
                      href={r.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-emerald-700 underline"
                    >
                      보낸 스윙 영상 열기
                    </a>
                  ) : null}
                  {r.request_note ? <p className="mt-2 text-sm text-slate-800">요청: {r.request_note}</p> : null}
                  {fb ? (
                    <div className="mt-3 rounded-md bg-emerald-50 p-2 text-sm text-slate-800">
                      <div className="text-xs font-semibold text-emerald-700">프로 코멘트</div>
                      <div className="mt-2 space-y-2">
                        {splitFeedbackCommentsForDisplay(fb.feedback_text).map((block, i) => (
                          <div key={i} className="rounded-md border border-emerald-100 bg-white p-2">
                            <div className="text-[11px] font-semibold text-emerald-900">{block.heading}</div>
                            {block.body ? (
                              <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{block.body}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {fb.video_url ? (
                        <div className="mt-2 rounded-md border border-emerald-100 bg-white p-2">
                          <p className="text-[10px] font-medium text-slate-700">응답 영상</p>
                          <a
                            href={fb.video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-xs text-emerald-700 underline"
                          >
                            원본 링크
                          </a>
                          {fb.video_access_token ? (
                            <div className="mt-2 flex flex-wrap items-start gap-3">
                              <VideoQrBlock url={getPublicLessonVideoPageUrl(fb.video_access_token)} size={140} />
                              <p className="max-w-[11rem] break-all font-mono text-[10px] text-slate-500">
                                {getPublicLessonVideoPageUrl(fb.video_access_token)}
                              </p>
                            </div>
                          ) : null}
                          <p className="mt-1 text-[10px] text-slate-500">QR 페이지 비밀번호: 내 프로필 연락처 끝 4자리</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function paymentBadge(s: RemoteRequest["payment_status"]) {
  if (s === "PAID") return "badge-emerald";
  if (s === "PENDING") return "badge-amber";
  if (s === "REFUNDED") return "badge-slate";
  return "badge-rose";
}
