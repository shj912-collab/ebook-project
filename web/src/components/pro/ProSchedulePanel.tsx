"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, MemberProfile, ProProfile, Schedule } from "@/lib/types";
import { formatScheduleRangeLine, formatTime24 } from "@/lib/types";
import { MemberProfilePreview } from "./MemberProfilePreview";
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
import { toUserMessage } from "@/lib/formatError";

type Props = { user: AppUser };

type LessonFamily = "A" | "B" | "custom";

const DEFAULT_BOOKING_DAY_START = "05:00";
const DEFAULT_BOOKING_DAY_END_EXCLUSIVE = "24:00";
/** 회원·프로 예약 그리드 시작 간격(분). UI에서 변경하지 않습니다. */
const BOOKING_GRID_STEP_FIXED = 20;

const WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"];
/** 예약 현황 캘린더: 시작일부터 이틀(14일) */
const SCHEDULE_OVERVIEW_DAYS = 14;


export function ProSchedulePanel({ user }: Props) {
  const supabase = getSupabaseBrowserClient();
  /** 주간 캘린더 구간 */
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  /** 향후 예약 전체(처리 목록) */
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, { name: string | null; email: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, SCHEDULE_OVERVIEW_DAYS), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: SCHEDULE_OVERVIEW_DAYS }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const [peekMemberId, setPeekMemberId] = useState<string | null>(null);
  const [peekProfile, setPeekProfile] = useState<MemberProfile | null>(null);
  const [peekLoading, setPeekLoading] = useState(false);

  /** 향후 예약 겹침 검사용 */
  const [bookedSchedulesAhead, setBookedSchedulesAhead] = useState<Schedule[]>([]);
  const [bookingPickList, setBookingPickList] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [proBookMemberId, setProBookMemberId] = useState("");
  const [proBookNote, setProBookNote] = useState("");
  const [proBookBusy, setProBookBusy] = useState(false);
  const [proBookingPickDate, setProBookingPickDate] = useState(() => formatLocalDateInput(new Date()));

  const [myProProfile, setMyProProfile] = useState<ProProfile | null>(null);
  const [lessonFamily, setLessonFamily] = useState<LessonFamily>("A");
  const [presetDurA, setPresetDurA] = useState<20 | 40 | 60>(60);
  const [presetDurB, setPresetDurB] = useState<30 | 50>(30);
  const [customDurStr, setCustomDurStr] = useState("");
  const [bookingWindowStart, setBookingWindowStart] = useState(DEFAULT_BOOKING_DAY_START);
  const [bookingWindowEndExclusive, setBookingWindowEndExclusive] = useState(DEFAULT_BOOKING_DAY_END_EXCLUSIVE);
  const [gridSaveBusy, setGridSaveBusy] = useState(false);

  const lessonTimeMinutes = useMemo(() => {
    if (lessonFamily === "A") return presetDurA;
    if (lessonFamily === "B") return presetDurB;
    const n = Number.parseInt(customDurStr, 10);
    if (!Number.isFinite(n)) return 60;
    return Math.min(180, Math.max(10, n));
  }, [lessonFamily, presetDurA, presetDurB, customDurStr]);

  const loadMemberPeek = useCallback(
    async (memberId: string) => {
      setPeekMemberId(memberId);
      setPeekLoading(true);
      setPeekProfile(null);
      const { data, error: pe } = await supabase
        .from("member_profiles")
        .select("*")
        .eq("user_id", memberId)
        .maybeSingle();
      setPeekLoading(false);
      if (pe) setError(toUserMessage(pe));
      else setPeekProfile((data as MemberProfile) ?? null);
    },
    [supabase],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ws = weekStart.toISOString();
    const we = weekEnd.toISOString();
    try {
      const nowIso = new Date().toISOString();
      const futureIso = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
      const [sc, up, bookedAhead, linkRows, ppRes] = await Promise.all([
        supabase
          .from("schedules")
          .select("*")
          .eq("pro_id", user.id)
          .lt("start_time", we)
          .gt("end_time", ws)
          .order("start_time", { ascending: true }),
        supabase
          .from("schedules")
          .select("*")
          .eq("pro_id", user.id)
          .gte("start_time", nowIso)
          .lte("start_time", futureIso)
          .order("start_time", { ascending: true })
          .limit(80),
        supabase
          .from("schedules")
          .select("*")
          .eq("pro_id", user.id)
          .eq("status", "BOOKED")
          .gte("start_time", nowIso)
          .lte("start_time", futureIso),
        supabase.from("pro_client_links").select("member_id").eq("pro_id", user.id),
        supabase.from("pro_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      if (sc.error) throw sc.error;
      if (up.error) throw up.error;
      if (bookedAhead.error) throw bookedAhead.error;
      if (linkRows.error) throw linkRows.error;
      if (ppRes.error) throw ppRes.error;

      const ppRow = (ppRes.data as ProProfile | null) ?? null;
      setMyProProfile(ppRow);
      const dur = ppRow?.booking_lesson_duration_minutes ?? 60;
      if ([20, 40, 60].includes(dur)) {
        setLessonFamily("A");
        setPresetDurA(dur as 20 | 40 | 60);
      } else if ([30, 50].includes(dur)) {
        setLessonFamily("B");
        setPresetDurB(dur as 30 | 50);
      } else {
        setLessonFamily("custom");
        setCustomDurStr(String(Math.min(180, Math.max(10, dur))));
      }
      setBookingWindowStart(normalizeTimeHmForInput(ppRow?.booking_day_start_local, DEFAULT_BOOKING_DAY_START));
      setBookingWindowEndExclusive(
        normalizeTimeHmForInput(ppRow?.booking_day_end_exclusive_local, DEFAULT_BOOKING_DAY_END_EXCLUSIVE),
      );

      const scheduleData = (sc.data as Schedule[]) ?? [];
      const upcoming = (up.data as Schedule[]) ?? [];
      setSchedules(scheduleData);
      setUpcomingSchedules(upcoming);
      setBookedSchedulesAhead((bookedAhead.data as Schedule[]) ?? []);

      const linkedIds =
        ((linkRows.data as { member_id: string }[]) ?? []).map((x) => x.member_id);

      const memberIds = Array.from(
        new Set([
          ...[...scheduleData, ...upcoming].map((s) => s.member_id).filter((v): v is string => Boolean(v)),
          ...linkedIds,
        ]),
      );

      if (memberIds.length > 0) {
        const { data, error: e } = await supabase
          .from("users")
          .select("id, name, email")
          .in("id", memberIds);
        if (e) throw e;
        const map: Record<string, { name: string | null; email: string }> = {};
        const plist: { id: string; name: string | null; email: string }[] = [];
        for (const u of (data as { id: string; name: string | null; email: string }[]) ?? []) {
          map[u.id] = { name: u.name, email: u.email };
          plist.push({ id: u.id, name: u.name, email: u.email });
        }
        plist.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "ko"));
        setMemberMap(map);
        setBookingPickList(plist);
      } else {
        setMemberMap({});
        setBookingPickList([]);
      }
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, user.id, weekEnd, weekStart]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const completeSchedule = async (s: Schedule) => {
    const { error: e } = await supabase
      .from("schedules")
      .update({ status: "COMPLETED" })
      .eq("id", s.id);
    if (e) {
      setError(toUserMessage(e));
      return;
    }
    await reload();
    if (s.member_id) await loadMemberPeek(s.member_id);
  };

  const cancelSchedule = async (s: Schedule) => {
    if (!confirm("이 예약을 취소할까요?")) return;
    const { error: e } = await supabase
      .from("schedules")
      .update({ status: "CANCELED" })
      .eq("id", s.id);
    if (e) {
      setError(toUserMessage(e));
      return;
    }
    await reload();
  };

  const schedulesForDay = (day: Date) => {
    const a = dayStart(day);
    const b = dayEnd(day);
    return schedules.filter(
      (s) => s.status === "BOOKED" && overlap(new Date(s.start_time), new Date(s.end_time), a, b),
    );
  };

  const isToday = (day: Date) => {
    const t = stripTime(new Date());
    return stripTime(day).getTime() === t.getTime();
  };

  const bookingWindowParsed = useMemo(() => {
    const a = parseTimeInputHm(normalizeTimeHmForInput(bookingWindowStart, DEFAULT_BOOKING_DAY_START));
    const b = parseTimeInputHm(normalizeTimeHmForInput(bookingWindowEndExclusive, DEFAULT_BOOKING_DAY_END_EXCLUSIVE));
    const ok = isValidBookingDayWindow(a, b);
    return ok ? ({ valid: true as const, start: a!, end: b! }) : ({ valid: false as const, start: a, end: b });
  }, [bookingWindowStart, bookingWindowEndExclusive]);

  const proBookCandidates = useMemo(() => {
    if (!bookingWindowParsed.valid || !bookingWindowParsed.start || !bookingWindowParsed.end) return [];
    return buildCalendarBookingCandidates({
      rangeStartInclusive: localDayFromDateInput(proBookingPickDate),
      days: 1,
      dayStartHour: bookingWindowParsed.start.hour,
      dayStartMinute: bookingWindowParsed.start.minute,
      dayEndExclusiveHour: bookingWindowParsed.end.hour,
      dayEndExclusiveMinute: bookingWindowParsed.end.minute,
      startStepMinutes: BOOKING_GRID_STEP_FIXED,
      durationMinutes: lessonTimeMinutes,
    });
  }, [proBookingPickDate, bookingWindowParsed, lessonTimeMinutes]);

  const saveBookingGrid = async () => {
    setGridSaveBusy(true);
    setError(null);
    try {
      if (!bookingWindowParsed.valid) {
        setError(
          "회원 예약 이용 시간을 확인해 주세요. 시작·종료는 HH:MM 형식이고, 종료는 시작보다 늦어야 합니다. 하루 종일은 종료에 24:00을 쓸 수 있습니다.",
        );
        return;
      }
      const r30 = myProProfile?.remote_price_30m ?? myProProfile?.remote_price ?? 30000;
      const r60 =
        myProProfile?.remote_price_60m ??
        Math.max((myProProfile?.remote_price ?? r30) * 2, r30 + 10000);
      const winStart = normalizeTimeHmForInput(bookingWindowStart, DEFAULT_BOOKING_DAY_START);
      const winEnd = normalizeTimeHmForInput(bookingWindowEndExclusive, DEFAULT_BOOKING_DAY_END_EXCLUSIVE);

      const { error: upErr } = await supabase.from("pro_profiles").upsert(
        {
          user_id: user.id,
          booking_start_step_minutes: BOOKING_GRID_STEP_FIXED,
          booking_lesson_duration_minutes: lessonTimeMinutes,
          booking_day_start_local: winStart,
          booking_day_end_exclusive_local: winEnd,
          remote_price: myProProfile?.remote_price ?? r30,
          remote_price_30m: r30,
          remote_price_60m: r60,
          remote_plan_a_minutes: myProProfile?.remote_plan_a_minutes ?? 30,
          remote_plan_b_minutes: myProProfile?.remote_plan_b_minutes ?? 60,
          response_sla_hours: myProProfile?.response_sla_hours ?? 48,
          bio: myProProfile?.bio ?? null,
        },
        { onConflict: "user_id" },
      );
      if (upErr) throw upErr;
      await reload();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setGridSaveBusy(false);
    }
  };

  const scheduleForMemberAsPro = async (startIso: string, endIso: string) => {
    setError(null);
    const savedDur = myProProfile?.booking_lesson_duration_minutes;
    const savedWs = normalizeTimeHmForInput(myProProfile?.booking_day_start_local, DEFAULT_BOOKING_DAY_START);
    const savedWe = normalizeTimeHmForInput(
      myProProfile?.booking_day_end_exclusive_local,
      DEFAULT_BOOKING_DAY_END_EXCLUSIVE,
    );
    const curWs = normalizeTimeHmForInput(bookingWindowStart, DEFAULT_BOOKING_DAY_START);
    const curWe = normalizeTimeHmForInput(bookingWindowEndExclusive, DEFAULT_BOOKING_DAY_END_EXCLUSIVE);
    if (
      myProProfile &&
      (savedDur !== lessonTimeMinutes || savedWs !== curWs || savedWe !== curWe)
    ) {
      setError("변경한 레슨 시간·회원 이용 시간을 먼저 「레슨 예약 설정 저장」으로 저장한 뒤 등록해 주세요.");
      return;
    }
    if (!proBookMemberId) {
      setError("예약할 회원을 선택하세요.");
      return;
    }
    const pick = bookingPickList.find((p) => p.id === proBookMemberId);
    if (!pick?.name?.trim()) {
      setError("선택한 회원에 저장된 이름이 없습니다. 회원에게 「내 프로필」에서 이름을 입력·저장하도록 안내해 주세요.");
      return;
    }
    setProBookBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc("pro_create_schedule_for_member", {
        p_member_id: proBookMemberId,
        p_start_time: startIso,
        p_end_time: endIso,
        p_note: proBookNote.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      setProBookNote("");
      await reload();
    } catch (e) {
      const msg = toUserMessage(e);
      setError(msg.includes("unique") || msg.includes("duplicate") || msg.includes("already booked") ? "이미 예약된 시작 시각입니다." : msg);
    } finally {
      setProBookBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}
      <section className="card">
        <h3 className="text-sm font-semibold">레슨 예약 등록</h3>
        <p className="mt-1 text-xs text-slate-500">
          레슨 시간·<strong>회원 예약 이용 시간</strong>을 저장하면 회원 「예약하기」에 같은 그리드(20분 단위 시작)가
          적용됩니다.
        </p>

        <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div>
            <span className="text-xs font-medium text-slate-700">레슨 시간</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={lessonFamily === "A" ? "btn-secondary text-xs" : "btn-ghost text-xs border border-slate-200"}
                onClick={() => setLessonFamily("A")}
              >
                20·40·60분
              </button>
              <button
                type="button"
                className={lessonFamily === "B" ? "btn-secondary text-xs" : "btn-ghost text-xs border border-slate-200"}
                onClick={() => setLessonFamily("B")}
              >
                30·50분
              </button>
              <button
                type="button"
                className={lessonFamily === "custom" ? "btn-secondary text-xs" : "btn-ghost text-xs border border-slate-200"}
                onClick={() => setLessonFamily("custom")}
              >
                직접입력
              </button>
            </div>
            <div className="mt-2">
              {lessonFamily === "A" ? (
                <select
                  className="input max-w-xs"
                  value={presetDurA}
                  onChange={(e) => setPresetDurA(Number(e.target.value) as 20 | 40 | 60)}
                >
                  <option value={20}>20분</option>
                  <option value={40}>40분</option>
                  <option value={60}>60분</option>
                </select>
              ) : null}
              {lessonFamily === "B" ? (
                <select
                  className="input max-w-xs"
                  value={presetDurB}
                  onChange={(e) => setPresetDurB(Number(e.target.value) as 30 | 50)}
                >
                  <option value={30}>30분</option>
                  <option value={50}>50분</option>
                </select>
              ) : null}
              {lessonFamily === "custom" ? (
                <div className="max-w-xs">
                  <label className="label text-[11px]" htmlFor="custom-dur">
                    레슨 시간 (분) · 10~180
                  </label>
                  <input
                    id="custom-dur"
                    className="input"
                    type="number"
                    min={10}
                    max={180}
                    value={customDurStr}
                    onChange={(e) => setCustomDurStr(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label text-xs" htmlFor="book-win-start">
                회원 예약 이용 시작 (로컬)
              </label>
              <input
                id="book-win-start"
                type="text"
                className="input w-full max-w-[11rem] py-1.5 font-mono"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="05:00"
                value={bookingWindowStart}
                onChange={(e) => setBookingWindowStart(e.target.value.trim())}
                title="예: 05:00"
              />
            </div>
            <div>
              <label className="label text-xs" htmlFor="book-win-end">
                회원 예약 이용 종료 (배타)
              </label>
              <input
                id="book-win-end"
                type="text"
                className="input w-full max-w-[11rem] py-1.5 font-mono"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="24:00"
                value={bookingWindowEndExclusive}
                onChange={(e) => setBookingWindowEndExclusive(e.target.value.trim())}
                title='예: 22:00 또는 하루 종일 24:00 (다음날 자정·배타)'
              />
              <p className="mt-1 text-[10px] text-slate-500">
                <code className="text-[10px]">24:00</code>은 그날 24시간(다음날 00:00 직전까지)입니다.
              </p>
            </div>
          </div>

          {!bookingWindowParsed.valid ? (
            <p className="text-xs text-amber-800">종료 시각은 시작보다 늦어야 합니다.</p>
          ) : null}

          <div className="rounded-md border border-dashed border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-600">
            레슨 <strong>{lessonTimeMinutes}분</strong> · 시작 간격 <strong>{BOOKING_GRID_STEP_FIXED}분(고정)</strong> ·
            회원 시간 <strong>{normalizeTimeHmForInput(bookingWindowStart, DEFAULT_BOOKING_DAY_START)}</strong>
            ~
            <strong>{normalizeTimeHmForInput(bookingWindowEndExclusive, DEFAULT_BOOKING_DAY_END_EXCLUSIVE)}</strong>
          </div>

          <button
            type="button"
            className="btn-primary text-sm"
            disabled={gridSaveBusy}
            onClick={() => void saveBookingGrid()}
          >
            {gridSaveBusy ? "저장 중…" : "레슨 예약 설정 저장"}
          </button>
        </div>
      </section>

      {/* 2주 단위 예약 현황 */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">예약 현황</h3>
            <p className="mt-1 text-xs text-slate-500">
              <strong>{SCHEDULE_OVERVIEW_DAYS}일간</strong> 확정 예약입니다. 비회원/회원 표시 규칙은 동일합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => setWeekStart((w) => addDays(w, -SCHEDULE_OVERVIEW_DAYS))}
            >
              이전 2주
            </button>
            <span className="text-xs font-medium text-slate-600">
              {formatShort(weekStart)} ~ {formatShort(addDays(weekStart, SCHEDULE_OVERVIEW_DAYS - 1))}
            </span>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => setWeekStart((w) => addDays(w, SCHEDULE_OVERVIEW_DAYS))}
            >
              다음 2주
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                const m = startOfWeekMonday(new Date());
                setWeekStart(m);
              }}
            >
              이번 주 시작
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-3 text-xs">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" /> 비회원 예약
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" /> 회원 예약
          </span>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">불러오는 중…</p>
        ) : (
          <div className="mt-4 grid grid-cols-7 gap-2">
            {weekDays.map((day, idx) => (
              <div
                key={day.toISOString()}
                className={`min-h-[120px] rounded-lg border p-2 ${
                  isToday(day) ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 bg-slate-50/30"
                }`}
              >
                <div className="border-b border-slate-200 pb-1 text-center text-xs font-semibold text-slate-700">
                  <div>{WEEKDAY_KO[idx % 7]}</div>
                  <div className="text-[11px] font-normal text-slate-500">{day.getMonth() + 1}/{day.getDate()}</div>
                </div>
                <div className="mt-1 space-y-1.5">
                  {schedulesForDay(day).map((s) => {
                    const member = s.member_id ? memberMap[s.member_id] : null;
                    const isMemberRow = Boolean(s.member_id);
                    const box = isMemberRow
                      ? "border-blue-200 bg-blue-50 text-blue-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900";
                    const title = `${member?.name?.trim() ? `${member.name} · ` : ""}${formatTime24(s.start_time)}–${formatTime24(s.end_time)}`;
                    return (
                      <div key={s.id} className={`rounded border px-1.5 py-1 text-left text-[10px] leading-tight ${box}`} title={title}>
                        <div className="font-semibold">
                          {formatTime24(s.start_time)}–{formatTime24(s.end_time)}
                        </div>
                        <div className={`truncate font-medium ${isMemberRow ? "text-blue-800" : "text-emerald-800"}`}>
                          {!isMemberRow
                            ? "비회원 예약"
                            : member?.name?.trim()
                              ? member.name
                              : member
                                ? `(이름 없음) ${member.email}`
                                : "회원 미지정"}
                        </div>
                        <div className={`text-[9px] ${isMemberRow ? "text-blue-600/80" : "text-emerald-700/90"}`}>
                          {isMemberRow ? "회원 예약" : "비회원 예약"}
                        </div>
                      </div>
                    );
                  })}
                  {schedulesForDay(day).length === 0 ? (
                    <p className="py-2 text-center text-[10px] text-slate-400">—</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading ? (
          <button type="button" className="btn-ghost mt-3 text-xs" onClick={() => void reload()}>
            새로고침
          </button>
        ) : null}
      </section>

      {/* 프로가 대행하는 회원 레슨 예약 */}
      <section className="card">
        <h3 className="text-sm font-semibold">회원 레슨 예약 (프로 등록)</h3>
        <p className="mt-1 text-xs text-slate-500">
          연결된 회원만 선택 가능합니다. <strong>날짜</strong>를 고른 뒤 <strong>시작 시각</strong> 버튼을 누르면 확정 예약이
          됩니다. 회원 이름이 프로필에 있어야 합니다. 위에서 저장한 레슨 시간 · 이용 시간과 같아야 합니다.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pro-book-member">
              회원
            </label>
            <select
              id="pro-book-member"
              className="input"
              value={proBookMemberId}
              onChange={(e) => setProBookMemberId(e.target.value)}
            >
              <option value="">선택…</option>
              {bookingPickList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name?.trim() ? m.name : "(이름 없음)"} · {m.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pro-book-note">
              메모 (선택)
            </label>
            <input
              id="pro-book-note"
              className="input"
              value={proBookNote}
              onChange={(e) => setProBookNote(e.target.value)}
              placeholder="회원 요청·장소 등"
            />
          </div>
        </div>
        {bookingPickList.length === 0 ? (
          <p className="mt-3 text-sm text-amber-800">
            연결된 회원이 없습니다.「등록 회원 명단」에서 이메일 또는 연락처로 먼저 연결하세요.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">날짜 · 시간</span>
              <button type="button" className="btn-ghost text-xs" onClick={() => void reload()} disabled={proBookBusy}>
                새로고침
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setProBookingPickDate((d) => shiftLocalDateInput(d, -1))}
              >
                이전
              </button>
              <input
                type="date"
                className="input w-auto py-1.5"
                value={proBookingPickDate}
                onChange={(e) => setProBookingPickDate(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setProBookingPickDate((d) => shiftLocalDateInput(d, 1))}
              >
                다음
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-600">
              레슨 {lessonTimeMinutes}분 · 시작 간격 {BOOKING_GRID_STEP_FIXED}분(고정) · 회원 시간{" "}
              {normalizeTimeHmForInput(bookingWindowStart, DEFAULT_BOOKING_DAY_START)} ~
              {normalizeTimeHmForInput(bookingWindowEndExclusive, DEFAULT_BOOKING_DAY_END_EXCLUSIVE)}
            </p>
            {loading ? (
              <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
            ) : !bookingWindowParsed.valid ? (
              <p className="mt-3 text-sm text-slate-500">이용 시작·종료 시간을 「레슨 예약 등록」에서 바로잡은 뒤 저장하세요.</p>
            ) : proBookCandidates.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">이 날짜에는 예약 가능한 시간이 없습니다. 다른 날을 눌러 보세요.</p>
            ) : (
              <div className="mt-3">
                <p className="mb-2 text-xs text-slate-500">시작 시각을 누르면 해당 회원으로 예약이 등록됩니다.</p>
                <div className="flex flex-wrap gap-2">
                  {proBookCandidates.map((c) => {
                    const taken = candidateOverlapsBooked(c.start, c.end, bookedSchedulesAhead);
                    return (
                      <button
                        key={c.start + c.slotId}
                        type="button"
                        disabled={proBookBusy || taken}
                        onClick={() => void scheduleForMemberAsPro(c.start, c.end)}
                        className={`min-w-[4.5rem] rounded-lg border px-3 py-2 text-sm font-medium transition ${
                          taken
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                            : "border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                        }`}
                      >
                        {taken ? "마감" : formatTime24(c.start)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* 회원 예약 목록·처리 */}
      <section className="card">
        <h3 className="text-sm font-semibold">회원 예약 처리</h3>
        <p className="mt-1 text-xs text-slate-500">
          확정된 예약을 완료/취소 처리합니다. 완료 직후 또는「회원 프로필」로 저장된 회원 정보를 확인할 수 있습니다.
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
        ) : upcomingSchedules.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">예정된 예약이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {upcomingSchedules.map((s) => {
              const member = s.member_id ? memberMap[s.member_id] : null;
              return (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium text-slate-800">
                      {member?.name?.trim() ? `${member.name} · ` : ""}
                      {formatScheduleRangeLine(s.start_time, s.end_time)}
                    </div>
                    <div className="text-xs text-slate-500">
                      회원:{" "}
                      {member
                        ? member.name?.trim()
                          ? `${member.name} (${member.email})`
                          : `(이름 미입력) ${member.email}`
                        : "(미지정)"}
                      {s.note ? <span className="ml-2">메모: {s.note}</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={statusBadge(s.status)}>{s.status}</span>
                    {s.member_id ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => void loadMemberPeek(s.member_id!)}
                      >
                        회원 프로필
                      </button>
                    ) : null}
                    {s.status === "BOOKED" ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={() => void completeSchedule(s)}
                        >
                          완료 처리
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-xs text-rose-600"
                          onClick={() => void cancelSchedule(s)}
                        >
                          취소
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {peekMemberId ? (
          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-900">회원 프로필 미리보기</span>
              <button type="button" className="btn-ghost text-[10px]" onClick={() => setPeekMemberId(null)}>
                닫기
              </button>
            </div>
            <MemberProfilePreview loading={peekLoading} profile={peekProfile} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayEnd(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function stripTime(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekMonday(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const x = new Date(d);
  x.setDate(d.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatShort(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function statusBadge(status: Schedule["status"]) {
  if (status === "BOOKED") return "badge-emerald";
  if (status === "COMPLETED") return "badge-slate";
  return "badge-rose";
}

