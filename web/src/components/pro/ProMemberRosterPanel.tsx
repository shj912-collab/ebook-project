"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, MemberProfile } from "@/lib/types";
import { formatDateTime } from "@/lib/types";
import { injuryLabel } from "@/lib/memberProfileConstants";
import { toUserMessage } from "@/lib/formatError";

type Props = { user: AppUser };

type Row = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  profile: MemberProfile | null;
  linkedManually: boolean;
  /** 명단 연결 행 기준 패스 총횟수. 연결 행 없으면 null */
  lessonPassTotal: number | null;
  /** 이 회원과의 COMPLETED 레슨 일정 수 */
  completedLessonCount: number;
  rosterServiceStatus: "이용중" | "예약없음" | "만료";
};

export function ProMemberRosterPanel({ user }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [passSavingId, setPassSavingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [links, sc, lg, rr, booked, completed, rosterMembers] = await Promise.all([
        supabase.from("pro_client_links").select("member_id, lesson_pass_total").eq("pro_id", user.id),
        supabase.from("schedules").select("member_id").eq("pro_id", user.id).not("member_id", "is", null),
        supabase.from("lesson_logs").select("member_id").eq("pro_id", user.id).not("member_id", "is", null),
        supabase.from("remote_requests").select("member_id").eq("pro_id", user.id),
        supabase
          .from("schedules")
          .select("member_id,start_time,end_time")
          .eq("pro_id", user.id)
          .eq("status", "BOOKED")
          .not("member_id", "is", null),
        supabase
          .from("schedules")
          .select("member_id")
          .eq("pro_id", user.id)
          .eq("status", "COMPLETED")
          .not("member_id", "is", null),
        supabase.from("users").select("id, name, email, phone").eq("role", "MEMBER"),
      ]);
      if (links.error) throw links.error;
      if (sc.error) throw sc.error;
      if (lg.error) throw lg.error;
      if (rr.error) throw rr.error;
      if (booked.error) throw booked.error;
      if (completed.error) throw completed.error;
      if (rosterMembers.error) throw rosterMembers.error;

      const passByMember = new Map<string, number | null>();
      const ids = new Set<string>();
      const manual = new Set<string>();
      for (const r of (links.data as { member_id: string; lesson_pass_total: number | null }[]) ?? []) {
        ids.add(r.member_id);
        manual.add(r.member_id);
        passByMember.set(r.member_id, r.lesson_pass_total);
      }
      setManualIds(manual);
      for (const r of (sc.data as { member_id: string }[]) ?? []) ids.add(r.member_id);
      for (const r of (lg.data as { member_id: string }[]) ?? []) ids.add(r.member_id);
      for (const r of (rr.data as { member_id: string }[]) ?? []) ids.add(r.member_id);

      const completedCountByMember = new Map<string, number>();
      for (const r of (completed.data as { member_id: string }[]) ?? []) {
        const id = r.member_id;
        completedCountByMember.set(id, (completedCountByMember.get(id) ?? 0) + 1);
      }

      const bookingIntervalsByMember = new Map<string, { start_time: string; end_time: string }[]>();
      for (const b of (booked.data as { member_id: string; start_time: string; end_time: string }[]) ?? []) {
        const prev = bookingIntervalsByMember.get(b.member_id) ?? [];
        prev.push({ start_time: b.start_time, end_time: b.end_time });
        bookingIntervalsByMember.set(b.member_id, prev);
      }

      const allMemberRows =
        (rosterMembers.data as { id: string; name: string | null; email: string; phone: string | null }[]) ?? [];

      let usersData: { id: string; name: string | null; email: string; phone: string | null }[];
      if (allMemberRows.length > 0) {
        usersData = allMemberRows;
      } else {
        /* RLS 적용 전 등으로 전체 조회가 비면 기존 방식(연결·일정 등으로만) */
        const fallbackIds = [...ids];
        if (fallbackIds.length === 0) {
          setRows([]);
          return;
        }
        const fb = await supabase.from("users").select("id, name, email, phone").in("id", fallbackIds);
        if (fb.error) throw fb.error;
        usersData = (fb.data as typeof usersData) ?? [];
      }

      if (usersData.length === 0) {
        setRows([]);
        return;
      }

      const memberIds = usersData.map((u) => u.id);
      const { data: profData, error: pErr } = await supabase
        .from("member_profiles")
        .select("*")
        .in("user_id", memberIds);
      if (pErr) throw pErr;

      const profileByUser = new Map<string, MemberProfile>();
      for (const p of (profData as MemberProfile[]) ?? []) {
        profileByUser.set(p.user_id, p);
      }

      const list: Row[] =
        ((usersData as { id: string; name: string | null; email: string; phone: string | null }[]) ?? []).map((urow) => {
          const intervals = bookingIntervalsByMember.get(urow.id);
          const lessonPassTotal = manual.has(urow.id) ? (passByMember.get(urow.id) ?? null) : null;
          const completedLessonCount = completedCountByMember.get(urow.id) ?? 0;
          return {
            id: urow.id,
            name: urow.name,
            email: urow.email,
            phone: urow.phone ?? null,
            profile: profileByUser.get(urow.id) ?? null,
            linkedManually: manual.has(urow.id),
            lessonPassTotal,
            completedLessonCount,
            rosterServiceStatus: rosterLessonStatus(intervals, lessonPassTotal, completedLessonCount),
          };
        });

      list.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "ko"));
      setRows(list);
    } catch (e) {
      setError(toUserMessage(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveLessonPassTotal = async (memberId: string, raw: string) => {
    if (!manualIds.has(memberId)) return;
    setPassSavingId(memberId);
    setError(null);
    try {
      const t = raw.trim();
      let v: number | null = null;
      if (t !== "") {
        const n = Number.parseInt(t, 10);
        if (!Number.isFinite(n) || n < 0)
          throw new Error("패스 횟수는 0 이상의 정수이거나 비워 두세요(무제한).");
        v = n;
      }
      const { error: upErr } = await supabase
        .from("pro_client_links")
        .update({ lesson_pass_total: v })
        .eq("pro_id", user.id)
        .eq("member_id", memberId);
      if (upErr) throw upErr;
      await reload();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setPassSavingId(null);
    }
  };

  const linkByEmail = async () => {
    const email = emailDraft.trim();
    if (!email) {
      setError("회원 이메일을 입력하세요.");
      return;
    }
    setLinkBusy(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("pro_link_member_by_email", { p_email: email });
      if (rpcErr) {
        const raw = toUserMessage(rpcErr);
        const msg = raw.includes("MEMBER_NOT_FOUND")
          ? "해당 이메일의 회원 계정을 찾을 수 없습니다. 회원 역할로 가입된 주소인지 확인해 주세요."
          : raw;
        throw new Error(msg);
      }
      setEmailDraft("");
      await reload();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLinkBusy(false);
    }
  };

  const linkByPhone = async () => {
    const raw = phoneDraft.trim();
    if (!raw) {
      setError("연락처를 입력하세요.");
      return;
    }
    setPhoneBusy(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("pro_link_member_by_phone", { p_phone: raw });
      if (rpcErr) {
        const msg = toUserMessage(rpcErr);
        throw new Error(
          msg.includes("MEMBER_PHONE_NOT_FOUND") || msg.includes("not found")
            ? "해당 연락처와 일치하는 회원을 찾을 수 없습니다. 회원이「내 프로필」에 같은 번호를 저장했는지 확인해 주세요."
            : msg.includes("INVALID_PHONE")
              ? "연락처 형식을 확인해 주세요. (숫자 8자리 이상)"
              : msg,
        );
      }
      setPhoneDraft("");
      await reload();
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setPhoneBusy(false);
    }
  };

  const unlinkManual = async (memberId: string) => {
    if (!manualIds.has(memberId)) return;
    if (!confirm("명단에서 이 회원 연결만 해제할까요? (예약·레슨 코멘트 데이터는 삭제되지 않습니다.)")) return;
    setError(null);
    const { error: delErr } = await supabase
      .from("pro_client_links")
      .delete()
      .eq("pro_id", user.id)
      .eq("member_id", memberId);
    if (delErr) setError(toUserMessage(delErr));
    else await reload();
  };

  const emptyHint = useMemo(
    () =>
      "아직 표시할 회원이 없습니다. 이메일 또는 연락처로 추가하거나, 예약·레슨 코멘트·원포인트가 시작되면 자동으로 나타납니다.",
    [],
  );

  if (loading) {
    return <div className="card text-sm text-slate-500">회원 명단을 불러오는 중…</div>;
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">회원 명단</h3>
            <p className="mt-1 text-xs text-slate-500">
              회원이 <strong>내 프로필</strong>에 저장한 정보가 있으면 함께 표시됩니다. 미입력 항목은 &quot;—&quot; 로
              보입니다. 이메일·연락처로 연결하면 예약 전에도 프로필 확인이 가능합니다. 명단 상태는 확정 BOOKED만
              반영합니다(검색·예약 현황의 다른 상태와 다를 수 있음).
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              <strong>이용중</strong>: 레슨 진행 중 또는 미래 예약이 한 건이라도 있는 경우입니다. 예약 없고 패스 총횟수를
              채워 두었다면 소진 완료 시에만 <strong>만료</strong>, 그렇지 않으면 <strong>예약없음</strong>입니다.
            </p>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={() => void reload()}>
            새로고침
          </button>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <label className="label mb-1" htmlFor="roster-email">
                이메일로 명단 추가
              </label>
              <input
                id="roster-email"
                className="input"
                type="email"
                autoComplete="off"
                placeholder="member@example.com"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
              />
            </div>
            <button type="button" className="btn-primary text-sm" disabled={linkBusy} onClick={() => void linkByEmail()}>
              {linkBusy ? "연결 중…" : "연결"}
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <label className="label mb-1" htmlFor="roster-phone">
                연락처로 명단 추가
              </label>
              <input
                id="roster-phone"
                className="input"
                type="tel"
                inputMode="tel"
                placeholder="회원이 저장한 번호와 동일하게"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
              />
            </div>
            <button type="button" className="btn-secondary text-sm" disabled={phoneBusy} onClick={() => void linkByPhone()}>
              {phoneBusy ? "연결 중…" : "연결"}
            </button>
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

        {rows.length > 0 ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
            <h4 className="text-xs font-semibold text-slate-800">등록 회원 한눈에 ({rows.length}명)</h4>
            <p className="mt-0.5 text-[11px] text-slate-500">아래와 동일한 명단을 칩으로 모아 두었습니다. 상세는 표를 스크롤해 보세요.</p>
            <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {rows.map((r, idx) => (
                <span
                  key={r.id}
                  className="inline-flex max-w-full items-baseline gap-1 truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-800"
                  title={r.phone?.trim() ?? "연락처 없음"}
                >
                  <span className="font-semibold">
                    {idx + 1}. {r.name?.trim() || "(이름 미입력)"}
                  </span>
                  <span className="truncate text-slate-500">{r.phone?.trim() ? r.phone : "—"}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{emptyHint}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-2 font-medium whitespace-nowrap w-10">번호</th>
                  <th className="py-2 pr-3 font-medium">이름</th>
                  <th className="py-2 pr-3 font-medium">연락처</th>
                  <th className="py-2 pr-3 font-medium">나이</th>
                  <th className="py-2 pr-3 font-medium">구력</th>
                  <th className="py-2 pr-3 font-medium">레슨 횟수</th>
                  <th className="py-2 pr-3 font-medium">부상 이력</th>
                  <th className="py-2 pr-3 font-medium">다른 운동</th>
                  <th className="py-2 pr-3 font-medium">평균 스코어</th>
                  <th className="py-2 pr-3 font-medium">월 필드</th>
                  <th className="py-2 pr-3 font-medium">수정일</th>
                  <th className="py-2 pr-3 font-medium min-w-[6.5rem]">패스(총)</th>
                  <th className="py-2 font-medium min-w-[8rem]">상태 · 관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-2 whitespace-nowrap text-xs text-slate-600 align-top">{idx + 1}.</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-900">{r.name ?? "—"}</div>
                      <div className="text-[11px] text-slate-500">{r.phone?.trim() ? r.phone : "—"}</div>
                      {r.linkedManually ? (
                        <span className="mt-0.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">
                          명단 연결
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-slate-700">
                      {r.phone?.trim() ? r.phone : "—"}
                    </td>
                    <td className="py-2 pr-3">{r.profile?.age ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.profile?.career_years != null ? `${r.profile.career_years}년` : "—"}
                    </td>
                    <td className="py-2 pr-3">{r.profile?.lesson_count_reported ?? "—"}</td>
                    <td className="py-2 pr-3 max-w-[140px] text-xs">
                      {r.profile?.injury_checklist?.length
                        ? r.profile.injury_checklist.map((k) => injuryLabel(k)).join(", ")
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 max-w-[120px] text-xs">{r.profile?.other_sports ?? "—"}</td>
                    <td className="py-2 pr-3">{r.profile?.average_score ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.profile?.field_rounds_per_month != null ? `${r.profile.field_rounds_per_month}회/월` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {r.profile?.updated_at ? formatDateTime(r.profile.updated_at) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {r.linkedManually ? (
                        <div className="flex flex-col gap-1">
                          <input
                            key={`pass-${r.id}-${r.lessonPassTotal ?? "x"}`}
                            className="input w-[4.5rem] py-1 text-[11px]"
                            type="number"
                            min={0}
                            placeholder="무제한"
                            title="비우면 패스 무제한(명단에서 만료 처리 안 함). 숫자를 입력하면 완료된 레슨이 그 횟수 이상일 때 만료로 표시됩니다."
                            defaultValue={r.lessonPassTotal ?? ""}
                            disabled={passSavingId === r.id}
                            onBlur={(e) => void saveLessonPassTotal(r.id, e.target.value)}
                          />
                          <span className="text-[10px] text-slate-500">
                            완료 {r.completedLessonCount}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400" title="이메일·연락처로 명단 연결 후 설정할 수 있습니다.">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs">
                      <span
                        className={
                          r.rosterServiceStatus === "이용중"
                            ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900"
                            : r.rosterServiceStatus === "만료"
                              ? "inline-flex rounded-full bg-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-900"
                              : "inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                        }
                      >
                        {r.rosterServiceStatus === "이용중"
                          ? "이용중"
                          : r.rosterServiceStatus === "만료"
                            ? "만료"
                            : "예약없음"}
                      </span>
                      <div className="mt-1">
                        {r.linkedManually ? (
                          <button
                            type="button"
                            className="btn-ghost text-rose-600"
                            onClick={() => void unlinkManual(r.id)}
                          >
                            연결 해제
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** BOOKED 확정: 진행 중이거나 미래 예약이 있으면 이용중. 아니면 패스 총횟수·완료 수로 만료 여부, 그 외 예약없음 */
function rosterLessonStatus(
  intervals: { start_time: string; end_time: string }[] | undefined,
  passTotal: number | null,
  completedLessonCount: number,
): "이용중" | "예약없음" | "만료" {
  const list = intervals ?? [];
  const now = Date.now();
  for (const b of list) {
    const st = new Date(b.start_time).getTime();
    const en = new Date(b.end_time).getTime();
    if (now >= st && now < en) return "이용중";
  }
  if (list.some((b) => new Date(b.start_time).getTime() > now)) return "이용중";

  if (passTotal != null && passTotal > 0 && completedLessonCount >= passTotal) return "만료";
  return "예약없음";
}
