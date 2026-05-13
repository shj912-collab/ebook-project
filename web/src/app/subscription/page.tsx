"use client";

import { useState } from "react";

type BillingMethod = "카드";
type PlanName = "Free" | "Basic" | "Pro";

type BillingAuthParams = {
  customerKey: string;
  successUrl: string;
  failUrl: string;
  customerEmail?: string;
  customerName?: string;
};

type TossPaymentsInstance = {
  requestBillingAuth(method: BillingMethod, params: BillingAuthParams): Promise<void>;
};

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsInstance;
  }
}

const plans = [
  {
    name: "Free" as PlanName,
    title: "무료",
    price: "₩0",
    period: "/월",
    description: "회원가입 후 스케줄 관리를 가볍게 시작하는 플랜",
    features: ["회원가입", "스케줄 관리 최대 10개"],
    cta: "무료로 시작",
    featured: false,
  },
  {
    name: "Basic" as PlanName,
    title: "베이직",
    price: "₩9,000",
    period: "/월",
    description: "예약과 레슨일지를 함께 관리하는 개인 맞춤 플랜",
    features: ["회원가입", "스케줄 예약 최대 10개", "레슨일지 최대 10개"],
    cta: "베이직 정기구독 시작",
    featured: false,
  },
  {
    name: "Pro" as PlanName,
    title: "프로",
    price: "₩29,000",
    period: "/월",
    description: "운영에 필요한 핵심 기능을 제한 없이 사용하는 플랜",
    features: ["회원가입", "스케줄 예약 무제한", "레슨일지 무제한"],
    cta: "프로 정기구독 시작",
    featured: true,
  },
] as const;

const TOSS_SCRIPT_URL = "https://js.tosspayments.com/v1/payment";

async function loadTossScript(): Promise<void> {
  if (window.TossPayments) return;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TOSS_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("결제 SDK를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

function getOrCreateCustomerKey(): string {
  const storageKey = "golfsync_customer_key";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const nextKey = `golfsync_user_${crypto.randomUUID()}`;
  window.localStorage.setItem(storageKey, nextKey);
  return nextKey;
}

export default function SubscriptionPage() {
  const [processingPlan, setProcessingPlan] = useState<PlanName | null>(null);
  const clientKey = process.env.NEXT_PUBLIC_KOSSPAY_CLIENT_KEY;

  const handleSubscribe = async (planName: PlanName) => {
    if (planName === "Free") {
      window.location.href = "/";
      return;
    }

    if (!clientKey) {
      alert("결제 클라이언트 키가 없습니다. web/.env.local 을 확인해 주세요.");
      return;
    }

    try {
      setProcessingPlan(planName);
      await loadTossScript();

      if (!window.TossPayments) {
        throw new Error("결제 SDK 초기화에 실패했습니다.");
      }

      const tossPayments = window.TossPayments(clientKey);
      const origin = window.location.origin;
      const customerKey = getOrCreateCustomerKey();
      const planQuery = planName.toLowerCase();

      await tossPayments.requestBillingAuth("카드", {
        customerKey,
        successUrl: `${origin}/subscription/success?plan=${planQuery}`,
        failUrl: `${origin}/subscription/fail?plan=${planQuery}`,
        customerEmail: "subscriber@golfsync.app",
        customerName: "GolfSync Subscriber",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "결제창 실행 중 오류가 발생했습니다.";
      alert(message);
    } finally {
      setProcessingPlan(null);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6">
      <section className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-wide text-slate-600">
          GOLF-SYNC PRICING
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          매월 자동 결제되는 구독 요금제
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
          카드 1회 등록 후 매월 자동으로 결제되는 정기 구독입니다. 언제든지 플랜을 변경하거나 해지할 수 있습니다.
        </p>
      </section>

      <section className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const cardStyle = plan.featured
            ? "border-blue-600 bg-white shadow-[0_16px_40px_-24px_rgba(37,99,235,0.45)]"
            : "border-slate-200 bg-white shadow-sm";

          return (
            <article key={plan.name} className={`flex h-full flex-col rounded-2xl border p-6 ${cardStyle}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{plan.title}</h2>
                {plan.featured ? (
                  <span className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">추천</span>
                ) : null}
              </div>

              <p className="mt-2 text-sm text-slate-600">{plan.description}</p>

              <div className="mt-6 flex items-end gap-1">
                <span className="text-3xl font-bold tracking-tight text-slate-900">{plan.price}</span>
                <span className="pb-1 text-sm text-slate-500">{plan.period}</span>
              </div>

              <ul className="mt-6 space-y-2 text-sm text-slate-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => void handleSubscribe(plan.name)}
                disabled={processingPlan !== null}
                className={`mt-8 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  plan.featured
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {processingPlan === plan.name ? "구독 등록창 여는 중..." : plan.cta}
              </button>
              {plan.name !== "Free" ? (
                <p className="mt-2 text-xs text-slate-500">정기결제 등록 후 매월 자동 청구</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">결제수단 등록 없이 바로 시작</p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
