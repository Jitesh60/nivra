import type { Metadata } from 'next';
import { FaqList } from '@/components/sections/faq';
import { PageShell, Section } from '@/components/site/section';
import { faqs } from '@/content/site-content';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers about renting and lending on Nivra: prices, deposits, damage, IDs and more.',
  alternates: { canonical: '/faq' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <PageShell title="Frequently asked questions">
      <Section title="Everything about borrowing and lending">
        <FaqList />
      </Section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </PageShell>
  );
}
