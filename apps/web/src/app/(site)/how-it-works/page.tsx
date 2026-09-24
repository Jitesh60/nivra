import type { Metadata } from 'next';
import { HowItWorksTabs } from '@/components/sections/how-it-works';
import { TrustGrid } from '@/components/sections/trust';
import { WaitlistSection } from '@/components/sections/waitlist-section';
import { PageShell, Section } from '@/components/site/section';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'How renting and lending on Sajha works: find, chat, pay safely, hand over and return.',
  alternates: { canonical: '/how-it-works' },
};

export default function HowItWorksPage() {
  return (
    <PageShell
      title="How Sajha works"
      intro="Borrow for a few days, or lend something you rarely use. Here’s the whole journey."
    >
      <Section title="Step by step">
        <HowItWorksTabs />
      </Section>
      <Section title="What keeps it safe" className="bg-ink-50">
        <TrustGrid />
      </Section>
      <WaitlistSection />
    </PageShell>
  );
}
