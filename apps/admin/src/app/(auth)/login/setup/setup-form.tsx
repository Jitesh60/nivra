'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CodeInput } from '@/components/auth/code-input';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import { startSetupAction, verifyAction, type SetupResult } from '../actions';

export function SetupForm({ next }: { next: string }) {
  const [setup, setSetup] = useState<SetupResult>();
  const started = useRef(false);
  const [state, action] = useActionState(verifyAction, {});

  // Each setup call creates a new secret, so request it exactly once
  // (the ref survives React's development double-mount).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startSetupAction().then(setSetup);
  }, []);

  if (!setup) return <p className="text-sm text-muted-foreground">Preparing your QR code…</p>;
  if (setup.error) {
    return (
      <div className="grid gap-4">
        <FormError message={setup.error} />
        <Link href="/login" className="text-sm underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="next" value={next} />
      <ol className="grid gap-4 text-sm">
        <li>
          1. Scan this code with Google Authenticator, Microsoft Authenticator, 1Password or a
          similar app.
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
          <img
            src={setup.qrDataUrl}
            alt="QR code for your authenticator app"
            width={200}
            height={200}
            className="mx-auto mt-3 rounded-md border bg-white p-2"
          />
          <details className="mt-2 text-muted-foreground">
            <summary className="cursor-pointer">Can’t scan? Enter this key instead</summary>
            <code
              data-testid="totp-secret"
              className="mt-1 block break-all font-mono text-xs text-foreground"
            >
              {setup.secret}
            </code>
          </details>
        </li>
        <li>2. Enter the 6-digit code the app shows.</li>
      </ol>
      <CodeInput />
      <FormError message={state.error} />
      <SubmitButton>Turn on two-factor authentication</SubmitButton>
    </form>
  );
}
