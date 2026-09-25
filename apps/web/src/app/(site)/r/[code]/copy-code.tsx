'use client';

import { Button } from '@sajha/ui';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** The invite code, big, with a copy button. */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        data-testid="invite-code"
        className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 font-mono text-h2 tracking-[0.2em] text-white backdrop-blur"
      >
        {code}
      </span>
      <Button
        variant="inverse"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // No clipboard (older browser): the code is on screen to type.
          }
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? 'Copied' : 'Copy code'}
      </Button>
    </div>
  );
}
