import { ShaderBackground, SpotlightCard } from '@sajha/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GlowLink } from '@/components/ui/glow-button';
import { DownloadOrWaitlist } from '@/components/sections/download';
import { API_URL } from '@/lib/site';
import { formatInr } from '@/lib/utils';
import { CopyCode } from './copy-code';

interface Lookup {
  valid: boolean;
  inviterFirstName: string | null;
  refereeCreditPaise: number;
  redeemWithinDays: number;
}

/** Invite links are personal: keep them out of search results. */
export const metadata: Metadata = {
  title: 'You’re invited',
  description: 'A friend invited you to Nivra: credit off your first rental.',
  robots: { index: false, follow: false },
};

async function lookup(code: string): Promise<Lookup | null> {
  try {
    const res = await fetch(`${API_URL}/v1/referral-codes/${encodeURIComponent(code)}`, {
      next: { revalidate: 300 },
    });
    return res.ok ? ((await res.json()) as Lookup) : null;
  } catch {
    return null;
  }
}

/** Where the app's invite links land (PUBLIC_SITE_URL/r/<code>). */
export default async function InvitePage({ params }: PageProps<'/r/[code]'>) {
  const raw = decodeURIComponent((await params).code);
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  const invite = await lookup(code);

  if (!invite?.valid) {
    return (
      <main>
        <section className="bg-ink-50 px-4 py-20">
          <div className="mx-auto max-w-2xl text-center" data-testid="invite-invalid">
            <h1 className="font-display text-h1 text-ink-950">This invite link doesn’t work</h1>
            <p className="mt-4 text-body text-ink-600">
              The code may be mistyped, or the person who shared it no longer has an account. You
              can still join Nivra and borrow from people near you.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <GlowLink href="/" variant="brand">
                Go to Nivra
              </GlowLink>
              <Link
                href="/faq"
                className="inline-flex h-11 items-center rounded-full px-5 font-semibold text-brand-700 hover:underline"
              >
                Read the FAQ
              </Link>
            </div>
          </div>
        </section>
        <DownloadOrWaitlist />
      </main>
    );
  }

  const credit = formatInr(invite.refereeCreditPaise / 100);
  const who = invite.inviterFirstName ?? 'A friend';
  const steps = [
    {
      title: 'Get the app',
      body: 'Download Nivra (or join the waitlist below while we launch in your city).',
    },
    {
      title: 'Sign up with your phone',
      body: 'A one-time code to your number is all it takes. No passwords.',
    },
    {
      title: 'Enter the code',
      body: `Open Profile → Invite friends and enter ${code} within ${invite.redeemWithinDays} days of joining, before your first booking.`,
    },
  ];

  return (
    <main>
      <section className="relative isolate overflow-hidden px-4 py-20 text-white sm:py-28">
        <ShaderBackground testId="invite" className="bg-ink-950" />
        <div className="mx-auto max-w-4xl">
          <p className="text-caption tracking-[0.3em] text-accent-300 uppercase">
            Borrow · Lend · Share
          </p>
          <h1 className="mt-3 font-display text-h1 sm:text-display" data-testid="invite-heading">
            {who} invited you to Nivra
          </h1>
          <p className="mt-4 max-w-2xl text-title font-normal text-white/85">
            Join with their code and get <strong className="text-accent-300">{credit}</strong> off
            your first rental. Borrow tents, cameras and tools from people nearby, for a few days
            and a small price.
          </p>
          <div className="mt-8">
            <CopyCode code={code} />
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-h2 text-ink-950">How to use your invite</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title}>
                <SpotlightCard className="h-full">
                  <span className="grid size-10 place-items-center rounded-full bg-brand-50 font-display text-title text-brand-700">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-h3 text-ink-950">{s.title}</h3>
                  <p className="mt-2 text-small text-ink-600">{s.body}</p>
                </SpotlightCard>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-small text-ink-600">
            Credit comes off the rent (never the deposit), up to half of it per booking. {who} gets
            credit too once you finish your first rental.{' '}
            <Link href="/faq" className="text-brand-700 underline">
              How invite credit works
            </Link>
          </p>
        </div>
      </section>

      <DownloadOrWaitlist />
    </main>
  );
}
