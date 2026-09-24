import type { Metadata } from 'next';
import { WaitlistSection } from '@/components/sections/waitlist-section';
import { PageShell, Section } from '@/components/site/section';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Sajha team.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <PageShell
      title="Contact us"
      intro="Questions, partnerships or feedback: we’d love to hear from you."
    >
      <Section title="Email">
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-display text-2xl font-semibold text-brand-700 underline"
        >
          {CONTACT_EMAIL}
        </a>
        <p className="mt-4 text-ink-600">We usually reply within two working days.</p>
      </Section>
      <WaitlistSection />
    </PageShell>
  );
}
