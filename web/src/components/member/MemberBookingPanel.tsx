"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, ProProfile, Schedule } from "@/lib/types";
import { formatScheduleRangeLine, formatTime24 } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";
import {
  buildCalendarBookingCandidates,
  candidateOverlapsBooked,
  formatLocalDateInput,
  isValidBookingDayWindow,
  localDayFromDateInput,
  normalizeTimeHmForInput,
  parseTimeInputHm,
  shiftLocalDateInput,
} from "@/lib/bookingCandidates";

type Props = { user: AppUser };

type ProOption = { id: string; name: string | null; email: string };

const DEFAULT_BOOKING_DAY_START = "05:00";
const DEFAULT_BOOKING_DAY_END_EXCLUSIVE = "24:00";

export function MemberBookingPanel({ user }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [pros, setPros] = useState<ProOption[]>([]);
  const [selectedPro, setSelectedPro] = useState<string>("");
  const [proBookedSchedules, setProBookedSchedules] = useState<Schedule[]>([]);
  const [mySchedules, setMySchedules] = useState<Schedule[]>([]);
  const [proMap, setProMap] = useState<Record<string, ProOption>>({});
  const [proBookingProfile, setProBookingProfile] = useState<ProProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pickDate, setPickDate] = useState(() => formatLocalDateInput(new Date()));

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data, error: e } = await supabase.from("users").select("id, name, email").eq("role", "PRO");
      if (!mounted) return;
      if (e) {
        setError(toUserMessage(e));
        return;
      }
      const list = (data as ProOption[]) ?? [];
      setPros(list);
      if (list.length > 0 && !selectedPro) setSelectedPro(list[0].id);
    })();
    return () => {
      mounted = false;
    };
  }, [supabase, selectedPro]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromIso = new Date().toISOString();
      const myRes = await supabase
        .from("schedules")
        .select("*")
        .eq("member_id", user.id)
        .eq("status", "BOOKED")
        .gte("start_time", fromIso)
        .order("start_time", { ascending: true });
      if (myRes.error) throw myRes.error;
      const my = (myRes.data as Schedule[]) ?? [];
      setMySchedules(my);

      if (selectedPro) {
        const [bookedRes, ppRes] = await Promise.all([
          supabase.from("schedules").select("*").eq("pro_id", selectedPro).eq("status", "BOOKED").gte("start_time", fromIso),
          supabase.from("pro_profiles").select("*").eq("user_id", selectedPro).maybeSingle(),
        ]);
        if (bookedRes.error) throw bookedRes.error;
        if (ppRes.error) throw ppRes.error;
        setProBookedSchedules((bookedRes.data as Schedule[]) ?? []);
        setProBookingProfile((ppRes.data as ProProfile | null) ?? null);
      } else {
        setProBookedSchedules([]);
        setProBookingProfile(null);
      }

      const proIds = Array.from(new Set(my.map((s) => s.pro_id)));
      if (proIds.length > 0) {
        const { data, error: e } = await supabase.from("users").select("id, name, email").in("id", proIds);
        if (e) throw e;
        const map: Record<string, ProOption> = {};
        for (const p of (data as ProOption[]) ?? []) map[p.id] = p;
        setProMap(map);
      } else {
        setProMap({});
      }
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, user.id, selectedPro]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const gridStep = Math.min(60, Math.max(5, proBookingProfile?.booking_start_step_minutes ?? 20));
  const gridDur = Math.min(180, Math.max(10, proBookingProfile?.booking_lesson_duration_minutes ?? 60));

  const bookingDayWindowParsed = useMemo(() => {
    const startHm = normalizeTimeHmForInput(
      proBookingProfile?.booking_day_start_local,
      DEFAULT_BOOKING_DAY_START,
    );
    const endHm = normalizeTimeHmForInput(
      proBookingProfile?.booking_day_end_exclusive_local,
      DEFAULT_BOOKING_DAY_END_EXCLUSIVE,
    );
    const a = parseTimeInputHm(startHm);
    const b = parseTimeInputHm(endHm);
    if (!a || !b) return { valid: false as const, start: null, end: null, label: `${startHm} ~ ${endHm}` };
    return {
      valid: isValidBookingDayWindow(a, b),
      start: a,
      end: b,
      label: `${startHm} ~ ${endHm}`,
    };
  }, [proBookingProfile?.booking_day_start_local, proBookingProfile?.booking_day_end_exclusive_local]);

  const slotsForPickDay = useMemo(() => {
    if (!bookingDayWindowParsed.valid || !bookingDayWindowParsed.start || !bookingDayWindowParsed.end) return [];
    const day = localDayFromDateInput(pickDate);
    return buildCalendarBookingCandidates({
      rangeStartInclusive: day,
      days: 1,
      dayStartHour: bookingDayWindowParsed.start.hour,
      dayStartMinute: bookingDayWindowParsed.start.minute,
      dayEndExclusiveHour: bookingDayWindowParsed.end.hour,
      dayEndExclusiveMinute: bookingDayWindowParsed.end.minute,
      startStepMinutes: gridStep,
      durationMinutes: gridDur,
    });
  }, [pickDate, gridStep, gridDur, bookingDayWindowParsed]);

  const book = async (start: string, end: string) => {
    setBusy(true);
    setError(null);
    try {
      if (!user.name?.trim()) {
        throw new Error("예약 전 「내 프로필」탭에서 이름을 입력하고 저장해 주세요.");
      }
      const { error: e } = await supabase.rpc("book_schedule", {
        p_pro_id: selectedPro,
        p_start_time: start,
        p_end_time: end,
        p_note: note.trim() || null,
      });
      if (e) throw e;
      setNote("");
      await reload();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (s: Schedule) => {
    if (!confirm("이 예약을 취소할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.from("schedules").update({ status: "CANCELED" }).eq("id", s.id);
      if (e) throw e;
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
        <h3 className="text-sm font-semibold">예약하기</h3>
        <p className="mt-1 text-xs text-slate-500">
          프로를 고른 뒤 <strong>날짜</strong>를 정하고 <strong>시작 시각</strong>을 눌러 예약합니다. 선택한 프로가 정한 시간대 안에서만 버튼이
          표시됩니다.
        </p>
        {selectedPro && proBookingProfile ? (
          <p className="mt-2 text-[11px] text-slate-600">
            레슨 시간 {gridDur}분 · 회원 이용 시간 <strong>{bookingDayWindowParsed.label}</strong> (종료 전 배타)
          </p>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pro">
              프로
            </label>
            <select id="pro" className="input" value={selectedPro} onChange={(e) => setSelectedPro(e.target.value)}>
              {pros.length === 0 ? <option value="">(등록된 프로 없음)</option> : null}
              {pros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="note">
              메모 (선택)
            </label>
            <input
              id="note"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="요청사항"
            />
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">날짜 · 예약 시간</h3>
          <button type="button" className="btn-ghost text-xs" onClick={() => void reload()} disabled={busy}>
            새로고침
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setPickDate((d) => shiftLocalDateInput(d, -1))}
          >
            이전
          </button>
          <input
            type="date"
            className="input w-auto py-1.5"
            value={pickDate}
            onChange={(e) => setPickDate(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setPickDate((d) => shiftLocalDateInput(d, 1))}
          >
            다음
          </button>
        </div>
        {!bookingDayWindowParsed.valid ? (
          <p className="mt-3 text-sm text-amber-800">
            선택한 프로의 이용 시간 설정이 올바르지 않습니다. 프로에게 스케줄 설정을 확인해 달라고 하세요.
          </p>
        ) : null}
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
        ) : !bookingDayWindowParsed.valid ? (
          <p className="mt-3 text-sm text-slate-500">이용 시간이 정리되면 예약 시간이 표시됩니다.</p>
        ) : slotsForPickDay.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            이 날짜에는 예약 가능한 시간이 없습니다. 다른 날을 눌러 보세요.
          </p>
        ) : (
          <div className="mt-4">
            <p className="mb-2 text-xs text-slate-500">시작 시각을 누르면 바로 예약됩니다.</p>
            <div className="flex flex-wrap gap-2">
              {slotsForPickDay.map((c) => {
                const taken = candidateOverlapsBooked(c.start, c.end, proBookedSchedules);
                return (
                  <button
                    key={c.start}
                    type="button"
                    disabled={busy || taken}
                    onClick={() => void book(c.start, c.end)}
                    className={`min-w-[4.5rem] rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      taken
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                    }`}
                  >
                    {taken ? "마감" : formatTime24(c.start)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="text-sm font-semibold">내 예약</h3>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
        ) : mySchedules.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">확정된 예약이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {mySchedules.map((s) => {
              const pro = proMap[s.pro_id];
              return (
                <li key={s.id} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium text-slate-800">
                      {formatScheduleRangeLine(s.start_time, s.end_time)}
                    </div>
                    <div className="text-xs text-slate-500">프로: {pro ? pro.name ?? pro.email : s.pro_id.slice(0, 8)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={statusBadge(s.status)}>{s.status}</span>
                    {s.status === "BOOKED" ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs text-rose-600"
                        disabled={busy}
                        onClick={() => void cancel(s)}
                      >
                        취소
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function statusBadge(status: Schedule["status"]) {
  if (status === "BOOKED") return "badge-emerald";
  if (status === "COMPLETED") return "badge-slate";
  return "badge-rose";
}
