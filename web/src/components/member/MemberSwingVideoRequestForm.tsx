"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, ProProfile, RemotePricingTier } from "@/lib/types";
import { formatKRW, remotePlanQuote } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";

const LESSON_MEDIA_BUCKET = "lesson-media";

type Props = {
  user: AppUser;
  heading?: string;
  description?: string;
  onSubmitted?: () => void | Promise<void>;
  /** true면 플랜·금액·결제 버튼 문구 없음 (레슨 코멘트 등) */
  omitPaymentPricingUi?: boolean;
};

type ProOption = { id: string; name: string | null; email: string };

export function MemberSwingVideoRequestForm({
  user,
  heading = "원포인트 레슨 요청",
  description = "프로에게 스윙 영상과 메모를 보냅니다. 업로드하거나 영상 주소(URL)를 넣을 수 있습니다. 플랜 선택 후 전송하면 프로가 레슨 코멘트로 회신합니다.",
  onSubmitted,
  omitPaymentPricingUi = false,
}: Props) {
  const supabase = getSupabaseBrowserClient();
  const [pros, setPros] = useState<ProOption[]>([]);
  const [proProfiles, setProProfiles] = useState<Record<string, ProProfile>>({});
  const [selectedPro, setSelectedPro] = useState<string>("");
  const [tier, setTier] = useState<RemotePricingTier>("30m");
  const [videoUrl, setVideoUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPros = useCallback(async () => {
    try {
      const [proList, proProfs] = await Promise.all([
        supabase.from("users").select("id, name, email").eq("role", "PRO"),
        supabase.from("pro_profiles").select("*"),
      ]);
      if (proList.error) throw proList.error;
      if (proProfs.error) throw proProfs.error;

      const proListData = (proList.data as ProOption[]) ?? [];
      setPros(proListData);

      const profMap: Record<string, ProProfile> = {};
      for (const p of (proProfs.data as ProProfile[]) ?? []) profMap[p.user_id] = p;
      setProProfiles(profMap);

      setSelectedPro((prev) => {
        if (proListData.length === 0) return "";
        if (prev && proListData.some((p) => p.id === prev)) return prev;
        return proListData[0].id;
      });
    } catch (e) {
      setError(toUserMessage(e));
    }
  }, [supabase]);

  useEffect(() => {
    void loadPros();
  }, [loadPros]);

  const uploadSwingFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const safe = file.name.replace(/[^\w.\-가-힣]/g, "_");
      const path = `${user.id}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from(LESSON_MEDIA_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from(LESSON_MEDIA_BUCKET).getPublicUrl(path);
      setVideoUrl(publicUrl);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!selectedPro) throw new Error("프로를 선택하세요.");
      if (!videoUrl.trim()) throw new Error("스윙 영상 파일을 올리거나 영상 URL을 입력하세요.");
      const profile = proProfiles[selectedPro];
      const effectiveTier = omitPaymentPricingUi ? "30m" : tier;
      const quote = remotePlanQuote(profile, effectiveTier);
      const amount = quote.amount;

      const { data: req, error: rErr } = await supabase
        .from("remote_requests")
        .insert({
          member_id: user.id,
          pro_id: selectedPro,
          video_url: videoUrl.trim(),
          request_note: note.trim() || null,
          pricing_tier: effectiveTier,
          lesson_minutes_quoted: quote.minutes,
          amount_quoted: amount,
          payment_status: "PAID",
          payment_id: omitPaymentPricingUi ? null : `mock_${Date.now()}`,
        })
        .select("*")
        .single();
      if (rErr) throw rErr;

      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "REMOTE_REQUEST_SENT",
        payload: omitPaymentPricingUi
          ? { request_id: req.id, pro_id: selectedPro, source: "lesson_comment" }
          : { request_id: req.id, pro_id: selectedPro, amount, pricing_tier: effectiveTier },
      });

      setVideoUrl("");
      setNote("");
      await onSubmitted?.();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const profile = selectedPro ? proProfiles[selectedPro] : undefined;
  const quoteA = remotePlanQuote(profile, "30m");
  const quoteB = remotePlanQuote(profile, "60m");

  return (
    <section className="card">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-3 grid gap-3">
        <div>
          <label className="label" htmlFor="sv-pro">
            프로 선택
          </label>
          <select id="sv-pro" className="input" value={selectedPro} onChange={(e) => setSelectedPro(e.target.value)}>
            {pros.length === 0 ? <option value="">(등록된 프로 없음)</option> : null}
            {pros.map((p) => {
              const pp = proProfiles[p.id];
              const qa = remotePlanQuote(pp, "30m");
              const qb = remotePlanQuote(pp, "60m");
              return (
                <option key={p.id} value={p.id}>
                  {omitPaymentPricingUi
                    ? `${p.name ?? p.email}`
                    : `${p.name ?? p.email} · A ${qa.minutes}분 ${formatKRW(qa.amount)} / B ${qb.minutes}분 ${formatKRW(qb.amount)}`}
                </option>
              );
            })}
          </select>
        </div>
        {!omitPaymentPricingUi && profile ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <span className="font-medium">선택 프로 플랜 · </span>A {quoteA.minutes}분 {formatKRW(quoteA.amount)}, B{" "}
            {quoteB.minutes}분 {formatKRW(quoteB.amount)} · 응답 SLA {profile.response_sla_hours}시간
          </div>
        ) : null}
        {!omitPaymentPricingUi ? (
          <div>
            <span className="label">플랜</span>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                className={tier === "30m" ? "btn-secondary text-xs" : "btn-ghost text-xs border border-slate-200"}
                onClick={() => setTier("30m")}
              >
                플랜 A · {quoteA.minutes}분 ({formatKRW(quoteA.amount)})
              </button>
              <button
                type="button"
                className={tier === "60m" ? "btn-secondary text-xs" : "btn-ghost text-xs border border-slate-200"}
                onClick={() => setTier("60m")}
              >
                플랜 B · {quoteB.minutes}분 ({formatKRW(quoteB.amount)})
              </button>
            </div>
          </div>
        ) : profile ? (
          <p className="text-[11px] text-slate-500">
            응답은 프로가 SLA 기준으로 진행합니다(약 {profile.response_sla_hours}시간).
          </p>
        ) : null}
        <div>
          <span className="label">스윙 영상 파일</span>
          <input
            type="file"
            accept="video/*"
            className="mt-1 block w-full text-sm text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-sm"
            disabled={uploading || busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadSwingFile(f);
              e.target.value = "";
            }}
          />
          {uploading ? <p className="mt-1 text-xs text-slate-500">영상 업로드 중…</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="sv-video-url">
            또는 영상 URL
          </label>
          <input
            id="sv-video-url"
            className="input"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="업로드하면 자동으로 채워지거나, 직접 https://… 를 입력"
          />
        </div>
        <div>
          <label className="label" htmlFor="sv-note">
            요청 메모
          </label>
          <textarea
            id="sv-note"
            className="input min-h-20"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="확인 받고 싶은 부분을 적어주세요"
          />
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <button type="button" className="btn-primary" disabled={busy || uploading} onClick={() => void submit()}>
          {busy
            ? "전송 중…"
            : omitPaymentPricingUi
              ? "코멘트 요청 보내기"
              : `결제 후 전송 (모의) · ${formatKRW(tier === "30m" ? quoteA.amount : quoteB.amount)}`}
        </button>
      </div>
    </section>
  );
}
