/**
 * PRD §5 페이지 목록 및 화면 구조 — 역할별 대시보드 탭 순서·라벨
 * 단일 소스로 유지해 UI와 문서를 일치시킵니다.
 */

export const PRO_DASHBOARD_TABS = [
  { id: "today", label: "오늘" },
  { id: "schedule", label: "레슨 예약 등록" },
  { id: "members", label: "등록 회원 명단" },
  { id: "lessons", label: "레슨 코멘트" },
  { id: "remote", label: "원포인트" },
] as const;

export type ProTabId = (typeof PRO_DASHBOARD_TABS)[number]["id"];

/** PRD §5 변형: MEMBER 탭 — 오늘 → 내 프로필 → 예약하기 → 레슨 코멘트 → 원포인트 요청 */
export const MEMBER_DASHBOARD_TABS = [
  { id: "today", label: "오늘" },
  { id: "profile", label: "내 프로필" },
  { id: "booking", label: "예약하기" },
  { id: "history", label: "레슨 코멘트" },
  { id: "remote", label: "원포인트 요청" },
] as const;

export type MemberTabId = (typeof MEMBER_DASHBOARD_TABS)[number]["id"];
