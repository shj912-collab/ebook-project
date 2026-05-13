/** 레슨 영상 QR/공개 페이지용 토큰 (DB `lesson_logs.video_access_token`) */
export function newVideoAccessToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.replace(/\./g, "").slice(0, 32);
}

export function getPublicLessonVideoPageUrl(token: string): string {
  const t = token.trim();
  const fromEnv =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
      : "";
  if (typeof window !== "undefined") {
    const base = fromEnv || window.location.origin;
    return `${base}/lesson-video/${encodeURIComponent(t)}`;
  }
  return `${fromEnv || ""}/lesson-video/${encodeURIComponent(t)}`;
}
