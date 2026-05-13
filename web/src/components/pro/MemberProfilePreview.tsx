"use client";

import type { MemberProfile } from "@/lib/types";
import { formatDateTime } from "@/lib/types";
import { injuryLabel } from "@/lib/memberProfileConstants";

type Props = {
  loading?: boolean;
  profile: MemberProfile | null;
};

export function MemberProfilePreview({ loading, profile }: Props) {
  if (loading) {
    return <p className="text-xs text-slate-500">회원 프로필 불러오는 중…</p>;
  }
  if (!profile) {
    return (
      <p className="text-xs text-slate-500">
        저장된 회원 프로필이 없습니다. 회원이「내 프로필」에서 입력하면 표시됩니다.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      <div>
        <dt className="text-slate-500">나이</dt>
        <dd className="font-medium text-slate-800">{profile.age ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-slate-500">구력</dt>
        <dd className="font-medium text-slate-800">
          {profile.career_years != null ? `${profile.career_years}년` : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">레슨 횟수(자기입력)</dt>
        <dd className="font-medium text-slate-800">{profile.lesson_count_reported ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-slate-500">평균 스코어</dt>
        <dd className="font-medium text-slate-800">{profile.average_score ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-slate-500">월 필드</dt>
        <dd className="font-medium text-slate-800">
          {profile.field_rounds_per_month != null ? `${profile.field_rounds_per_month}회/월` : "—"}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-slate-500">부상 체크</dt>
        <dd className="font-medium text-slate-800">
          {profile.injury_checklist?.length
            ? profile.injury_checklist.map((k) => injuryLabel(k)).join(", ")
            : "—"}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-slate-500">다른 운동</dt>
        <dd className="font-medium text-slate-800">{profile.other_sports ?? "—"}</dd>
      </div>
      <div className="sm:col-span-2 text-[10px] text-slate-400">수정: {formatDateTime(profile.updated_at)}</div>
    </dl>
  );
}
