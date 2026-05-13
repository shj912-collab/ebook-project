"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, LessonLog, MemberProfile, ProMemberMemo, RemoteRequest, Schedule } from "@/lib/types";
import { formatDateTime, formatKRW } from "@/lib/types";
import { MemberProfilePreview } from "./MemberProfilePreview";
import {
  FEEDBACK_COMMENT_SECTIONS,
  composeFeedbackComments,
  emptyFeedbackSections,
  splitFeedbackCommentsForDisplay,
  type FeedbackSectionsState,
} from "@/lib/feedbackCommentSections";
import { toUserMessage } from "@/lib/formatError";
import { isBrowserSpeechRecognitionAvailable, startKoContinuousRecognition } from "@/lib/browserSpeechRecognition";
import { getPublicLessonVideoPageUrl, newVideoAccessToken } from "@/lib/lessonVideoPublic";
import { VideoQrBlock } from "@/components/lesson/VideoQrBlock";

type Props = { user: AppUser };

type DiaryTarget = "schedule" | "remote";

const BUCKET = "lesson-media";

function formatLessonDateLabel(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function logKindLabel(l: LessonLog): "회원" | "원포인트" {
  if (l.source_kind === "remote" || (l.remote_request_id && !l.schedule_id)) return "원포인트";
  return "회원";
}

export function ProLessonsPanel({ user }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [completedSchedules, setCompletedSchedules] = useState<Schedule[]>([]);
  const [remotePending, setRemotePending] = useState<RemoteRequest[]>([]);
  const [logs, setLogs] = useState<LessonLog[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, { name: string | null; email: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [diaryTarget, setDiaryTarget] = useState<DiaryTarget>("schedule");

  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [selectedRemoteId, setSelectedRemoteId] = useState<string>("");
  const [feedbackSections, setFeedbackSections] = useState<FeedbackSectionsState>(() => emptyFeedbackSections());
  const [videoUrl, setVideoUrl] = useState("");
  const [voiceNoteUrl, setVoiceNoteUrl] = useState("");
  /** 이번 레슨만의 특이사항 */
  const [lessonMemberNotes, setLessonMemberNotes] = useState("");
  /** 프로–회원 공통 메모 (DB) */
  const [persistentMemo, setPersistentMemo] = useState("");
  const [memoLoaded, setMemoLoaded] = useState(false);
  const [lessonCount, setLessonCount] = useState<number | null>(null);

  const [peekProfile, setPeekProfile] = useState<MemberProfile | null>(null);
  const [peekLoading, setPeekLoading] = useState(false);

  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sttListening, setSttListening] = useState(false);
  const [sttInterim, setSttInterim] = useState("");
  const sttControlRef = useRef<{ stop: () => void } | null>(null);
  const lastFeedbackPrefillKey = useRef<string>("");

  useEffect(() => {
    return () => {
      sttControlRef.current?.stop();
      sttControlRef.current = null;
    };
  }, []);

  const appendTranscriptToHomework = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setFeedbackSections((prev) => {
      const cur = (prev.homework ?? "").trim();
      return { ...prev, homework: cur ? `${cur}\n${t}` : t };
    });
  }, []);

  const toggleSpeechToHomework = useCallback(() => {
    if (sttListening) {
      sttControlRef.current?.stop();
      sttControlRef.current = null;
      setSttListening(false);
      setSttInterim("");
      return;
    }
    setError(null);
    setSttInterim("");
    const ctrl = startKoContinuousRecognition({
      onFinal: (txt) => {
        appendTranscriptToHomework(txt);
        setSttInterim("");
      },
      onInterim: (txt) => setSttInterim(txt),
      onError: (msg) => {
        setError(msg);
        setSttListening(false);
        setSttInterim("");
        sttControlRef.current = null;
      },
      onEnd: () => {
        setSttListening(false);
        setSttInterim("");
        sttControlRef.current = null;
      },
    });
    if (!ctrl) return;
    sttControlRef.current = ctrl;
    setSttListening(true);
  }, [appendTranscriptToHomework, sttListening]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sc, rem, lg] = await Promise.all([
        supabase
          .from("schedules")
          .select("*")
          .eq("pro_id", user.id)
          .eq("status", "COMPLETED")
          .order("start_time", { ascending: false })
          .limit(30),
        supabase
          .from("remote_requests")
          .select("*")
          .eq("pro_id", user.id)
          .eq("payment_status", "PAID")
          .is("feedback_id", null)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("lesson_logs").select("*").eq("pro_id", user.id).order("created_at", { ascending: false }).limit(30),
      ]);
      if (sc.error) throw sc.error;
      if (rem.error) throw rem.error;
      if (lg.error) throw lg.error;

      const schedulesData = (sc.data as Schedule[]) ?? [];
      const remoteRows = (rem.data as RemoteRequest[]) ?? [];
      const logsData = (lg.data as LessonLog[]) ?? [];
      setCompletedSchedules(schedulesData);
      setRemotePending(remoteRows);
      setLogs(logsData);

      const memberIds = Array.from(
        new Set(
          [...schedulesData.map((s) => s.member_id), ...logsData.map((l) => l.member_id), ...remoteRows.map((r) => r.member_id)].filter(
            (v): v is string => Boolean(v),
          ),
        ),
      );
      if (memberIds.length > 0) {
        const { data, error: e } = await supabase.from("users").select("id, name, email").in("id", memberIds);
        if (e) throw e;
        const map: Record<string, { name: string | null; email: string }> = {};
        for (const u of (data as { id: string; name: string | null; email: string }[]) ?? []) {
          map[u.id] = { name: u.name, email: u.email };
        }
        setMemberMap(map);
      } else {
        setMemberMap({});
      }
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setSelectedScheduleId("");
    setSelectedRemoteId("");
    setPeekProfile(null);
    setFeedbackSections(emptyFeedbackSections());
    lastFeedbackPrefillKey.current = "";
  }, [diaryTarget]);

  useEffect(() => {
    const key = `${diaryTarget}|${diaryTarget === "schedule" ? selectedScheduleId : selectedRemoteId}`;
    if (diaryTarget === "schedule") {
      if (!selectedScheduleId) {
        lastFeedbackPrefillKey.current = "";
        setFeedbackSections(emptyFeedbackSections());
        return;
      }
      const sched = completedSchedules.find((s) => s.id === selectedScheduleId);
      if (!sched?.member_id) return;
      const nm =
        memberMap[sched.member_id]?.name?.trim() || memberMap[sched.member_id]?.email?.trim() || "";
      const dl = formatLessonDateLabel(sched.start_time);
      if (lastFeedbackPrefillKey.current !== key) {
        lastFeedbackPrefillKey.current = key;
        setFeedbackSections({
          ...emptyFeedbackSections(),
          member_name: nm,
          lesson_date: dl,
        });
      }
    } else {
      if (!selectedRemoteId) {
        lastFeedbackPrefillKey.current = "";
        setFeedbackSections(emptyFeedbackSections());
        return;
      }
      const req = remotePending.find((r) => r.id === selectedRemoteId);
      if (!req) return;
      const nm =
        memberMap[req.member_id]?.name?.trim() || memberMap[req.member_id]?.email?.trim() || "";
      const dl = formatLessonDateLabel(req.created_at);
      if (lastFeedbackPrefillKey.current !== key) {
        lastFeedbackPrefillKey.current = key;
        setFeedbackSections({
          ...emptyFeedbackSections(),
          member_name: nm,
          lesson_date: dl,
        });
      }
    }
  }, [diaryTarget, selectedScheduleId, selectedRemoteId, completedSchedules, remotePending, memberMap]);

  useEffect(() => {
    if (diaryTarget === "schedule" && selectedScheduleId) {
      const sched = completedSchedules.find((s) => s.id === selectedScheduleId);
      const mid = sched?.member_id;
      if (!mid) return;
      const nm = memberMap[mid]?.name?.trim() || memberMap[mid]?.email?.trim() || "";
      if (!nm) return;
      setFeedbackSections((prev) => {
        if (prev.member_name.trim()) return prev;
        return { ...prev, member_name: nm };
      });
    } else if (diaryTarget === "remote" && selectedRemoteId) {
      const req = remotePending.find((r) => r.id === selectedRemoteId);
      if (!req?.member_id) return;
      const nm = memberMap[req.member_id]?.name?.trim() || memberMap[req.member_id]?.email?.trim() || "";
      if (!nm) return;
      setFeedbackSections((prev) => {
        if (prev.member_name.trim()) return prev;
        return { ...prev, member_name: nm };
      });
    }
  }, [memberMap, diaryTarget, selectedScheduleId, selectedRemoteId, completedSchedules, remotePending]);

  const submittedScheduleIds = useMemo(
    () => new Set(logs.map((l) => l.schedule_id).filter(Boolean) as string[]),
    [logs],
  );

  const pendingSchedules = useMemo(
    () => completedSchedules.filter((s) => !submittedScheduleIds.has(s.id)),
    [completedSchedules, submittedScheduleIds],
  );

  const selectedSchedule = useMemo(
    () => pendingSchedules.find((s) => s.id === selectedScheduleId) ?? null,
    [pendingSchedules, selectedScheduleId],
  );

  const selectedRemote = useMemo(
    () => remotePending.find((r) => r.id === selectedRemoteId) ?? null,
    [remotePending, selectedRemoteId],
  );

  const memoMemberId =
    diaryTarget === "schedule" ? selectedSchedule?.member_id ?? null : selectedRemote?.member_id ?? null;

  useEffect(() => {
    if (!memoMemberId || !user.id) {
      setPersistentMemo("");
      setMemoLoaded(false);
      setLessonCount(null);
      return;
    }

    let cancelled = false;
    setMemoLoaded(false);

    const load = async () => {
      const [{ data: memoRow, error: memoErr }, countRep] = await Promise.all([
        supabase
          .from("pro_member_memos")
          .select("notes, updated_at")
          .eq("pro_id", user.id)
          .eq("member_id", memoMemberId)
          .maybeSingle(),
        supabase
          .from("schedules")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", user.id)
          .eq("member_id", memoMemberId)
          .eq("status", "COMPLETED"),
      ]);

      if (cancelled) return;
      if (memoErr) {
        console.warn(memoErr);
        setPersistentMemo("");
      } else {
        setPersistentMemo((memoRow as ProMemberMemo | null)?.notes ?? "");
      }
      setLessonCount(countRep.count ?? 0);
      setMemoLoaded(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [memoMemberId, supabase, user.id]);

  useEffect(() => {
    if (!memoMemberId) {
      setPeekProfile(null);
      setPeekLoading(false);
      return;
    }
    let cancelled = false;
    setPeekLoading(true);
    void supabase
      .from("member_profiles")
      .select("*")
      .eq("user_id", memoMemberId)
      .maybeSingle()
      .then(({ data, error: pe }) => {
        if (cancelled) return;
        setPeekLoading(false);
        if (pe) console.warn(pe);
        setPeekProfile((data as MemberProfile) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [memoMemberId, supabase]);

  const savePersistentMemo = async () => {
    if (!memoMemberId) return;
    setError(null);
    const { error: e } = await supabase.from("pro_member_memos").upsert(
      {
        pro_id: user.id,
        member_id: memoMemberId,
        notes: persistentMemo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pro_id,member_id" },
    );
    if (e) setError(toUserMessage(e));
  };

  const uploadMedia = async (file: File, kind: "video" | "voice") => {
    if (kind === "video") setUploadingVideo(true);
    else setUploadingVoice(true);
    setError(null);
    try {
      const safe = file.name.replace(/[^\w.\-가-힣]/g, "_");
      const path = `${user.id}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (kind === "video") setVideoUrl(publicUrl);
      else setVoiceNoteUrl(publicUrl);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setUploadingVideo(false);
      setUploadingVoice(false);
    }
  };

  const showContextPanel =
    diaryTarget === "schedule" ? Boolean(selectedSchedule && memoMemberId) : Boolean(selectedRemote && memoMemberId);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const composedFb = composeFeedbackComments(feedbackSections);
      if (!composedFb.trim() && !videoUrl.trim()) {
        throw new Error("레슨 코멘트(항목 중 하나라도 입력) 또는 영상 중 하나는 필수입니다.");
      }

      const videoAccessToken = videoUrl.trim() ? newVideoAccessToken() : null;

      if (diaryTarget === "schedule") {
        if (!selectedScheduleId) throw new Error("회원 레슨(일정)을 선택하세요.");
        const sched = completedSchedules.find((s) => s.id === selectedScheduleId);
        if (!sched) throw new Error("선택한 레슨을 찾을 수 없습니다.");

        const { error: e } = await supabase.from("lesson_logs").insert({
          schedule_id: sched.id,
          source_kind: "schedule",
          remote_request_id: null,
          pro_id: user.id,
          member_id: sched.member_id,
          feedback_text: composedFb.trim() || null,
          video_url: videoUrl.trim() || null,
          video_access_token: videoAccessToken,
          voice_note_url: voiceNoteUrl.trim() || null,
          member_notes: lessonMemberNotes.trim() || null,
        });
        if (e) throw e;

        if (sched.member_id) {
          await supabase.from("notifications").insert({
            user_id: sched.member_id,
            type: "LESSON_LOG_CREATED",
            payload: { schedule_id: sched.id },
          });
        }

        setSelectedScheduleId("");
      } else {
        if (!selectedRemoteId) throw new Error("원포인트 요청을 선택하세요.");
        const req = remotePending.find((r) => r.id === selectedRemoteId);
        if (!req) throw new Error("선택한 요청을 찾을 수 없습니다.");

        const { data: log, error: insErr } = await supabase
          .from("lesson_logs")
          .insert({
            schedule_id: null,
            source_kind: "remote",
            remote_request_id: req.id,
            pro_id: user.id,
            member_id: req.member_id,
            feedback_text: composedFb.trim() || null,
            video_url: videoUrl.trim() || null,
            video_access_token: videoAccessToken,
            voice_note_url: voiceNoteUrl.trim() || null,
            member_notes: lessonMemberNotes.trim() || null,
          })
          .select("*")
          .single();
        if (insErr) throw insErr;

        const { error: rErr } = await supabase
          .from("remote_requests")
          .update({
            feedback_id: log.id,
            responded_at: new Date().toISOString(),
          })
          .eq("id", req.id);
        if (rErr) throw rErr;

        await supabase.from("notifications").insert({
          user_id: req.member_id,
          type: "REMOTE_FEEDBACK_READY",
          payload: { request_id: req.id },
        });

        setSelectedRemoteId("");
      }

      setFeedbackSections(emptyFeedbackSections());
      setVideoUrl("");
      setVoiceNoteUrl("");
      setLessonMemberNotes("");
      sttControlRef.current?.stop();
      sttControlRef.current = null;
      setSttListening(false);
      setSttInterim("");
      await reload();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card">
        <h3 className="text-sm font-semibold">레슨 코멘트 작성</h3>
        <p className="mt-1 text-xs text-slate-500">
          <strong>회원</strong>은 매장 레슨(완료 처리된 일정)·<strong>원포인트</strong>는 결제 완료 후 피드백 대기 중인
          요청을 선택해 아래 항목 순서로 기록합니다. 회원 저장 프로필·공통 메모를 활용할 수 있습니다.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={diaryTarget === "schedule" ? "btn-secondary text-xs" : "btn-ghost text-xs border border-slate-200"}
            onClick={() => setDiaryTarget("schedule")}
          >
            회원 (오프라인 완료 레슨)
          </button>
          <button
            type="button"
            className={diaryTarget === "remote" ? "btn-secondary text-xs" : "btn-ghost text-xs border border-slate-200"}
            onClick={() => setDiaryTarget("remote")}
          >
            원포인트 (미응답 요청)
          </button>
        </div>

        <div className="mt-3 grid gap-3">
          {diaryTarget === "schedule" ? (
            <div>
              <label className="label" htmlFor="schedule">
                대상 레슨 (완료 처리 · 레슨 코멘트 미작성)
              </label>
              <select
                id="schedule"
                className="input"
                value={selectedScheduleId}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
              >
                <option value="">선택하세요…</option>
                {pendingSchedules.map((s) => {
                  const member = s.member_id ? memberMap[s.member_id] : null;
                  return (
                    <option key={s.id} value={s.id}>
                      {formatDateTime(s.start_time)} · {member ? member.name ?? member.email : "(미지정)"}
                    </option>
                  );
                })}
              </select>
              {pendingSchedules.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-500">작성 가능한 회원 레슨이 없습니다.</p>
              ) : null}
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="remote-req">
                대상 원포인트 요청 (결제 완료 · 미응답)
              </label>
              <select
                id="remote-req"
                className="input"
                value={selectedRemoteId}
                onChange={(e) => setSelectedRemoteId(e.target.value)}
              >
                <option value="">선택하세요…</option>
                {remotePending.map((r) => {
                  const member = memberMap[r.member_id];
                  const tier = r.pricing_tier === "60m" ? "60분" : "30분";
                  const quoted =
                    r.amount_quoted != null ? formatKRW(r.amount_quoted) : tier;
                  return (
                    <option key={r.id} value={r.id}>
                      {formatDateTime(r.created_at)} · {member ? member.name ?? member.email : r.member_id.slice(0, 8)}{" "}
                      · {quoted}
                    </option>
                  );
                })}
              </select>
              {remotePending.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  처리할 원포인트가 없거나, 「원격 피드백」에서 이미 답변한 요청입니다.
                </p>
              ) : null}
            </div>
          )}

          {showContextPanel ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
              <p className="text-xs font-semibold text-emerald-800">
                {diaryTarget === "schedule" ? "회원 레슨" : "원포인트 요청"}
              </p>
              <ul className="mt-2 space-y-1 text-slate-800">
                <li>
                  <span className="text-slate-500">이름 · </span>
                  {memoMemberId ? memberMap[memoMemberId]?.name ?? memberMap[memoMemberId]?.email ?? "—" : "—"}
                </li>
                {diaryTarget === "remote" && selectedRemote ? (
                  <li className="text-xs">
                    <span className="text-slate-500">플랜 · </span>
                    {selectedRemote.pricing_tier === "60m" ? "60분" : "30분"}
                    {selectedRemote.amount_quoted != null ? (
                      <span className="ml-1">({formatKRW(selectedRemote.amount_quoted)})</span>
                    ) : null}
                  </li>
                ) : null}
                <li>
                  <span className="text-slate-500">
                    이 프로와 완료 레슨(매장)·스케줄 카운트 ·{" "}
                  </span>
                  {lessonCount === null ? "…" : `${lessonCount}회`}
                  <span className="ml-1 text-[11px] text-slate-500">(매장 레슨만 집계)</span>
                </li>
              </ul>
              <div className="mt-3">
                <p className="text-[11px] font-medium text-emerald-900">회원 프로필 (회원이 입력한 경우)</p>
                <MemberProfilePreview loading={peekLoading} profile={peekProfile} />
              </div>
              <label className="label mt-3">회원 특이사항 (공통 메모)</label>
              <p className="mb-1 text-[11px] text-slate-500">
                부상 이력, 선호 클럽, 심리 케어 포인트 등 — 매 레슨마다 같은 회원에게 표시됩니다.
              </p>
              <textarea
                className="input min-h-20"
                value={persistentMemo}
                disabled={!memoLoaded}
                onChange={(e) => setPersistentMemo(e.target.value)}
                onBlur={() => void savePersistentMemo()}
                placeholder="예: 왼쪽 어깨 통증(2026.3~) · 드라이버만 템포 느리게"
              />
              <label className="label mt-2">이번 레슨 특이사항 (레슨 코멘트에만 저장)</label>
              <textarea
                className="input min-h-16"
                value={lessonMemberNotes}
                onChange={(e) => setLessonMemberNotes(e.target.value)}
                placeholder="오늘만 해당: 힙턴 각도 집중, 연습량 과다 주의 등"
              />
            </div>
          ) : null}

          <div className="space-y-3">
            <label className="label">레슨 코멘트 항목</label>
            <p className="mb-2 text-[11px] text-slate-500">
              회원 이름·레슨 날짜는 대상을 고르면 자동으로 채워지며, 나머지를 채우면 회원 화면에 날짜별 카드로 같은
              순서로 보입니다.
            </p>
            {FEEDBACK_COMMENT_SECTIONS.map(({ key, heading, placeholder, rows: rowCount }) => (
              <div key={key}>
                <label className="label text-[11px]" htmlFor={`fb-${key}`}>
                  {heading}
                </label>
                <textarea
                  id={`fb-${key}`}
                  className="input mt-0.5 min-h-14 text-sm"
                  value={feedbackSections[key]}
                  onChange={(e) =>
                    setFeedbackSections((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  placeholder={placeholder}
                  rows={rowCount ?? 2}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="label">영상 (≤ 30초 권장)</label>
            <p className="mb-2 text-[11px] text-slate-500">
              모바일: 카메라로 촬영·바로 업로드 (크롬/사파리에서 파일 선택 시 카메라 열림). 영상이 있으면 저장 후{" "}
              <strong>QR 공개 링크</strong>가 생성되며, 회원은 QR로 들어가「내 프로필」에 저장한 연락처{" "}
              <strong>끝 4자리</strong>로 잠금 해제 후 재생합니다.
            </p>
            <input
              className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-white"
              type="file"
              accept="video/*"
              capture="environment"
              disabled={uploadingVideo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadMedia(f, "video");
                e.target.value = "";
              }}
            />
            {uploadingVideo ? <p className="mt-1 text-xs text-slate-500">영상 업로드 중…</p> : null}
            <input
              id="video-url-fallback"
              className="input mt-2"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="또는 URL 직접 입력 (Mux 등)"
            />
          </div>

          <div>
            <label className="label">음성 메모</label>
            <p className="mb-2 text-[11px] text-slate-500">
              음성 파일을 올리면 링크로 저장됩니다. 아래 <strong>말하기(STT)</strong>는 브라우저가 말을 글로 바꿔
              <strong> 8. 오늘의 숙제</strong>에 넣어 레슨 코멘트에 포함됩니다.
            </p>
            {isBrowserSpeechRecognitionAvailable() ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={sttListening ? "btn-secondary text-xs" : "btn-ghost text-xs border border-emerald-300 bg-white"}
                    disabled={busy}
                    onClick={() => toggleSpeechToHomework()}
                  >
                    {sttListening ? "말하기 중지" : "말하기 시작 (STT → 8. 오늘의 숙제)"}
                  </button>
                  {sttListening ? (
                    <span className="text-[11px] font-medium text-emerald-900">듣는 중… 마이크에 말씀해 주세요.</span>
                  ) : null}
                </div>
                {sttInterim ? (
                  <p className="mt-2 text-xs italic text-slate-600">
                    인식 중: <span className="not-italic text-slate-800">{sttInterim}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mb-2 text-[10px] text-amber-800">
                STT는 Chrome·Edge(Chromium)에서 사용할 수 있습니다. Safari·Firefox는 음성 파일 업로드만 가능합니다.
              </p>
            )}
            <input
              className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-white"
              type="file"
              accept="audio/*"
              capture
              disabled={uploadingVoice}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadMedia(f, "voice");
                e.target.value = "";
              }}
            />
            {uploadingVoice ? <p className="mt-1 text-xs text-slate-500">음성 업로드 중…</p> : null}
            <input
              className="input mt-2"
              value={voiceNoteUrl}
              onChange={(e) => setVoiceNoteUrl(e.target.value)}
              placeholder="또는 음성 파일 URL"
            />
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "저장 중…" : "레슨 코멘트 저장 + 회원 알림"}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">최근 레슨 코멘트</h3>
          <button type="button" className="btn-ghost text-xs" onClick={() => void reload()}>
            새로고침
          </button>
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-slate-500">불러오는 중…</p>
        ) : logs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">아직 작성한 레슨 코멘트가 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {logs.map((l) => {
              const member = l.member_id ? memberMap[l.member_id] : null;
              const kind = logKindLabel(l);
              return (
                <li key={l.id} className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
                  <div className="border-b border-emerald-50 bg-emerald-50/50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">레슨 코멘트</p>
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-600">
                      <span className="text-sm font-semibold text-slate-900">
                        {member ? member.name ?? member.email : "(미지정)"}
                      </span>
                      <span className="flex items-center gap-2">
                        <span>{formatDateTime(l.created_at)}</span>
                        <span
                          className={
                            kind === "원포인트"
                              ? "rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800"
                              : "rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800"
                          }
                        >
                          {kind}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                  {l.member_notes ? (
                    <p className="text-xs text-slate-600">
                      <span className="font-medium text-slate-700">레슨 메모 · </span>
                      {l.member_notes}
                    </p>
                  ) : null}
                  {l.feedback_text ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-800 sm:grid-cols-2">
                      {splitFeedbackCommentsForDisplay(l.feedback_text).map((block, i) => (
                        <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/80 p-2.5">
                          <div className="text-[11px] font-semibold text-slate-600">{block.heading}</div>
                          {block.body ? (
                            <p className="mt-1 whitespace-pre-line text-sm">{block.body}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {l.video_url ? (
                    <div className="mt-3 rounded-lg border border-slate-100 bg-white p-3">
                      <p className="text-[11px] font-medium text-slate-700">영상</p>
                      <a href={l.video_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-emerald-700 underline">
                        원본 링크 열기
                      </a>
                      {l.video_access_token ? (
                        <div className="mt-3 flex flex-wrap items-start gap-4">
                          <div>
                            <p className="text-[10px] font-medium text-slate-600">회원용 QR (연락처 끝 4자리)</p>
                            <div className="mt-1">
                              <VideoQrBlock url={getPublicLessonVideoPageUrl(l.video_access_token)} />
                            </div>
                          </div>
                          <p className="max-w-[14rem] text-[10px] leading-snug text-slate-500">
                            URL:{" "}
                            <span className="break-all font-mono text-slate-700">
                              {getPublicLessonVideoPageUrl(l.video_access_token)}
                            </span>
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {l.voice_note_url ? (
                    <a href={l.voice_note_url} target="_blank" rel="noreferrer" className="ml-3 mt-2 inline-block text-xs text-slate-700 underline">
                      음성 열기
                    </a>
                  ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
