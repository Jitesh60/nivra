import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { LedgerAccount, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isBalanced, type Line } from './ledger.js';

export interface LedgerSummary {
  balances: Record<LedgerAccount, number>;
  totalDebitPaise: number;
  totalCreditPaise: number;
  balanced: boolean;
  unbalancedTxns: string[];
}

/** Writes balanced ledger transactions and reports on them. */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** One balanced transaction, inside the caller's database transaction. */
  async post(
    tx: Prisma.TransactionClient,
    meta: { type: string; bookingId?: string | null; externalRef?: string | null },
    lines: Line[],
  ): Promise<string> {
    if (lines.length === 0) return '';
    if (!isBalanced(lines)) throw new Error(`Unbalanced ledger posting: ${meta.type}`);
    const txnId = randomUUID();
    await tx.ledgerEntry.createMany({
      data: lines.map((l) => ({
        txnId,
        bookingId: meta.bookingId ?? null,
        type: meta.type,
        account: l.account,
        debitPaise: l.debitPaise ?? 0,
        creditPaise: l.creditPaise ?? 0,
        externalRef: meta.externalRef ?? null,
      })),
    });
    return txnId;
  }

  /** Balance per account (credits minus debits), and whether everything adds up. */
  async summary(): Promise<LedgerSummary> {
    const [byAccount, unbalanced] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['account'],
        _sum: { debitPaise: true, creditPaise: true },
      }),
      this.prisma.$queryRaw<{ txn_id: string }[]>`
        SELECT txn_id FROM ledger_entries GROUP BY txn_id
        HAVING SUM(debit_paise) <> SUM(credit_paise) LIMIT 50`,
    ]);
    const balances = {
      GATEWAY: 0,
      DEPOSIT_HELD: 0,
      LENDER_PAYABLE: 0,
      PLATFORM_REVENUE: 0,
      GOODWILL: 0,
      PROMOTIONS: 0,
    } as Record<LedgerAccount, number>;
    let debit = 0;
    let credit = 0;
    for (const row of byAccount) {
      const d = row._sum.debitPaise ?? 0;
      const c = row._sum.creditPaise ?? 0;
      balances[row.account] = c - d;
      debit += d;
      credit += c;
    }
    const unbalancedTxns = unbalanced.map((r) => r.txn_id);
    return {
      balances,
      totalDebitPaise: debit,
      totalCreditPaise: credit,
      balanced: debit === credit && unbalancedTxns.length === 0,
      unbalancedTxns,
    };
  }
}
