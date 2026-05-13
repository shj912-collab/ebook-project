"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";

type Props = {
  userId: string;
  email: string;
  onComplete: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
};

export function Onboarding({ userId, email, onComplete, onSignOut }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [role, setRole] = useState<UserRole>("MEMBER");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [remotePrice, setRemotePrice] = useState(30000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!name.trim()) {
        throw new Error("이름을 입력하세요.");
      }
      const { error: uErr } = await supabase
        .from("users")
        .upsert({
          id: userId,
          email,
          role,
          name: name.trim(),
        });
      if (uErr) throw uErr;

      if (role === "PRO") {
        const { error: pErr } = await supabase
          .from("pro_profiles")
          .upsert(
            {
              user_id: userId,
              bio: bio.trim() || null,
              remote_price: Number.isFinite(remotePrice) ? Math.max(0, remotePrice) : 30000,
              response_sla_hours: 48,
            },
            { onConflict: "user_id" },
          );
        if (pErr) throw pErr;
      }

      await onComplete();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mx-auto max-w-xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">시작하기</h2>
          <p className="mt-1 text-xs text-slate-500">{email}</p>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={() => void onSignOut()}>
          로그아웃
        </button>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        역할을 선택해 주세요. 프로는 레슨 일정과 레슨 코멘트를, 회원은 예약과 피드백 열람이 가능합니다.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <RoleCard
          active={role === "MEMBER"}
          title="회원으로 시작"
          desc="레슨 예약, 영상 피드백 열람, 원포인트 요청"
          onClick={() => setRole("MEMBER")}
        />
        <RoleCard
          active={role === "PRO"}
          title="프로로 시작"
          desc="예약 시간표 설정, 레슨 코멘트 작성, 원포인트 응답"
          onClick={() => setRole("PRO")}
        />
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="name">이름 / 닉네임 (필수)</label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={role === "PRO" ? "예: 김프로" : "예: 홍길동"}
            required
            aria-required="true"
          />
        </div>
        {role === "PRO" ? (
          <>
            <div>
              <label className="label" htmlFor="bio">소개 (선택)</label>
              <textarea
                id="bio"
                className="input min-h-20"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="레슨 스타일, 경력 등"
              />
            </div>
            <div>
              <label className="label" htmlFor="remote_price">원포인트 단가 (원)</label>
              <input
                id="remote_price"
                className="input"
                type="number"
                min={0}
                step={1000}
                value={remotePrice}
                onChange={(e) => setRemotePrice(Number(e.target.value))}
              />
            </div>
          </>
        ) : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void submit()}>
          {busy ? "저장 중…" : "시작하기"}
        </button>
      </div>
    </section>
  );
}

function RoleCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition ${
        active
          ? "border-emerald-500 bg-emerald-50"
          : "border-slate-200 bg-white hover:border-emerald-300"
      }`}
    >
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-600">{desc}</div>
    </button>
  );
}
