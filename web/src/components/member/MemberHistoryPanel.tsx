"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, LessonLog, RemoteRequest, Schedule } from "@/lib/types";
import { formatDateTime, formatKRW, formatTime24 } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";
import { splitFeedbackCommentsForDisplay } from "@/lib/feedbackCommentSections";
import { getPublicLessonVideoPageUrl } from "@/lib/lessonVideoPublic";
import { VideoQrBlock } from "@/components/lesson/VideoQrBlock";
import { MemberSwingVideoRequestForm } from "./MemberSwingVideoRequestForm";

type Props = { user: AppUser };

type LogWithSchedule = LessonLog & {
  schedules: { start_time: string; end_time: string } | null;
};

type HistoryItem =
  | { kind: "log"; key: string; displayAt: string; proId: string; log: LogWithSchedule }
  | { kind: "schedule_only"; key: string; displayAt: string; proId: string; schedule: Schedule }
  | { kind: "remote_pending"; key: string; displayAt: string; proId: string; request: RemoteRequest };

export function MemberHistoryPanel({ user }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [proMap, setProMap] = useState<Record<string, { name: string | null; email: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filterProId, setFilterProId] = useState<string>("all");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, schedulesRes, remotePendingRes] = await Promise.all([
        supabase
          .from("lesson_logs")
          .select("*, schedules ( start_time, end_time )")
          .eq("member_id", user.id)
          .order("created_at", { ascending: false })
          .limit(120),
        supabase
          .from("schedules")
          .select("*")
          .eq("member_id", user.id)
          .eq("status", "COMPLETED")
          .order("start_time", { ascending: false })
          .limit(120),
        supabase
          .from("remote_requests")
          .select("*")
          .eq("member_id", user.id)
          .is("feedback_id", null)
          .order("created_at", { ascending: false })
          .limit(80),
      ]);
      if (logsRes.error) throw logsRes.error;
      if (schedulesRes.error) throw schedulesRes.error;
      if (remotePendingRes.error) throw remotePendingRes.error;

      const logs = (logsRes.data as LogWithSchedule[]) ?? [];
      const completedSchedules = (schedulesRes.data as Schedule[]) ?? [];
      const pendingRemote = (remotePendingRes.data as RemoteRequest[]) ?? [];

      const scheduleIdsWithLog = new Set(
        logs.map((l) => l.schedule_id).filter((id): id is string => Boolean(id)),
      );

      const merged: HistoryItem[] = [];

      for (const l of logs) {
        const displayAt = l.schedules?.start_time ?? l.created_at;
        merged.push({
          kind: "log",
          key: `log:${l.id}`,
          displayAt,
          proId: l.pro_id,
          log: l,
        });
      }

      for (const s of completedSchedules) {
        if (scheduleIdsWithLog.has(s.id)) continue;
        merged.push({
          kind: "schedule_only",
          key: `sch:${s.id}`,
          displayAt: s.start_time,
          proId: s.pro_id,
          schedule: s,
        });
      }

      for (const r of pendingRemote) {
        merged.push({
          kind: "remote_pending",
          key: `rem:${r.id}`,
          displayAt: r.created_at,
          proId: r.pro_id,
          request: r,
        });
      }

      merged.sort((a, b) => new Date(b.displayAt).getTime() - new Date(a.displayAt).getTime());
      setItems(merged);

      const proIds = Array.from(new Set(merged.map((m) => m.proId)));
      if (proIds.length > 0) {
        const { data: u, error: ue } = await supabase.from("users").select("id, name, email").in("id", proIds);
        if (ue) throw ue;
        const map: Record<string, { name: string | null; email: string }> = {};
        for (const r of (u as { id: string; name: string | null; email: string }[]) ?? []) {
          map[r.id] = { name: r.name, email: r.email };
        }
        setProMap(map);
      } else {
        setProMap({});
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

  const proOptions = useMemo(() => {
    return Object.entries(proMap).map(([id, u]) => ({
      id,
      label: u.name?.trim() ? u.name : u.email,
    }));
  }, [proMap]);

  const filtered = useMemo(
    () => (filterProId === "all" ? items : items.filter((it) => it.proId === filterProId)),
    [items, filterProId],
  );

  const hasAnything = items.length > 0;

  return (
    <div className="space-y-4">
      <MemberSwingVideoRequestForm
        user={user}
        heading="스윙 영상으로 피드백 받기"
        description="스윙 영상을 업로드하거나 URL을 넣고 프로를 선택해 보내면, 아래 목록에 요청 상태가 표시되고 프로가 코멘트로 답합니다."
        omitPaymentPricingUi
        onSubmitted={() => void reload()}
      />

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">레슨 코멘트</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              매장 레슨·원포인트 피드를 <strong>레슨 일시</strong> 기준으로 보고, 보낸 스윙 영상이 응답 대기 중이면 여기에도 표시됩니다.
            </p>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={() => void reload()}>
            새로고침
          </button>
        </div>
        {!loading && hasAnything ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="label text-[11px]" htmlFor="hist-pro">
                프로
              </label>
              <select
                id="hist-pro"
                className="input min-w-40 py-1.5 text-sm"
                value={filterProId}
                onChange={(e) => setFilterProId(e.target.value)}
              >
                <option value="all">전체</option>
                {proOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">아직 코멘트·기록이 없습니다. 위에서 스윙 영상을 보내보세요.</p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">선택한 프로에 해당하는 기록이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {filtered.map((entry) => {
              const pro = proMap[entry.proId];

              if (entry.kind === "remote_pending") {
                const r = entry.request;
                const isOpen = open === entry.key;
                const tierLabel =
                  r.lesson_minutes_quoted != null
                    ? `${r.lesson_minutes_quoted}분`
                    : r.pricing_tier === "60m"
                      ? "플랜 B"
                      : "플랜 A";
                const amt = r.amount_quoted != null ? formatKRW(r.amount_quoted) : "—";
                const showPricing = r.payment_id != null && r.payment_id !== "";
                return (
                  <li key={entry.key} className="rounded-lg border border-amber-200 bg-amber-50/40">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-3 text-left"
                      onClick={() => setOpen(isOpen ? null : entry.key)}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{formatDateTime(entry.displayAt)}</span>
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                            스윙 영상 · 응답 대기
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          프로: {pro ? pro.name ?? pro.email : entry.proId.slice(0, 8)}
                          {showPricing ? ` · ${tierLabel} · ${amt}` : ""}
                          {!showPricing ? " · 레슨 코멘트 요청" : null}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">{isOpen ? "▼" : "▶"}</span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-amber-100 p-3 text-sm">
                        {r.video_url ? (
                          <a
                            href={r.video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-700 underline"
                          >
                            보낸 스윙 영상 열기
                          </a>
                        ) : (
                          <p className="text-slate-500">(영상 URL 없음)</p>
                        )}
                        {r.request_note ? (
                          <p className="mt-2 whitespace-pre-line text-slate-700">{r.request_note}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              }

              if (entry.kind === "schedule_only") {
                const isOpen = open === entry.key;
                return (
                  <li key={entry.key} className="rounded-lg border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-3 text-left"
                      onClick={() => setOpen(isOpen ? null : entry.key)}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{formatDateTime(entry.displayAt)}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            매장 레슨
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          프로: {pro ? pro.name ?? pro.email : entry.proId.slice(0, 8)} · 레슨{" "}
                          {formatTime24(entry.schedule.start_time)}–{formatTime24(entry.schedule.end_time)}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">{isOpen ? "▼" : "▶"}</span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-slate-100 p-3">
                        <p className="text-sm text-slate-600">
                          완료된 예약입니다. 프로가 레슨 코멘트를 올리면 아래처럼 날짜별 카드로 표시됩니다.
                        </p>
                        {entry.schedule.note ? (
                          <p className="mt-2 whitespace-pre-line text-xs text-slate-500">
                            예약 메모: {entry.schedule.note}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              }

              const l = entry.log;
              const isOpen = open === entry.key;
              const sourceKind =
                l.source_kind === "remote"
                  ? "원포인트 코멘트"
                  : l.remote_request_id && !l.schedule_id
                    ? "원포인트 코멘트"
                    : "매장 레슨 코멘트";

              return (
                <li key={entry.key} className="rounded-lg border border-slate-200">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-3 text-left"
                    onClick={() => setOpen(isOpen ? null : entry.key)}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{formatDateTime(entry.displayAt)}</span>
                        <span
                          className={
                            l.source_kind === "remote" || l.remote_request_id
                              ? "rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                              : "rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                          }
                        >
                          {sourceKind}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        프로: {pro ? pro.name ?? pro.email : l.pro_id.slice(0, 8)}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{isOpen ? "▼" : "▶"}</span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-slate-100 bg-slate-50/40 p-3">
                      <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
                        <div className="border-b border-emerald-50 bg-emerald-50/60 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">레슨 코멘트</p>
                          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
                            <p className="text-lg font-semibold text-slate-900">
                              {user.name?.trim() || user.email}
                            </p>
                            <div className="text-right text-xs text-slate-500">
                              <div className="font-medium text-slate-700">
                                {formatDateTime(entry.displayAt)}
                              </div>
                              <div className="mt-0.5">
                                프로: {pro ? pro.name ?? pro.email : l.pro_id.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-4">
                          {l.feedback_text ? (
                            <div className="grid grid-cols-1 gap-2.5 text-sm text-slate-800 sm:grid-cols-2">
                              {splitFeedbackCommentsForDisplay(l.feedback_text).map((block, i) => (
                                <div
                                  key={i}
                                  className="rounded-lg border border-slate-100 bg-slate-50/90 p-3 shadow-sm"
                                >
                                  <div className="text-[11px] font-semibold text-emerald-900">{block.heading}</div>
                                  {block.body ? (
                                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">{block.body}</p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">(텍스트 코멘트 없음)</p>
                          )}
                          {l.transcript_text ? (
                            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                              <div className="font-semibold text-slate-700">AI 변환 텍스트</div>
                              <p className="mt-1 whitespace-pre-line">{l.transcript_text}</p>
                            </div>
                          ) : null}
                          {l.voice_note_url ? (
                            <div className="mt-4">
                              <span className="text-xs font-medium text-slate-700">음성 코멘트</span>
                              <audio className="mt-1 block w-full max-w-md" controls src={l.voice_note_url} />
                            </div>
                          ) : null}
                          {l.video_url ? (
                            <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
                              <p className="text-xs font-medium text-emerald-900">레슨 영상</p>
                              <p className="mt-1 text-[11px] text-slate-600">
                                QR로 열거나 링크를 복사해 주세요. 재생 시「내 프로필」연락처{" "}
                                <strong>끝 4자리</strong>를 입력합니다.
                              </p>
                              <a
                                href={l.video_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-block text-xs text-emerald-700 underline"
                              >
                                원본 링크 (로그인 상태)
                              </a>
                              {l.video_access_token ? (
                                <div className="mt-3 flex flex-wrap items-start gap-4">
                                  <div>
                                    <p className="text-[10px] font-medium text-slate-600">QR</p>
                                    <div className="mt-1">
                                      <VideoQrBlock url={getPublicLessonVideoPageUrl(l.video_access_token)} />
                                    </div>
                                  </div>
                                  <p className="max-w-[12rem] break-all font-mono text-[10px] text-slate-600">
                                    {getPublicLessonVideoPageUrl(l.video_access_token)}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
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
