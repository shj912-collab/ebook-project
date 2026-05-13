/** 레슨 코멘트 — 섹션 단위 작성·저장(단일 텍스트로 직렬화) */

export type FeedbackCommentKey =
  | "member_name"
  | "lesson_date"
  | "goal_today"
  | "before_issues"
  | "cause_one_line"
  | "solution_checklist"
  | "after_comment"
  | "homework";

export const FEEDBACK_COMMENT_SECTIONS: ReadonlyArray<{
  key: FeedbackCommentKey;
  heading: string;
  placeholder: string;
  rows?: number;
}> = [
  { key: "member_name", heading: "1. 회원 이름", placeholder: "회원 이름", rows: 2 },
  { key: "lesson_date", heading: "2. 레슨 날짜", placeholder: "예: 2026-05-10", rows: 2 },
  { key: "goal_today", heading: "3. 오늘의 목표", placeholder: "이번 레슨에서 집중할 목표", rows: 3 },
  { key: "before_issues", heading: "4. 비포 문제점 3가지", placeholder: "스윙·셋업 등 문제점을 세 가지로 적어 주세요", rows: 5 },
  { key: "cause_one_line", heading: "5. 원인 분석 (한 줄로 설명)", placeholder: "원인을 한 줄로 요약", rows: 2 },
  { key: "solution_checklist", heading: "6. 교정 솔루션", placeholder: "교정 포인트·실행 방법", rows: 5 },
  { key: "after_comment", heading: "7. 애프터 코멘트 정리", placeholder: "교정 후 느낌·개선점", rows: 4 },
  { key: "homework", heading: "8. 오늘의 숙제", placeholder: "연습 과제·다음 레슨까지 할 일", rows: 3 },
];

export type FeedbackSectionsState = Record<FeedbackCommentKey, string>;

export function emptyFeedbackSections(): FeedbackSectionsState {
  return Object.fromEntries(FEEDBACK_COMMENT_SECTIONS.map((s) => [s.key, ""])) as FeedbackSectionsState;
}

/** DB `feedback_text`로 저장용 */
export function composeFeedbackComments(parts: FeedbackSectionsState): string {
  const blocks = FEEDBACK_COMMENT_SECTIONS.map(({ key, heading }) => {
    const body = (parts[key] ?? "").trim();
    if (!body) return null;
    return `${heading}\n${body}`;
  }).filter((v): v is string => Boolean(v));

  return blocks.join("\n\n");
}

export function hasAnyFeedbackText(parts: FeedbackSectionsState): boolean {
  return composeFeedbackComments(parts).trim().length > 0;
}

/** 목록 표시용(구 형식 무제목 텍스트 포함) */
export function splitFeedbackCommentsForDisplay(text: string | null): { heading: string; body: string }[] {
  if (!text?.trim()) return [];
  const t = text.trim();
  if (!/^\d+\.\s+/m.test(t)) return [{ heading: "레슨 코멘트", body: t }];
  const chunks = t.split(/\n(?=\d+\.\s+)/);
  return chunks.map((chunk) => {
    const trimmed = chunk.trim();
    const nl = trimmed.indexOf("\n");
    if (nl === -1) return { heading: trimmed, body: "" };
    return { heading: trimmed.slice(0, nl).trim(), body: trimmed.slice(nl + 1).trim() };
  });
}
