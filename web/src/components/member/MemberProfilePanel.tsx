"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser, MemberProfile } from "@/lib/types";
import { INJURY_OPTIONS } from "@/lib/memberProfileConstants";
import { toUserMessage } from "@/lib/formatError";

type Props = { user: AppUser };

export function MemberProfilePanel({ user }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [age, setAge] = useState<string>("");
  const [careerYears, setCareerYears] = useState<string>("");
  const [lessonCount, setLessonCount] = useState<string>("");
  const [injury, setInjury] = useState<string[]>([]);
  const [otherSports, setOtherSports] = useState("");
  const [averageScore, setAverageScore] = useState<string>("");
  const [fieldRounds, setFieldRounds] = useState<string>("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, error: e }, { data: udata, error: ue }] = await Promise.all([
        supabase.from("member_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("users").select("name, phone").eq("id", user.id).maybeSingle(),
      ]);
      if (e) throw e;
      if (ue) throw ue;
      const row = data as MemberProfile | null;
      const u = udata as { name: string | null; phone: string | null } | null;
      setDisplayName(u?.name ?? user.name ?? "");
      setPhone(u?.phone?.trim() ?? "");
      if (row) {
        setAge(row.age != null ? String(row.age) : "");
        setCareerYears(row.career_years != null ? String(row.career_years) : "");
        setLessonCount(row.lesson_count_reported != null ? String(row.lesson_count_reported) : "");
        setInjury(row.injury_checklist ?? []);
        setOtherSports(row.other_sports ?? "");
        setAverageScore(row.average_score != null ? String(row.average_score) : "");
        setFieldRounds(row.field_rounds_per_month != null ? String(row.field_rounds_per_month) : "");
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, [supabase, user.id, user.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleInjury = (key: string) => {
    if (key === "none") {
      setInjury(["none"]);
      return;
    }
    setInjury((prev) => {
      const withoutNone = prev.filter((x) => x !== "none");
      if (withoutNone.includes(key)) return withoutNone.filter((x) => x !== key);
      return [...withoutNone, key];
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const nameTrim = displayName.trim();
      if (!nameTrim) throw new Error("이름을 입력해 주세요.");

      const { error: uErr } = await supabase
        .from("users")
        .update({ name: nameTrim, phone: phone.trim() || null })
        .eq("id", user.id);
      if (uErr) throw uErr;

      const ageN = age.trim() === "" ? null : Number.parseInt(age, 10);
      const cy = careerYears.trim() === "" ? null : Number.parseInt(careerYears, 10);
      const lc = lessonCount.trim() === "" ? null : Number.parseInt(lessonCount, 10);
      const avg = averageScore.trim() === "" ? null : Number.parseInt(averageScore, 10);
      const fr = fieldRounds.trim() === "" ? null : Number.parseInt(fieldRounds, 10);

      if (ageN !== null && (Number.isNaN(ageN) || ageN < 1)) throw new Error("나이를 확인해 주세요.");
      if (cy !== null && Number.isNaN(cy)) throw new Error("구력(년)을 확인해 주세요.");
      if (lc !== null && Number.isNaN(lc)) throw new Error("레슨 횟수를 확인해 주세요.");
      if (avg !== null && (Number.isNaN(avg) || avg < 50 || avg > 200)) throw new Error("평균 스코어는 50~200 사이로 입력해 주세요.");
      if (fr !== null && Number.isNaN(fr)) throw new Error("필드 라운드 횟수를 확인해 주세요.");

      const checklist = injury.includes("none") ? ["none"] : injury;

      const { error: pErr } = await supabase.from("member_profiles").upsert(
        {
          user_id: user.id,
          age: ageN,
          career_years: cy,
          lesson_count_reported: lc,
          injury_checklist: checklist,
          other_sports: otherSports.trim() || null,
          average_score: avg,
          field_rounds_per_month: fr,
        },
        { onConflict: "user_id" },
      );
      if (pErr) throw pErr;

      setMessage("저장했습니다. 연결된 프로는 회원 명단에서 확인할 수 있습니다.");
      await load();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card text-sm text-slate-500">프로필을 불러오는 중…</div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h3 className="text-sm font-semibold">회원 프로필</h3>
        <p className="mt-1 text-xs text-slate-500">
          입력한 정보는 <strong>예약·레슨·원포인트로 연결된 프로</strong>만 볼 수 있습니다.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-phone">
              연락처
            </label>
            <input
              id="m-phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="예: 010-1234-5678"
            />
            <p className="mt-1 text-[11px] text-slate-500">프로 명단에 표시되며, 전화로 명단 연결 시 이 번호로 매칭됩니다.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-name">
              이름 (필수)
            </label>
            <input
              id="m-name"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="실명 또는 닉네임"
              required
              aria-required="true"
            />
          </div>
          <div>
            <label className="label" htmlFor="m-age">
              나이
            </label>
            <input
              id="m-age"
              className="input"
              type="number"
              min={1}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="예: 35"
            />
          </div>
          <div>
            <label className="label" htmlFor="m-career">
              구력 (년)
            </label>
            <input
              id="m-career"
              className="input"
              type="number"
              min={0}
              value={careerYears}
              onChange={(e) => setCareerYears(e.target.value)}
              placeholder="골프 시작 후 몇 년"
            />
          </div>
          <div>
            <label className="label" htmlFor="m-lessons">
              레슨 횟수 (누적)
            </label>
            <input
              id="m-lessons"
              className="input"
              type="number"
              min={0}
              value={lessonCount}
              onChange={(e) => setLessonCount(e.target.value)}
              placeholder="지금까지 받은 레슨 횟수"
            />
          </div>
          <div>
            <label className="label" htmlFor="m-avg">
              평균 스코어 (18홀)
            </label>
            <input
              id="m-avg"
              className="input"
              type="number"
              min={50}
              max={200}
              value={averageScore}
              onChange={(e) => setAverageScore(e.target.value)}
              placeholder="예: 95"
            />
          </div>
          <div>
            <label className="label" htmlFor="m-field">
              필드 라운드 (월 기준)
            </label>
            <input
              id="m-field"
              className="input"
              type="number"
              min={0}
              max={31}
              value={fieldRounds}
              onChange={(e) => setFieldRounds(e.target.value)}
              placeholder="한 달 평균 라운드 수"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">다쳤던 부위 (복수 선택)</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {INJURY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleInjury(opt.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    injury.includes(opt.key)
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-sports">
              골프 외 즐겨하는 운동
            </label>
            <input
              id="m-sports"
              className="input"
              value={otherSports}
              onChange={(e) => setOtherSports(e.target.value)}
              placeholder="예: 수영, 헬스, 등산"
            />
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}

        <button type="button" className="btn-primary mt-4" disabled={saving} onClick={() => void save()}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </section>
    </div>
  );
}
