"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  url: string;
  /** 픽셀 너비 */
  size?: number;
};

export function VideoQrBlock({ url, size = 168 }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: "M" }).then((dataUrl) => {
      if (!cancelled) setSrc(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!src) {
    return <p className="text-[11px] text-slate-500">QR 생성 중…</p>;
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
    />
  );
}
