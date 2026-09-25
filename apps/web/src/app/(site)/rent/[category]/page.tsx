import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site/section';
import { DownloadOrWaitlist } from '@/components/sections/download';
import { RENT_PAGES, rentPageBySlug } from '@/content/rent-pages';

export const dynamicParams = false;

export function generateStaticParams() {
  return RENT_PAGES.map((p) => ({ category: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<'/rent/[category]'>): Promise<Metadata> {
  const page = rentPageBySlug((await params).category);
  if (!page) return {};
  return {
    title: page.title,
    description: page.intro,
    alternates: { canonical: `/rent/${page.slug}` },
  };
}

export default async function RentPage({ params }: PageProps<'/rent/[category]'>) {
  const page = rentPageBySlug((await params).category);
  if (!page) notFound();
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  return (
    <PageShell title={page.title} intro={page.intro}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }}
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 md:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-950">
            {page.emoji} What people pay
          </h2>
          <p className="mt-2 text-ink-600">
            Typical daily prices on Sajha in Pune. Lenders set their own, plus a refundable deposit.
          </p>
          <table className="mt-6 w-full text-left" data-testid="price-table">
            <tbody>
              {page.examples.map((e) => (
                <tr key={e.item} className="border-b border-ink-200">
                  <th scope="row" className="py-3 font-medium text-ink-900">
                    {e.item}
                  </th>
                  <td className="py-3 text-right text-ink-700">{e.perDay} a day</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold text-ink-950">Questions</h2>
          <dl className="mt-4 grid gap-6">
            {page.faqs.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-ink-900">{f.q}</dt>
                <dd className="mt-1 text-ink-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <DownloadOrWaitlist />
    </PageShell>
  );
}
