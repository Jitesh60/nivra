import type { Metadata } from 'next';
import Link from 'next/link';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, unwrap } from '@/lib/api';
import { adminFor } from '@/lib/guard';
import { rupees } from '@/lib/listings';
import { LEDGER_ACCOUNT_HINT, LEDGER_ACCOUNT_LABEL, LEDGER_ACCOUNTS } from '@/lib/payments';

export const metadata: Metadata = { title: 'Ledger' };

/** Credit − debit, shown the accountant's way: negatives in brackets. */
function balance(paise: number): string {
  return paise < 0 ? `(${rupees(-paise)})` : rupees(paise);
}

export default async function LedgerPage() {
  if (!(await adminFor('/payments'))) return <Forbidden />;
  const s = await unwrap((await adminApi()).GET('/v1/admin/ledger/summary'));

  const checks: { label: string; count: number; href?: string; testId: string }[] = [
    {
      label: 'Transactions that don’t balance',
      count: s.unbalancedTxns.length,
      testId: 'check-unbalanced',
    },
    {
      label: 'Captured payments with no ledger entry',
      count: s.capturedWithoutLedger,
      href: '/payments?tab=CAPTURED',
      testId: 'check-unposted',
    },
    {
      label: 'Refunds that failed at Razorpay',
      count: s.failedRefunds,
      testId: 'check-failed-refunds',
    },
    {
      label: 'Payouts that failed at Razorpay',
      count: s.failedTransfers,
      href: '/payments/payouts?status=FAILED',
      testId: 'check-failed-payouts',
    },
  ];

  return (
    <>
      <PageHeader
        title="Ledger"
        description="Double-entry books for every rupee moved: each transaction’s debits equal its credits."
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge
          data-testid="ledger-balanced"
          variant={s.balanced ? 'default' : 'destructive'}
          className="px-3 py-1 text-sm"
        >
          {s.balanced ? 'Balanced' : 'Not balanced'}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Debits {rupees(s.totalDebitPaise)} · Credits {rupees(s.totalCreditPaise)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Balances</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Credit − debit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LEDGER_ACCOUNTS.map((a) => (
                  <TableRow key={a} data-testid={`balance-${a}`}>
                    <TableCell>
                      {LEDGER_ACCOUNT_LABEL[a]}
                      <p className="text-xs text-muted-foreground">{LEDGER_ACCOUNT_HINT[a]}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {balance(s.balances[a])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Money through Razorpay</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Captured</span>
                <span data-testid="captured-total">{rupees(s.capturedPaise)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Refunded</span>
                <span>{rupees(s.refundedPaise)}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checks</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {checks.map((c) => (
                <div key={c.label} className="flex items-center justify-between gap-4">
                  <span>
                    {c.href && c.count > 0 ? (
                      <Link href={c.href} className="hover:underline">
                        {c.label}
                      </Link>
                    ) : (
                      c.label
                    )}
                  </span>
                  <Badge data-testid={c.testId} variant={c.count > 0 ? 'destructive' : 'secondary'}>
                    {c.count}
                  </Badge>
                </div>
              ))}
              {s.unbalancedTxns.length > 0 && (
                <p className="text-xs break-all text-destructive">
                  Unbalanced: {s.unbalancedTxns.join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
