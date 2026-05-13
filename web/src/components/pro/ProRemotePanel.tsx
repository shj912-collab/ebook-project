"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, RemoteRequest, ProProfile } from "@/lib/types";
import { formatDateTime, formatKRW } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";
import { newVideoAccessToken } from "@/lib/lessonVideoPublic";

type Props = { user: AppUser };

export function ProRemotePanel({ user }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [profile, setProfile] = useState<ProProfile | null>(null);
  const [requests, setRequests] = useState<RemoteRequest[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, { name: string | null; email: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const [priceDraft30, setPriceDraft30] = useState<number>(30000);
  const [priceDraft60, setPriceDraft60] = useState<number>(60000);
  const [draftPlanAMin, setDraftPlanAMin] = useState(30);
  const [draftPlanBMin, setDraftPlanBMin] = useState(60);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pp, rq] = await Promise.all([
        supabase.from("pro_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("remote_requests")
          .select("*")
          .eq("pro_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (pp.error) throw pp.error;
      if (rq.error) throw rq.error;
      const p = (pp.data as ProProfile | null) ?? null;
      setProfile(p);
      if (p) {
        const p30 = p.remote_price_30m ?? p.remote_price ?? 30000;
        const p60 = p.remote_price_60m ?? Math.max((p.remote_price ?? p30) * 2, p30 + 10000);
        setPriceDraft30(p30);
        setPriceDraft60(p60);
        setDraftPlanAMin(p.remote_plan_a_minutes ?? 30);
        setDraftPlanBMin(p.remote_plan_b_minutes ?? 60);
      }
      const reqs = (rq.data as RemoteRequest[]) ?? [];
      setRequests(reqs);

      const memberIds = Array.from(new Set(reqs.map((r) => r.member_id)));
      if (memberIds.length > 0) {
        const { data, error: e } = await supabase.from("users").select("id, name, email").in("id", memberIds);
        if (e) throw e;
        const map: Record<string, { name: string | null; email: string }> = {};
        for (const u of (data as { id: string; name: string | null; email: string }[]) ?? []) {
          map[u.id] = { name: u.name, email: u.email };
        }
        setMemberMap(map);
      } else {
        setMemberMap({});
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

  const updatePrice = async () => {
    setBusy(true);
    setError(null);
    try {
      const p30 = Math.max(0, priceDraft30);
      const p60 = Math.max(0, priceDraft60);
      const aMin = Math.min(180, Math.max(10, Math.round(draftPlanAMin)));
      const bMin = Math.min(180, Math.max(10, Math.round(draftPlanBMin)));
      const { error: e } = await supabase.from("pro_profiles").upsert(
        {
          user_id: user.id,
          remote_price_30m: p30,
          remote_price_60m: p60,
          remote_price: p30,
          remote_plan_a_minutes: aMin,
          remote_plan_b_minutes: bMin,
          response_sla_hours: profile?.response_sla_hours ?? 48,
          bio: profile?.bio ?? null,
          booking_start_step_minutes: profile?.booking_start_step_minutes ?? 20,
          booking_lesson_duration_minutes: profile?.booking_lesson_duration_minutes ?? 60,
        },
        { onConflict: "user_id" },
      );
      if (e) throw e;
      await reload();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitFeedback = async (req: RemoteRequest) => {
    setBusy(true);
    setError(null);
    try {
      if (!feedback.trim()) throw new Error("피드백 텍스트를 입력하세요.");
      const videoAccessToken = videoUrl.trim() ? newVideoAccessToken() : null;
      const { data: log, error: lErr } = await supabase
        .from("lesson_logs")
        .insert({
          pro_id: user.id,
          member_id: req.member_id,
          schedule_id: null,
          source_kind: "remote",
          remote_request_id: req.id,
          feedback_text: feedback.trim(),
          video_url: videoUrl.trim() || null,
          video_access_token: videoAccessToken,
        })
        .select("*")
        .single();
      if (lErr) throw lErr;

      const { error: rErr } = await supabase
        .from("remote_requests")
        .update({
          feedback_id: log.id,
          responded_at: new Date().toISOString(),
        })
        .eq("id", req.id);
      if (rErr) throw rErr;

      await supabase.from("notifications").insert({
        user_id: req.member_id,
        type: "REMOTE_FEEDBACK_READY",
        payload: { request_id: req.id },
      });

      setFeedback("");
      setVideoUrl("");
      setActiveId(null);
      await reload();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card">
        <h3 className="text-sm font-semibold">원포인트 레슨 · 시간·금액 설정</h3>
        <p className="mt-1 text-xs text-slate-500">
          플랜 A·B의 <strong>레슨 시간(분)</strong>과 <strong>금액</strong>을 직접 정합니다. 회원은 두 플랜 중 하나를
          고릅니다. (결제 모의 처리; 포트원 연동은 P1)
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="plan-a-min">
              플랜 A · 시간 (분)
            </label>
            <input
              id="plan-a-min"
              className="input"
              type="number"
              min={10}
              max={180}
              value={draftPlanAMin}
              onChange={(e) => setDraftPlanAMin(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="price-a">
              플랜 A · 금액 (원)
            </label>
            <input
              id="price-a"
              className="input"
              type="number"
              min={0}
              step={1000}
              value={priceDraft30}
              onChange={(e) => setPriceDraft30(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="plan-b-min">
              플랜 B · 시간 (분)
            </label>
            <input
              id="plan-b-min"
              className="input"
              type="number"
              min={10}
              max={180}
              value={draftPlanBMin}
              onChange={(e) => setDraftPlanBMin(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="price-b">
              플랜 B · 금액 (원)
            </label>
            <input
              id="price-b"
              className="input"
              type="number"
              min={0}
              step={1000}
              value={priceDraft60}
              onChange={(e) => setPriceDraft60(Number(e.target.value))}
            />
          </div>
        </div>
        <button type="button" className="btn-primary mt-3" disabled={busy} onClick={() => void updatePrice()}>
          저장
        </button>
        {profile ? (
          <p className="mt-2 text-xs text-slate-500">
            적용 중: 플랜 A {profile.remote_plan_a_minutes ?? 30}분 {formatKRW(profile.remote_price_30m ?? profile.remote_price)} · 플랜 B{" "}
            {profile.remote_plan_b_minutes ?? 60}분 {formatKRW(profile.remote_price_60m ?? profile.remote_price * 2)}
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">레슨 요약</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              원포인트 요청을 한눈에 보고 짧게 답할 수 있습니다. 상세 영상·음성·공통 메모는「레슨 코멘트」탭의 원포인트
              대상에서 작성하세요.
            </p>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={() => void reload()}>
            새로고침
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
        ) : requests.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">아직 요청이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {requests.map((r) => {
              const member = memberMap[r.member_id];
              const responded = Boolean(r.feedback_id);
              const minShown =
                r.lesson_minutes_quoted ??
                (r.pricing_tier === "60m"
                  ? profile?.remote_plan_b_minutes ?? draftPlanBMin
                  : profile?.remote_plan_a_minutes ?? draftPlanAMin);
              const amountLine =
                r.amount_quoted != null ? `${minShown}분 · ${formatKRW(r.amount_quoted)}` : "—";
              return (
                <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{formatDateTime(r.created_at)}</span>
                    <span>회원: {member ? member.name ?? member.email : "(알수없음)"}</span>
                    <span>{amountLine}</span>
                    <span className={paymentBadge(r.payment_status)}>{r.payment_status}</span>
                    {responded ? (
                      <span className="badge-emerald">응답완료</span>
                    ) : (
                      <span className="badge-amber">미응답</span>
                    )}
                  </div>
                  {r.request_note ? <p className="mt-2 whitespace-pre-line text-sm text-slate-800">{r.request_note}</p> : null}
                  {r.video_url ? (
                    <a href={r.video_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-emerald-700 underline">
                      회원 영상 보기
                    </a>
                  ) : null}

                  {!responded && r.payment_status === "PAID" ? (
                    activeId === r.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          className="input min-h-24"
                          placeholder="피드백 내용을 입력하세요"
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                        />
                        <input
                          className="input"
                          placeholder="응답 영상 URL (선택)"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary" disabled={busy} onClick={() => void submitFeedback(r)}>
                            {busy ? "저장 중…" : "응답 보내기"}
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => setActiveId(null)}>
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary mt-3 text-xs"
                        onClick={() => {
                          setActiveId(r.id);
                          setFeedback("");
                          setVideoUrl("");
                        }}
                      >
                        피드백 작성
                      </button>
                    )
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
