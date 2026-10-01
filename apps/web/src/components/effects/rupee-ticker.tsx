'use client';

import { CountUp } from '@sajha/ui';
import { rupees } from '@/lib/format';

/** An amount in paise that counts up when it scrolls into view (React Bits "CountUp"). */
export function RupeeTicker({ paise }: { paise: number }) {
  return <CountUp to={paise} format={(n) => rupees(Math.round(n))} />;
}
