"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppUser } from "@/lib/types";
import { toUserMessage } from "@/lib/formatError";
import { Onboarding } from "./Onboarding";
import { Dashboard } from "./Dashboard";

export function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseBrowserClient();

  const fetchProfile = useCallback(
    async (uid: string) => {
      const { data, error: pErr } = await supabase
        .from("users")
        .select("id, email, role, name, phone, profile_img, created_at")
        .eq("id", uid)
        .maybeSingle();
      if (pErr) {
        setError(toUserMessage(pErr));
        return;
      }
      setProfile((data as AppUser | null) ?? null);
    },
    [supabase],
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user.id) {
        await fetchProfile(data.session.user.id);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user.id) {
        void fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signInEmail = async (email: string, password: string, mode: "signIn" | "signUp") => {
    setAuthBusy(true);
    setError(null);
    try {
      if (mode === "signUp") {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
        setError("가입 확인 메일을 발송했습니다. (이메일 확인이 비활성화된 환경에서는 바로 로그인됩니다.)");
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      }
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const reloadProfile = async () => {
    if (session?.user.id) {
      await fetchProfile(session.user.id);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-slate-500">불러오는 중…</p>
      </div>
    );
  }

  if (!session) {
    return <SignInForm onSubmit={signInEmail} busy={authBusy} error={error} />;
  }

  if (!profile?.role) {
    return (
      <Onboarding
        userId={session.user.id}
        email={session.user.email ?? ""}
        onComplete={reloadProfile}
        onSignOut={signOut}
      />
    );
  }

  return <Dashboard user={profile} onSignOut={signOut} />;
}

type SignInFormProps = {
  onSubmit: (email: string, password: string, mode: "signIn" | "signUp") => Promise<void>;
  busy: boolean;
  error: string | null;
};

function SignInForm({ onSubmit, busy, error }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");

  return (
    <section className="card mx-auto max-w-md">
      <h2 className="text-lg font-semibold">{mode === "signIn" ? "로그인" : "회원가입"}</h2>
      <p className="mt-1 text-xs text-slate-500">
        MVP에서는 이메일/비밀번호로 로그인합니다. (PRD: 카카오/구글 소셜 로그인은 후속 작업)
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(email.trim(), password, mode);
        }}
      >
        <div>
          <label className="label" htmlFor="email">이메일</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">비밀번호 (6자 이상)</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "처리 중…" : mode === "signIn" ? "로그인" : "회원가입"}
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => setMode((m) => (m === "signIn" ? "signUp" : "signIn"))}
        >
          {mode === "signIn" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있나요? 로그인"}
        </button>
      </form>
    </section>
  );
}
