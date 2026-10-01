'use client';

import { Button, Input } from '@sajha/ui';
import { Copy, Share2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';

export function InviteShare({ link, code }: { link: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Rent things nearby on Nivra. Use my code ${code} for credit on your first rental: ${link}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard?.writeText(link).catch(() => undefined);
          setCopied(true);
        }}
      >
        <Copy /> {copied ? 'Link copied' : 'Copy link'}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (navigator.share)
            void navigator.share({ title: 'Nivra', text, url: link }).catch(() => undefined);
          else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        }}
      >
        <Share2 /> Share
      </Button>
    </div>
  );
}

export function RedeemForm({
  initial,
  redeem,
}: {
  initial: string;
  redeem: (code: string) => Promise<{ error?: string; success?: string }>;
}) {
  const [code, setCode] = useState(initial);
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setState(await redeem(code)));
      }}
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        aria-label="Friend’s code"
        placeholder="FRIEND-CODE"
        maxLength={20}
        className="w-48 font-mono uppercase"
      />
      <Button type="submit" loading={pending} loadingLabel="Applying">
        Apply code
      </Button>
      <FormMessage error={state.error} success={state.success} className="basis-full" />
    </form>
  );
}
