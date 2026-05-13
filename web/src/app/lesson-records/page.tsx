"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, Schedule, ScheduleStatus } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";

type MemberOption = { id: string; name: string | null; email: string };

function startOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

function endOfDayIso(dateInput: string): string {
  return new Date(`${dateInput}T23:59:59.999`).toISOString();
}

function defaultDateInput(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function LessonRecordsPage() {
  const supabase = getSupabaseBrowserClient();
  const [me, setMe] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Schedule[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, MemberOption>>({});

  const [dateFrom, setDateFrom] = useState(defaultDateInput);
  const [dateTo, setDateTo] = useState(defaultDateInput);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<ScheduleStatus | "ALL">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const uid = sessionRes.session?.user.id;
      if (!uid) {
        setMe(null);
        setRows([]);
        return;
      }

      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("id, email, role, name, phone, profile_img, created_at")
        .eq("id", uid)
        .maybeSingle();
      if (userErr) throw userErr;
      const user = (userRow as AppUser | null) ?? null;
      setMe(user);
      if (!user) return;

      const ownerProId = user.role === "PRO" ? user.id : null;
      if (!ownerProId) {
        setRows([]);
        setMembers([]);
        return;
      }

      let query = supabase
        .from("schedules")
        .select("*")
        .eq("pro_id", ownerProId)
        .gte("start_time", startOfDayIso(dateFrom))
        .lte("start_time", endOfDayIso(dateTo))
        .order("start_time", { ascending: true });

      if (selectedMemberId) query = query.eq("member_id", selectedMemberId);
      if (selectedStatus !== "ALL") query = query.eq("status", selectedStatus);

      const { data: scheduleRows, error: scErr } = await query;
      if (scErr) throw scErr;
      const schedules = (scheduleRows as Schedule[]) ?? [];
      setRows(schedules);

      const memberIds = Array.from(new Set(schedules.map((s) => s.member_id).filter((v): v is string => Boolean(v))));
      if (memberIds.length === 0) {
        setMembers([]);
        setMemberMap({});
        return;
      }

      const { data: memberRows, error: mErr } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", memberIds);
      if (mErr) throw mErr;

      const list = ((memberRows as MemberOption[]) ?? []).sort((a, b) =>
        (a.name ?? a.email).localeCompare(b.name ?? b.email, "ko"),
      );
      const map: Record<string, MemberOption> = {};
      for (const m of list) map[m.id] = m;
      setMembers(list);
      setMemberMap(map);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedMemberId, selectedStatus, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const booked = rows.filter((r) => r.status === "BOOKED").length;
    const completed = rows.filter((r) => r.status === "COMPLETED").length;
    const canceled = rows.filter((r) => r.status === "CANCELED").length;
    return { total: rows.length, booked, completed, canceled };
  }, [rows]);

  if (me === null && !loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-12 pt-8">
        <section className="card">
          <h1 className="text-xl font-bold text-slate-900">레슨 조회</h1>
          <p className="mt-2 text-sm text-slate-600">로그인 후 사용할 수 있습니다.</p>
          <Link href="/" className="btn-primary mt-4">
            홈으로 이동
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">회원별 레슨 조회</h1>
            <p className="mt-1 text-sm text-slate-600">날짜/회원/상태 기준으로 예약 레슨을 조회합니다.</p>
          </div>
          <Link href="/" className="btn-ghost text-sm">
            대시보드로 돌아가기
          </Link>
        </div>

        {error ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="date-from">
              시작일
            </label>
            <input id="date-from" className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="date-to">
              종료일
            </label>
            <input id="date-to" className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="member-filter">
              회원
            </label>
            <select
              id="member-filter"
              className="input"
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
            >
              <option value="">전체 회원</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name?.trim() ? m.name : "(이름 없음)"} · {m.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status-filter">
              상태
            </label>
            <select
              id="status-filter"
              className="input"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as ScheduleStatus | "ALL")}
            >
              <option value="ALL">전체</option>
              <option value="BOOKED">BOOKED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="badge-slate">총 {summary.total}건</span>
          <span className="badge-emerald">예약 {summary.booked}</span>
          <span className="badge-slate">완료 {summary.completed}</span>
          <span className="badge-rose">취소 {summary.canceled}</span>
          <button type="button" className="btn-secondary ml-auto text-xs" onClick={() => void load()} disabled={loading}>
            {loading ? "불러오는 중..." : "새로고침"}
          </button>
        </div>
      </section>

      <section className="card mt-4 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">조건에 맞는 레슨 일정이 없습니다.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="px-2 py-2">날짜</th>
                <th className="px-2 py-2">시간</th>
                <th className="px-2 py-2">회원</th>
                <th className="px-2 py-2">상태</th>
                <th className="px-2 py-2">메모</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const member = r.member_id ? memberMap[r.member_id] : null;
                return (
                  <tr key={r.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2">{formatDate(r.start_time)}</td>
                    <td className="px-2 py-2">
                      {formatTime(r.start_time)} - {formatTime(r.end_time)}
                    </td>
                    <td className="px-2 py-2">
                      {member ? (member.name?.trim() ? member.name : `(이름 없음) ${member.email}`) : "미지정"}
                    </td>
                    <td className="px-2 py-2">
                      <span className={r.status === "BOOKED" ? "badge-emerald" : r.status === "COMPLETED" ? "badge-slate" : "badge-rose"}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-slate-600">{r.note ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
