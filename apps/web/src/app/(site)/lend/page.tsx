import type { Metadata } from 'next';
import { EarningsCalculator } from '@/components/sections/earnings-calculator';
import { HowItWorksTabs } from '@/components/sections/how-it-works';
import { TrustGrid } from '@/components/sections/trust';
import { WaitlistSection } from '@/components/sections/waitlist-section';
import { PageShell, Section } from '@/components/site/section';

export const metadata: Metadata = {
  title: 'Lend on Nivra',
  description: 'Earn from things you rarely use. You set the price, the dates and the deposit.',
  alternates: { canonical: '/lend' },
};

export default function LendPage() {
  return (
    <PageShell
      title="Earn from things you rarely use"
      intro="That tent, camera or drill could pay for itself. You set the price, the dates and the deposit, and you choose who borrows."
    >
      <Section title="Estimate your earnings">
        <EarningsCalculator />
      </Section>
      <Section title="How lending works" className="bg-ink-50">
        <HowItWorksTabs initial="lend" />
      </Section>
      <Section title="Protection for lenders">
        <TrustGrid />
      </Section>
      <WaitlistSection />
    </PageShell>
  );
}
