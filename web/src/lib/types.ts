export type UserRole = "PRO" | "MEMBER";
export type ScheduleStatus = "BOOKED" | "COMPLETED" | "CANCELED";
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";

export type AppUser = {
  id: string;
  email: string;
  role: UserRole | null;
  name: string | null;
  /** 회원 연락처 (프로 명단·전화 연결용) */
  phone?: string | null;
  profile_img: string | null;
  created_at: string;
};

export type ProProfile = {
  id: string;
  user_id: string;
  bio: string | null;
  /** 레거시·호환용 (원포인트 플랜 A 금액과 동기화 권장) */
  remote_price: number;
  /** 원포인트 플랜 A 금액 */
  remote_price_30m?: number;
  /** 원포인트 플랜 B 금액 */
  remote_price_60m?: number;
  /** 원포인트 플랜 A 레슨 시간(분) */
  remote_plan_a_minutes?: number;
  /** 원포인트 플랜 B 레슨 시간(분) */
  remote_plan_b_minutes?: number;
  response_sla_hours: number;
  /** 예약 시작 후보 간격(분) 5~60 */
  booking_start_step_minutes?: number;
  /** 한 회 레슨 길이(분) — 20·40·60 / 30·50 또는 수기 */
  booking_lesson_duration_minutes?: number;
  /** 회원 예약 시간표 시작(로컬 HH:MM) */
  booking_day_start_local?: string | null;
  /** 회원 예약 종료 배타(로컬 HH:MM). `24:00`이면 그날 24시간(다음날 00:00 직전까지) */
  booking_day_end_exclusive_local?: string | null;
  created_at: string;
};

/** 회원이 입력하는 신체·실력 프로필 (프로는 연결된 회원만 조회) */
export type MemberProfile = {
  user_id: string;
  age: number | null;
  career_years: number | null;
  lesson_count_reported: number | null;
  injury_checklist: string[];
  other_sports: string | null;
  average_score: number | null;
  field_rounds_per_month: number | null;
  updated_at: string;
};

export type AvailableSlot = {
  id: string;
  pro_id: string;
  start_time: string;
  end_time: string;
  recurrence_rule: string | null;
  is_open: boolean;
  created_at: string;
};

export type Schedule = {
  id: string;
  pro_id: string;
  member_id: string | null;
  start_time: string;
  end_time: string;
  status: ScheduleStatus;
  note: string | null;
  created_at: string;
};

export type LessonLogSourceKind = "schedule" | "remote";

export type LessonLog = {
  id: string;
  schedule_id: string | null;
  remote_request_id?: string | null;
  source_kind?: LessonLogSourceKind;
  pro_id: string;
  member_id: string | null;
  video_url: string | null;
  /** QR·공개 URL(`/lesson-video/{token}`)용; 연락처 끝 4자리 검증 후 재생 */
  video_access_token?: string | null;
  video_asset_id: string | null;
  feedback_text: string | null;
  voice_note_url: string | null;
  transcript_text: string | null;
  /** 이번 레슨에서만 참고하는 특이사항(부상·집중 포인트 등) */
  member_notes?: string | null;
  created_at: string;
};

/** 프로가 회원별로 유지하는 공통 메모(매 레슨 코멘트 작성 화면에서 이어짐) */
export type ProMemberMemo = {
  pro_id: string;
  member_id: string;
  notes: string;
  updated_at: string;
};

export type RemotePricingTier = "30m" | "60m";

export type RemoteRequest = {
  id: string;
  member_id: string;
  pro_id: string;
  video_url: string | null;
  request_note: string | null;
  pricing_tier?: RemotePricingTier;
  /** 요청 시 선택한 레슨 시간(분) */
  lesson_minutes_quoted?: number | null;
  amount_quoted?: number | null;
  payment_status: PaymentStatus;
  payment_id: string | null;
  feedback_id: string | null;
  created_at: string;
  responded_at: string | null;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function formatKRW(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

/** 플랜 A/B = 기존 DB 값 pricing_tier 30m / 60m */
export function remotePlanQuote(
  profile: ProProfile | null | undefined,
  tier: RemotePricingTier,
): { minutes: number; amount: number } {
  const aMin = profile?.remote_plan_a_minutes ?? 30;
  const bMin = profile?.remote_plan_b_minutes ?? 60;
  const aPrice = profile?.remote_price_30m ?? profile?.remote_price ?? 30000;
  const base = profile?.remote_price ?? aPrice;
  const bPrice = profile?.remote_price_60m ?? Math.max(base * 2, aPrice + 10000);
  return tier === "30m" ? { minutes: aMin, amount: aPrice } : { minutes: bMin, amount: bPrice };
}

export function remoteTierAmountKrw(profile: ProProfile | null | undefined, tier: RemotePricingTier): number {
  return remotePlanQuote(profile, tier).amount;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** 24시간제 고정 HH:mm (캘린더·슬롯 표시용) */
export function formatTime24(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 로컬 월·일만 `05. 14.` 형식 */
export function formatMonthDayDot(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}.`;
}

/** 예약 요약 한 줄: 날짜 + 24시간제 시작–종료 (오전/오후 혼용 방지) */
export function formatScheduleRangeLine(startIso: string, endIso: string): string {
  return `${formatMonthDayDot(startIso)} ${formatTime24(startIso)} – ${formatTime24(endIso)}`;
}
