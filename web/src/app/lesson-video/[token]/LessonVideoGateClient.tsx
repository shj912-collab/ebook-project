"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type RpcResult = {
  ok?: boolean;
  video_url?: string;
  error?: string;
};

const errMsg: Record<string, string> = {
  invalid_input: "토큰이 없거나 숫자 4자리 이상을 입력해 주세요.",
  not_found: "영상을 찾을 수 없습니다. 링크를 확인해 주세요.",
  phone_not_set: "회원 프로필에 연락처가 없습니다. 앱에서「내 프로필」에 휴대폰 번호를 저장한 뒤 다시 시도해 주세요.",
  wrong_pin: "번호가 일치하지 않습니다. 저장한 연락처의 끝 4자리를 입력해 주세요.",
};

type Props = { token: string };

export function LessonVideoGateClient({ token }: Props) {
  const [pin, setPin] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const unlock = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: rpcErr } = await supabase.rpc("verify_lesson_video_access", {
        p_token: token,
        p_pin: pin,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      const row = data as RpcResult | RpcResult[] | string | null;
      let json: RpcResult | null = null;
      if (typeof row === "string") {
        try {
          json = JSON.parse(row) as RpcResult;
        } catch {
          json = null;
        }
      } else if (Array.isArray(row)) {
        json = row[0] ?? null;
      } else {
        json = row;
      }
      if (!json || typeof json !== "object") {
        setError("응답을 해석할 수 없습니다.");
        return;
      }
      if (json.ok && typeof json.video_url === "string" && json.video_url.trim()) {
        setVideoUrl(json.video_url.trim());
        return;
      }
      const code = typeof json.error === "string" ? json.error : "wrong_pin";
      setError(errMsg[code] ?? "확인할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (videoUrl) {
    return (
      <div className="space-y-4">
        <p className="text-center text-sm font-medium text-slate-700">영상 재생</p>
        <video className="w-full max-w-lg rounded-xl border border-slate-200 bg-black shadow-md" controls src={videoUrl} />
        <p className="text-center text-[11px] text-slate-500">
          링크는 타인에게 공유하지 마세요. 로그인 없이 재생됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="label" htmlFor="pin">
        연락처 끝 4자리
      </label>
      <p className="text-[11px] text-slate-500">
        골프싱크「내 프로필」에 저장한 휴대폰 번호의 <strong>끝 네 자리</strong>를 입력하세요. (숫자만)
      </p>
      <input
        id="pin"
        className="input max-w-xs tracking-widest"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={16}
        placeholder="예: 5678"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") void unlock();
        }}
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button type="button" className="btn-primary" disabled={loading || pin.replace(/\D/g, "").length < 4} onClick={() => void unlock()}>
        {loading ? "확인 중…" : "영상 보기"}
      </button>
    </div>
  );
}
