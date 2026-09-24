import type { Schemas } from '@sajha/api-client';

export type AdminDispute = Schemas['AdminDisputeDto'];
export type AdminDisputeDetail = Schemas['AdminDisputeDetailDto'];
export type ConditionReport = Schemas['AdminConditionReportDto'];
export type DisputeStatus = AdminDispute['status'];

export const DISPUTE_TABS: DisputeStatus[] = ['OPEN', 'RESOLVED'];

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  OPEN: 'Open',
  RESOLVED: 'Settled',
};

export const DISPUTE_REASON_LABEL: Record<AdminDispute['reason'], string> = {
  DAMAGE: 'Damaged',
  MISSING_PARTS: 'Missing parts',
  NOT_RETURNED: 'Not returned',
  OTHER: 'Something else',
};

export const STAGE_LABEL: Record<ConditionReport['stage'], string> = {
  HANDOVER: 'At handover',
  RETURN: 'At return',
};

/**
 * Where the deposit goes if the lender is awarded [keptPaise]: the late fee
 * always goes to the lender on top, and the rest goes back to the borrower.
 */
export function depositSplit(
  depositPaise: number,
  lateFeePaise: number,
  keptPaise: number,
): { lenderPaise: number; borrowerPaise: number } {
  const lenderPaise = lateFeePaise + keptPaise;
  return { lenderPaise, borrowerPaise: Math.max(0, depositPaise - lenderPaise) };
}
