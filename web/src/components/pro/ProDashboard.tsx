"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, Schedule, RemoteRequest, LessonLog } from "@/lib/types";
import { formatDateTime } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";
import type { ProTab } from "../Dashboard";
import { ProSchedulePanel } from "./ProSchedulePanel";
import { ProLessonsPanel } from "./ProLessonsPanel";
import { ProRemotePanel } from "./ProRemotePanel";
import { ProMemberRosterPanel } from "./ProMemberRosterPanel";

type Props = { user: AppUser; tab: ProTab };

export function ProDashboard({ user, tab }: Props) {
  if (tab === "schedule") return <ProSchedulePanel user={user} />;
  if (tab === "lessons") return <ProLessonsPanel user={user} />;
  if (tab === "members") return <ProMemberRosterPanel user={user} />;
  if (tab === "remote") return <ProRemotePanel user={user} />;
  return <ProTodayPanel user={user} />;
}

function ProTodayPanel({ user }: { user: AppUser }) {
  const supabase = getSupabaseBrowserClient();
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, { name: string | null; email: string }>>({});
  const [pendingRemote, setPendingRemote] = useState<RemoteRequest[]>([]);
  const [recentLogs, setRecentLogs] = useState<LessonLog[]>([]);
  /** PRD §5·§12: COMPLETED 예약 중 레슨 코멘트 미작성 건수 */
  const [pendingLessonDraftCount, setPendingLessonDraftCount] = useState(0);
  const [pendingLessonPreview, setPendingLessonPreview] = useState<
    Pick<Schedule, "id" | "member_id" | "start_time">[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const [s, r, l, completed, logRows] = await Promise.all([
          supabase
            .from("schedules")
            .select("*")
            .eq("pro_id", user.id)
            .gte("start_time", start.toISOString())
            .lt("start_time", end.toISOString())
            .order("start_time", { ascending: true }),
          supabase
            .from("remote_requests")
            .select("*")
            .eq("pro_id", user.id)
            .eq("payment_status", "PAID")
            .is("feedback_id", null)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("lesson_logs")
            .select("*")
            .eq("pro_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("schedules")
            .select("id, member_id, start_time")
            .eq("pro_id", user.id)
            .eq("status", "COMPLETED")
            .not("member_id", "is", null)
            .order("start_time", { ascending: false })
            .limit(100),
          supabase.from("lesson_logs").select("schedule_id").eq("pro_id", user.id).not("schedule_id", "is", null),
        ]);
        if (!mounted) return;
        if (s.error) throw s.error;
        if (r.error) throw r.error;
        if (l.error) throw l.error;
        if (completed.error) throw completed.error;
        if (logRows.error) throw logRows.error;

        const schedulesData = (s.data as Schedule[]) ?? [];
        setTodaySchedules(schedulesData);
        setPendingRemote((r.data as RemoteRequest[]) ?? []);
        setRecentLogs((l.data as LessonLog[]) ?? []);

        const loggedScheduleIds = new Set(
          ((logRows.data as { schedule_id: string | null }[]) ?? [])
            .map((row) => row.schedule_id)
            .filter((id): id is string => Boolean(id)),
        );
        const completedList = (completed.data as Pick<Schedule, "id" | "member_id" | "start_time">[]) ?? [];
        const pendingDrafts = completedList.filter((sch) => !loggedScheduleIds.has(sch.id));
        setPendingLessonDraftCount(pendingDrafts.length);
        setPendingLessonPreview(pendingDrafts.slice(0, 5));

        const mids = Array.from(
          new Set([
            ...schedulesData.map((x) => x.member_id).filter((v): v is string => Boolean(v)),
            ...pendingDrafts.map((x) => x.member_id).filter((v): v is string => Boolean(v)),
          ]),
        );
        if (mids.length === 0) {
          setMemberMap({});
        } else {
          const { data: mu, error: me } = await supabase.from("users").select("id, name, email").in("id", mids);
          if (me) throw me;
          const map: Record<string, { name: string | null; email: string }> = {};
          for (const row of (mu as { id: string; name: string | null; email: string }[]) ?? []) {
            map[row.id] = { name: row.name, email: row.email };
          }
          if (mounted) setMemberMap(map);
        }
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

  if (loading) {
    return <div className="card text-sm text-slate-500">불러오는 중…</div>;
  }
  if (error) {
    return <div className="card text-sm text-rose-600">에러: {error}</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard title="오늘 예약" count={todaySchedules.length} accent="emerald">
        {todaySchedules.length === 0 ? (
          <p className="text-xs text-slate-500">오늘 예약이 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {todaySchedules.map((s) => {
              const m = s.member_id ? memberMap[s.member_id] : null;
              const label = m?.name?.trim() ? m.name : m ? m.email.slice(0, 10) : "—";
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">
                    <span className="font-medium text-slate-800">{label}</span>
                    <span className="text-slate-500"> · {formatDateTime(s.start_time)}</span>
                  </span>
                  <span className={`shrink-0 ${statusBadge(s.status)}`}>{s.status}</span>
                </li>
              );
            })}
          </ul>
        )}
      </SummaryCard>
      <SummaryCard title="미작성 레슨 코멘트" count={pendingLessonDraftCount} accent="rose">
        {pendingLessonDraftCount === 0 ? (
          <p className="text-xs text-slate-500">완료된 레슨 중 미작성이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {pendingLessonPreview.map((s) => {
              const m = s.member_id ? memberMap[s.member_id] : null;
              const label = m?.name?.trim() ? m.name : m ? m.email.slice(0, 10) : "—";
              return (
                <li key={s.id} className="truncate">
                  <span className="font-medium text-slate-800">{label}</span>
                  <span className="text-slate-500"> · {formatDateTime(s.start_time)}</span>
                </li>
              );
            })}
            {pendingLessonDraftCount > pendingLessonPreview.length ? (
              <li className="text-slate-400">
                외 {pendingLessonDraftCount - pendingLessonPreview.length}건 — 「레슨 코멘트」에서 작성
              </li>
            ) : null}
            {pendingLessonPreview.length > 0 ? (
              <li className="text-slate-400">「레슨 코멘트」탭에서 작성하세요.</li>
            ) : null}
          </ul>
        )}
      </SummaryCard>
      <SummaryCard title="원포인트 대기" count={pendingRemote.length} accent="amber">
        {pendingRemote.length === 0 ? (
          <p className="text-xs text-slate-500">대기 중인 요청이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {pendingRemote.map((r) => (
              <li key={r.id}>
                <span className="text-slate-500">{formatDateTime(r.created_at)}</span>
                <span className="ml-2 truncate text-slate-800">
                  {r.request_note?.slice(0, 30) ?? "(메모 없음)"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>
      <SummaryCard title="최근 레슨 코멘트" count={recentLogs.length} accent="slate">
        {recentLogs.length === 0 ? (
          <p className="text-xs text-slate-500">아직 작성된 레슨 코멘트가 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {recentLogs.map((l) => (
              <li key={l.id} className="truncate">
                <span className="text-slate-500">{formatDateTime(l.created_at)}</span>
                <span className="ml-2 text-slate-800">
                  {l.feedback_text?.slice(0, 30) ?? "(메모 없음)"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>
    </div>
  );
}

function SummaryCard({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: "emerald" | "amber" | "slate" | "rose";
  children: React.ReactNode;
}) {
  const accentClass = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    slate: "text-slate-700",
    rose: "text-rose-600",
  }[accent];
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className={`text-xl font-bold ${accentClass}`}>{count}</span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function statusBadge(status: Schedule["status"]) {
  if (status === "BOOKED") return "badge-emerald";
  if (status === "COMPLETED") return "badge-slate";
  return "badge-rose";
}
