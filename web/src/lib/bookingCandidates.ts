/** 날짜 구간 또는 슬롯 안에서 시작 시각을 step 분 간격으로 잡고 duration 분 레슨 후보를 만듭니다. */

import type { Schedule } from "@/lib/types";

export type SlotLike = { id: string; start_time: string; end_time: string };

export type BookingCandidate = { start: string; end: string; slotId: string };

function ceilToStepMinutesLocal(d: Date, step: number): Date {
  const x = new Date(d.getTime());
  x.setMilliseconds(0);
  const fudge = x.getSeconds() !== 0 || d.getMilliseconds() !== 0 ? 1 : 0;
  x.setSeconds(0);
  const totalMin = x.getHours() * 60 + x.getMinutes() + fudge;
  const snapped = Math.ceil(totalMin / step) * step;
  const hh = Math.floor(snapped / 60) % 24;
  const mm = snapped % 60;
  x.setHours(hh, mm, 0, 0);
  return x;
}

function stripLocalDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addLocalDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function buildBookingCandidates(params: {
  slots: SlotLike[];
  startStepMinutes?: number;
  durationMinutes?: number;
}): BookingCandidate[] {
  const step = Math.min(60, Math.max(5, params.startStepMinutes ?? 10));
  const dur = Math.min(180, Math.max(10, params.durationMinutes ?? 60));
  const stepMs = step * 60 * 1000;
  const durMs = dur * 60 * 1000;
  const seen = new Set<string>();
  const out: BookingCandidate[] = [];

  for (const sl of params.slots) {
    const slotStart = new Date(sl.start_time);
    const slotEnd = new Date(sl.end_time);
    let cur = ceilToStepMinutesLocal(slotStart, step);
    while (cur.getTime() + durMs <= slotEnd.getTime()) {
      if (cur.getTime() >= slotStart.getTime()) {
        const iso = cur.toISOString();
        if (!seen.has(iso)) {
          seen.add(iso);
          out.push({
            start: iso,
            end: new Date(cur.getTime() + durMs).toISOString(),
            slotId: sl.id,
          });
        }
      }
      cur = new Date(cur.getTime() + stepMs);
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

/** 프로가 시간 블록을 등록하지 않아도, 매일 같은 영업 시간대로 후보 생성 (회원 예약 표용) */
/** `YYYY-MM-DD` → 해당 날짜 자정(로컬) */
export function localDayFromDateInput(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) {
    const x = new Date();
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
  }
  return new Date(y, m - 1, d);
}

export function formatLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function shiftLocalDateInput(yyyyMmDd: string, deltaDays: number): string {
  const x = localDayFromDateInput(yyyyMmDd);
  x.setDate(x.getDate() + deltaDays);
  return formatLocalDateInput(x);
}

/** 로컬 시간 `HH:mm`(또는 종료 한정 `24:00` = 다음날 자정 직전까지) */
export function parseTimeInputHm(value: string): { hour: number; minute: number } | null {
  const t = value.trim();
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour === 24 && minute === 0) return { hour: 24, minute: 0 };
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function formatBookingHm(p: { hour: number; minute: number }): string {
  if (p.hour === 24 && p.minute === 0) return "24:00";
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** 하루 이용 종료(배타)를 분 단위로. `24:00` → 1440(다음날 00:00 직전까지) */
export function bookingDayEndExclusiveToTotalMinutes(end: { hour: number; minute: number }): number {
  if (end.hour === 24 && end.minute === 0) return 24 * 60;
  return end.hour * 60 + end.minute;
}

/** 회원 예약 창: 시작은 00:00~23:59, 종료는 그보다 늦어야 하며 `24:00`만 허용(분은 0) */
export function isValidBookingDayWindow(
  start: { hour: number; minute: number } | null,
  end: { hour: number; minute: number } | null,
): boolean {
  if (!start || !end) return false;
  if (start.hour === 24) return false;
  const startTotal = start.hour * 60 + start.minute;
  if (end.hour === 24) return end.minute === 0 && startTotal < 24 * 60;
  return bookingDayEndExclusiveToTotalMinutes(end) > startTotal;
}

/** DB·수기 입력을 표시·저장용 `HH:mm` 또는 `24:00`으로 맞춤 */
export function normalizeTimeHmForInput(value: string | null | undefined, fallback: string): string {
  const p = parseTimeInputHm((value ?? "").trim());
  if (p) return formatBookingHm(p);
  const fb = parseTimeInputHm(fallback.trim());
  if (fb) return formatBookingHm(fb);
  return "00:00";
}

export function buildCalendarBookingCandidates(opts: {
  /** 달력의 첫 날(로컬 자정 기준 포함) */
  rangeStartInclusive: Date;
  /** 며칠치 */
  days: number;
  /** 하루 시작 시 (예: 8 → 08:00) */
  dayStartHour: number;
  /** `dayStartHour`와 함께 쓰는 분 (기본 0) */
  dayStartMinute?: number;
  /** 하루 종료(배타). `24`, `0` 분이면 다음날 00:00까지 */
  dayEndExclusiveHour: number;
  /** 종료 시각의 분 (기본 0) */
  dayEndExclusiveMinute?: number;
  startStepMinutes: number;
  durationMinutes: number;
  now?: Date;
}): BookingCandidate[] {
  const now = opts.now ?? new Date();
  const startMin = Math.min(59, Math.max(0, opts.dayStartMinute ?? 0));
  const endMin = Math.min(59, Math.max(0, opts.dayEndExclusiveMinute ?? 0));
  const slots: SlotLike[] = [];
  let dayCursor = stripLocalDate(opts.rangeStartInclusive);
  for (let i = 0; i < opts.days; i++) {
    const day = addLocalDays(dayCursor, i);
    const spanStart = new Date(day);
    spanStart.setHours(opts.dayStartHour, startMin, 0, 0);
    let spanEnd: Date;
    if (opts.dayEndExclusiveHour === 24 && endMin === 0) {
      spanEnd = addLocalDays(stripLocalDate(day), 1);
      spanEnd.setHours(0, 0, 0, 0);
    } else {
      spanEnd = new Date(day);
      spanEnd.setHours(opts.dayEndExclusiveHour, endMin, 0, 0);
    }
    if (spanEnd.getTime() <= spanStart.getTime()) continue;
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    slots.push({
      id: `cal-${y}-${m}-${d}`,
      start_time: spanStart.toISOString(),
      end_time: spanEnd.toISOString(),
    });
  }
  return buildBookingCandidates({
    slots,
    startStepMinutes: opts.startStepMinutes,
    durationMinutes: opts.durationMinutes,
  }).filter((c) => new Date(c.start).getTime() >= now.getTime());
}

/** BOOKED 레슨과 시간 겹침 */
export function candidateOverlapsBooked(
  startIso: string,
  endIso: string,
  booked: Pick<Schedule, "start_time" | "end_time" | "status">[],
): boolean {
  const cs = new Date(startIso).getTime();
  const ce = new Date(endIso).getTime();
  for (const b of booked) {
    if (b.status !== "BOOKED") continue;
    const bs = new Date(b.start_time).getTime();
    const be = new Date(b.end_time).getTime();
    if (cs < be && ce > bs) return true;
  }
  return false;
}
