import { Badge, PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PayoutForm } from '@/components/bookings/payout-form';
import { RupeeTicker } from '@/components/effects/rupee-ticker';
import { getEarnings } from '@/lib/bookings';
import { rupees, shortDate } from '@/lib/format';
import { savePayoutAccountAction } from './actions';

export const metadata: Metadata = { title: 'Earnings' };

const ITEM_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }
> = {
  AWAITING_ACCOUNT: { label: 'Add bank account', tone: 'warning' },
  ON_HOLD: { label: 'On hold', tone: 'info' },
  RELEASED: { label: 'Paid', tone: 'success' },
  REVERSED: { label: 'Reversed', tone: 'danger' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

const ACCOUNT_STATUS: Record<string, string> = {
  PENDING: 'Being verified with your bank.',
  NEEDS_CLARIFICATION: 'Our payment partner needs more details. Contact support.',
  ACTIVATED: 'Verified. Payouts go here.',
  REJECTED: 'Rejected. Contact support to fix it.',
};

export default async function EarningsPage() {
  const earnings = await getEarnings();
  const { totals, account } = earnings;
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader
        title="Earnings"
        description="What you’ve earned from lending, after Nivra’s fee."
      />
      <section className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ['Paid out', totals.paidPaise],
            ['On hold', totals.onHoldPaise],
            ['Waiting for your bank account', totals.awaitingAccountPaise],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rise-in rounded-lg border border-sj-border bg-sj-surface p-4">
            <p className="text-caption text-sj-muted-foreground">{label}</p>
            <p className="font-display text-h2">
              <RupeeTicker paise={value} />
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
        <h2 className="text-h3">Bank account</h2>
        {account ? (
          <p className="text-small">
            {account.beneficiaryName} · A/c ••••{account.bankLast4} · {account.ifsc} · PAN ••••
            {account.panLast4}
            <span className="block text-sj-muted-foreground">{ACCOUNT_STATUS[account.status]}</span>
          </p>
        ) : (
          <>
            <p className="text-small text-sj-muted-foreground">
              Add the account your earnings should go to. It can be set once; contact support to
              change it later.
            </p>
            <PayoutForm action={savePayoutAccountAction} />
          </>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-h3">History</h2>
        {earnings.items.length === 0 ? (
          <p className="text-small text-sj-muted-foreground">
            Nothing yet.{' '}
            <Link href="/listings" className="underline">
              List something
            </Link>{' '}
            to start earning.
          </p>
        ) : (
          <ul className="grid gap-2">
            {earnings.items.map((e) => (
              <li key={`${e.bookingId}-${e.createdAt}`}>
                <Link
                  href={`/bookings/${e.bookingId}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-sj-border bg-sj-surface px-4 py-3 text-small"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{e.listingTitle}</span>
                    <span className="text-sj-muted-foreground">
                      {shortDate(e.startDate)} – {shortDate(e.endDate)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {rupees(e.amountPaise)}
                    <Badge tone={ITEM_STATUS[e.status]?.tone ?? 'neutral'}>
                      {ITEM_STATUS[e.status]?.label ?? e.status}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
