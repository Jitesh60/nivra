'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * Big digits and a QR (same payload as the app). The page re-checks every few
 * seconds, so it moves on by itself once the other person confirms.
 */
export function CodeDisplay({ code, qr, status }: { code: string; qr: string; status: string }) {
  const [src, setSrc] = useState<string>();
  const router = useRouter();
  useEffect(() => {
    QRCode.toDataURL(qr, { margin: 1, width: 240, color: { dark: '#12151C', light: '#FFFFFF' } })
      .then(setSrc)
      .catch(() => setSrc(undefined));
  }, [qr]);
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [router, status]);
  return (
    <div className="grid justify-items-center gap-5 rounded-lg border border-sj-border bg-sj-surface p-6 shadow-sm">
      <p
        className="font-mono text-[44px] leading-none font-bold tracking-[0.3em]"
        data-testid="stage-code"
        aria-label={`Code ${code.split('').join(' ')}`}
      >
        {code}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      {src && <img src={src} alt="QR code of the same code" width={200} height={200} />}
      <p className="text-caption text-sj-muted-foreground">Waiting for them to confirm…</p>
    </div>
  );
}
