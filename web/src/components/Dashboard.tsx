"use client";

import { useState } from "react";
import type { AppUser } from "@/lib/types";
import {
  MEMBER_DASHBOARD_TABS,
  PRO_DASHBOARD_TABS,
  type MemberTabId,
  type ProTabId,
} from "@/lib/golfsync/constants";
import { ProDashboard } from "./pro/ProDashboard";
import { MemberDashboard } from "./member/MemberDashboard";

type Props = {
  user: AppUser;
  onSignOut: () => Promise<void> | void;
};

export type ProTab = ProTabId;
export type MemberTab = MemberTabId;

export function Dashboard({ user, onSignOut }: Props) {
  const isPro = user.role === "PRO";
  const [proTab, setProTab] = useState<ProTab>("today");
  const [memberTab, setMemberTab] = useState<MemberTab>("today");

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={isPro ? "badge-emerald" : "badge-slate"}>
              {isPro ? "PRO" : "MEMBER"}
            </span>
            <h2 className="text-base font-semibold">{user.name ?? user.email}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">{user.email}</p>
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={() => void onSignOut()}>
          로그아웃
        </button>
      </div>

      {isPro ? (
        <>
          <Tabs tabs={[...PRO_DASHBOARD_TABS]} current={proTab} onChange={(t) => setProTab(t)} />
          <ProDashboard user={user} tab={proTab} />
        </>
      ) : (
        <>
          <Tabs tabs={[...MEMBER_DASHBOARD_TABS]} current={memberTab} onChange={(t) => setMemberTab(t)} />
          <MemberDashboard user={user} tab={memberTab} />
        </>
      )}
    </div>
  );
}

function Tabs<T extends string>({
  tabs,
  current,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  current: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            current === t.id
              ? "bg-emerald-600 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
