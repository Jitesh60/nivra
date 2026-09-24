'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function CopyButtons({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `Sajha Admin recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <Button asChild variant="outline">
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download="sajha-recovery-codes.txt"
        >
          Download
        </a>
      </Button>
    </div>
  );
}
