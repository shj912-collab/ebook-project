"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, Schedule, LessonLog, RemoteRequest } from "@/lib/types";
import { formatDateTime } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";
import type { MemberTab } from "../Dashboard";
import { MemberBookingPanel } from "./MemberBookingPanel";
import { MemberHistoryPanel } from "./MemberHistoryPanel";
import { MemberRemotePanel } from "./MemberRemotePanel";
import { MemberProfilePanel } from "./MemberProfilePanel";

type Props = { user: AppUser; tab: MemberTab };

export function MemberDashboard({ user, tab }: Props) {
  if (tab === "booking") return <MemberBookingPanel user={user} />;
  if (tab === "history") return <MemberHistoryPanel user={user} />;
  if (tab === "remote") return <MemberRemotePanel user={user} />;
  if (tab === "profile") return <MemberProfilePanel user={user} />;
  return <MemberTodayPanel user={user} />;
}

function MemberTodayPanel({ user }: { user: AppUser }) {
  const supabase = getSupabaseBrowserClient();
  const [next, setNext] = useState<Schedule | null>(null);
  const [latestLogs, setLatestLogs] = useState<LessonLog[]>([]);
  const [activeRemote, setActiveRemote] = useState<RemoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const nowIso = new Date().toISOString();
        const [s, l, r] = await Promise.all([
          supabase
            .from("schedules")
            .select("*")
            .eq("member_id", user.id)
            .eq("status", "BOOKED")
            .gte("start_time", nowIso)
            .order("start_time", { ascending: true })
            .limit(1),
          supabase
            .from("lesson_logs")
            .select("*")
            .eq("member_id", user.id)
            .order("created_at", { ascending: false })
            .limit(3),
          supabase
            .from("remote_requests")
            .select("*")
            .eq("member_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);
        if (!mounted) return;
        if (s.error) throw s.error;
        if (l.error) throw l.error;
        if (r.error) throw r.error;
        const sched = (s.data as Schedule[]) ?? [];
        setNext(sched[0] ?? null);
        setLatestLogs((l.data as LessonLog[]) ?? []);
        setActiveRemote((r.data as RemoteRequest[]) ?? []);
      } catch (e) {
        if (mounted) setError(toUserMessage(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [supabase, user.id]);

  if (loading) return <div className="card text-sm text-slate-500">불러오는 중…</div>;
  if (error) return <div className="card text-sm text-rose-600">에러: {error}</div>;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card">
        <h3 className="text-sm font-semibold">다음 예약</h3>
        {next ? (
          <div className="mt-2">
            <div className="text-lg font-semibold text-emerald-700">
              {formatDateTime(next.start_time)}
            </div>
            <div className="mt-1 text-xs text-slate-500">예약 ID: {next.id.slice(0, 8)}…</div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">예정된 예약이 없습니다. 예약하기 탭에서 신청하세요.</p>
        )}
      </div>
      <div className="card md:col-span-2">
        <h3 className="text-sm font-semibold">최신 피드백</h3>
        {latestLogs.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">아직 받은 피드백이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {latestLogs.map((l) => (
              <li key={l.id} className="rounded-md border border-slate-100 p-2 text-sm">
                <div className="text-xs text-slate-500">{formatDateTime(l.created_at)}</div>
                <p className="mt-1 line-clamp-2 text-slate-800">
                  {l.feedback_text ?? "(텍스트 없음)"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card md:col-span-3">
        <h3 className="text-sm font-semibold">진행 중인 원포인트</h3>
        {activeRemote.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">진행 중인 요청이 없습니다.</p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeRemote.map((r) => (
              <li key={r.id} className="rounded-md border border-slate-100 p-2 text-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{formatDateTime(r.created_at)}</span>
                  <span className={r.feedback_id ? "badge-emerald" : "badge-amber"}>
                    {r.feedback_id ? "응답완료" : "대기중"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-slate-800">{r.request_note ?? "(메모 없음)"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
