/**
 * 브라우저·Supabase(Auth·Postgrest·RPC) 등에서 던지는 값을 UI용 문자열로 만듭니다.
 * 객체를 `String(obj)`만 하면 "[object Object]"가 되므로 message·details·hint를 순서대로 추출합니다.
 */
export function toUserMessage(err: unknown): string {
  if (err == null || err === undefined) {
    return "알 수 없는 오류가 발생했습니다.";
  }
  if (typeof err === "string") {
    const t = err.trim();
    return t.length > 0 ? t : "알 수 없는 오류가 발생했습니다.";
  }
  if (typeof err === "number" || typeof err === "boolean") {
    return String(err);
  }

  if (err instanceof Error) {
    const m = err.message?.trim();
    if (m && m !== "[object Object]") return m;
  }

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const chunks: string[] = [];
    const textKeys = ["message", "msg", "error_description", "description"] as const;
    for (const key of textKeys) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) chunks.push(v.trim());
    }
    if (typeof o.details === "string" && o.details.trim()) chunks.push(o.details.trim());
    if (typeof o.hint === "string" && o.hint.trim()) chunks.push(`힌트: ${o.hint.trim()}`);

    if (typeof o.code === "string" && o.code.trim()) {
      chunks.push(`코드 ${o.code.trim()}`);
    }

    if (chunks.length > 0) return chunks.join(" ");

    try {
      const s = JSON.stringify(o);
      if (s && s !== "{}") return s;
    } catch {
      /* empty */
    }
  }

  try {
    const s = String(err);
    if (s === "[object Object]") return "알 수 없는 오류가 발생했습니다. (세부 정보 없음)";
    return s;
  } catch {
    return "알 수 없는 오류가 발생했습니다.";
  }
}
