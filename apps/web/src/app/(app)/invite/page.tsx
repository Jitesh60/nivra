import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { InviteShare, RedeemForm } from '@/components/growth/invite';
import { rupees, shortDate } from '@/lib/format';
import { getReferral } from '@/lib/growth';
import { redeemCodeAction } from '../growth-actions';

export const metadata: Metadata = { title: 'Invite friends' };

export default async function InvitePage({ searchParams }: PageProps<'/invite'>) {
  const [ref, sp] = await Promise.all([getReferral(), searchParams]);
  const r = ref.rules;
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader
        title="Invite friends"
        description={`They get ${rupees(r.refereeCreditPaise)} off their first rental; you get ${rupees(r.referrerCreditPaise)} when they finish it.`}
      />
      <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
        <p className="text-caption font-semibold tracking-wide text-sj-muted-foreground uppercase">
          Your code
        </p>
        <p className="font-mono text-h1 tracking-widest" data-testid="referral-code">
          {ref.code}
        </p>
        <InviteShare link={ref.link} code={ref.code} />
        <p className="text-small text-sj-muted-foreground">
          {ref.invited} joined · {ref.rewarded} rewarded · credit balance{' '}
          <strong className="text-sj-foreground">{rupees(ref.creditBalancePaise)}</strong>
        </p>
      </section>
      {ref.referredBy && (
        <p
          role="status"
          className="rounded-md bg-sj-primary-soft px-4 py-3 text-small text-sj-on-primary-soft"
        >
          You joined with {(ref.referredBy as { name?: string | null }).name ?? 'a friend'}’s code.
          Your credit is applied to your first booking.
        </p>
      )}
      {ref.canRedeem && (
        <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
          <h2 className="text-h3">Got a code from a friend?</h2>
          {ref.redeemBefore && (
            <p className="text-small text-sj-muted-foreground">
              Use it before {shortDate(ref.redeemBefore)}.
            </p>
          )}
          <RedeemForm
            initial={typeof sp.code === 'string' ? sp.code : ''}
            redeem={redeemCodeAction}
          />
        </section>
      )}
      {ref.entries.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-h3">Credit history</h2>
          <ul className="grid gap-1 text-small">
            {ref.entries.map((e) => (
              <li
                key={e.id}
                className="flex justify-between rounded-md border border-sj-border bg-sj-surface px-3 py-2"
              >
                <span>{e.reason}</span>
                <span className={e.amountPaise < 0 ? 'text-sj-muted-foreground' : 'font-semibold'}>
                  {e.amountPaise < 0 ? `−${rupees(-e.amountPaise)}` : `+${rupees(e.amountPaise)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-caption text-sj-muted-foreground">
        Credit covers up to {r.maxShareOfRentPct}% of the rent, and you can earn it for up to{' '}
        {r.maxReferrerRewards} friends.
      </p>
    </div>
  );
}
