/** 다쳤던 경험 체크 — DB injury_checklist 키와 매칭 */
export const INJURY_OPTIONS = [
  { key: "shoulder", label: "어깨" },
  { key: "elbow", label: "팔꿈치" },
  { key: "wrist", label: "손목" },
  { key: "back", label: "허리" },
  { key: "knee", label: "무릎" },
  { key: "ankle", label: "발목" },
  { key: "neck", label: "목" },
  { key: "other", label: "기타" },
  { key: "none", label: "해당 없음" },
] as const;

export function injuryLabel(key: string): string {
  const f = INJURY_OPTIONS.find((o) => o.key === key);
  return f?.label ?? key;
}
