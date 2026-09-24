'use client';

import { createSajhaClient } from '@sajha/api-client';
import { useState, type FormEvent } from 'react';
import { DotsLoader } from '@/components/ui/dots-loader';
import { GlowButton } from '@/components/ui/glow-button';
import { API_URL } from '@/lib/site';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'joined'; already: boolean }
  | { kind: 'error'; message: string };

const api = createSajhaClient(API_URL);

function attribution(): string | undefined {
  const utm = new URLSearchParams(window.location.search).get('utm_source');
  if (utm) return utm.slice(0, 100);
  try {
    const ref = document.referrer ? new URL(document.referrer).hostname : '';
    return ref && ref !== window.location.hostname ? ref.slice(0, 100) : undefined;
  } catch {
    return undefined;
  }
}

const field =
  'w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-ink-300 outline-none focus:border-accent-300 focus:ring-2 focus:ring-accent-300/40';

export function WaitlistForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get('role') || '');
    setStatus({ kind: 'sending' });
    try {
      const { data, error, response } = await api.POST('/v1/waitlist', {
        body: {
          email: String(form.get('email') ?? ''),
          city: String(form.get('city') ?? '') || undefined,
          role: role ? (role as 'BORROWER' | 'LENDER' | 'BOTH') : undefined,
          source: attribution(),
          website: String(form.get('website') ?? '') || undefined,
        },
      });
      if (data) return setStatus({ kind: 'joined', already: data.alreadyJoined });
      const code = (error as { error?: { code?: string } } | undefined)?.error?.code;
      setStatus({
        kind: 'error',
        message:
          code === 'VALIDATION_FAILED'
            ? 'Please enter a valid email address.'
            : response.status === 429
              ? 'Too many sign-ups from your network. Please try again in a while.'
              : 'Something went wrong. Please try again.',
      });
    } catch {
      setStatus({
        kind: 'error',
        message: 'Couldn’t reach Sajha. Check your connection and try again.',
      });
    }
  }

  if (status.kind === 'joined') {
    return (
      <div
        role="status"
        data-testid="waitlist-success"
        className="rounded-xl border border-brand-400/40 bg-brand-900/40 p-6"
      >
        <p className="font-display text-2xl font-bold text-white">
          {status.already ? 'You’re already on the list 🎉' : 'You’re on the list 🎉'}
        </p>
        <p className="mt-2 text-brand-100">We’ll email you when Sajha launches in your city.</p>
      </div>
    );
  }

  const sending = status.kind === 'sending';
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-ink-100">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={field}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-100">
          City <span className="sr-only">(optional)</span>
          <input
            name="city"
            autoComplete="address-level2"
            placeholder="Pune, Bengaluru, Dehradun…"
            maxLength={80}
            className={field}
          />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium text-ink-100">
        I’m interested in
        <select name="role" defaultValue="" className={field}>
          <option value="" className="text-ink-900">
            Choose one (optional)
          </option>
          <option value="BORROWER" className="text-ink-900">
            Borrowing things
          </option>
          <option value="LENDER" className="text-ink-900">
            Lending my things
          </option>
          <option value="BOTH" className="text-ink-900">
            Both
          </option>
        </select>
      </label>
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {status.kind === 'error' && (
        <p role="alert" data-testid="waitlist-error" className="text-sm text-accent-200">
          {status.message}
        </p>
      )}
      <GlowButton
        type="submit"
        disabled={sending}
        className="justify-self-start px-8 py-3.5 text-base"
      >
        {sending ? <DotsLoader label="Joining" /> : 'Join the waitlist'}
      </GlowButton>
      <p className="text-xs text-ink-300">
        We’ll only email you about Sajha’s launch. See our{' '}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
