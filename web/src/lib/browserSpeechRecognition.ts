/**
 * Chrome/Edge 등의 브라우저 내장 음성 인식(Web Speech API).
 * HTTPS 또는 localhost에서만 동작하는 경우가 많습니다.
 */

type SpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionResultList = { length: number; [index: number]: SpeechRecognitionResult };
type SpeechRecognitionEventLike = { resultIndex: number; results: SpeechRecognitionResultList };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechRecognitionAvailable(): boolean {
  return getRecognitionCtor() !== null;
}

export type KoSpeechHandlers = {
  /** 최종 확정 구간 */
  onFinal: (transcript: string) => void;
  /** 미확정(실시간) — 선택 */
  onInterim?: (transcript: string) => void;
  /** not-allowed, no-speech 등 */
  onError?: (message: string) => void;
  /** 인식 세션 종료(중지·무음 등) */
  onEnd?: () => void;
};

/**
 * 한국어 연속 인식 시작. 반환 `stop`으로 종료.
 * 확정된 문장마다 `onFinal`이 호출됩니다.
 */
export function startKoContinuousRecognition(handlers: KoSpeechHandlers): { stop: () => void } | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    handlers.onError?.("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요.");
    return null;
  }

  const rec = new Ctor();
  rec.lang = "ko-KR";
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (event: SpeechRecognitionEventLike) => {
    let interim = "";
    const results = event.results;
    for (let i = event.resultIndex; i < results.length; i++) {
      const result = results[i];
      const text = (result[0]?.transcript ?? "").trim();
      if (!text) continue;
      if (result.isFinal) handlers.onFinal(text);
      else interim += result[0]?.transcript ?? "";
    }
    const iTrim = interim.trim();
    if (iTrim) handlers.onInterim?.(iTrim);
  };

  rec.onerror = (event: { error: string; message?: string }) => {
    if (event.error === "aborted") return;
    if (event.error === "no-speech") return;
    const msg =
      event.error === "not-allowed"
        ? "마이크 권한이 필요합니다. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요."
        : event.message || event.error;
    handlers.onError?.(msg);
  };

  rec.onend = () => {
    handlers.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    handlers.onError?.("음성 인식을 시작할 수 없습니다.");
    return null;
  }

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    },
  };
}
