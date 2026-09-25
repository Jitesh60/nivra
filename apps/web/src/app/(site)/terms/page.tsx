import type { Metadata } from 'next';
import { LegalDraftNotice, Prose } from '@/components/site/legal';
import { PageShell } from '@/components/site/section';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for renting and lending on Nivra.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <PageShell title="Terms of Service">
      <Prose>
        <LegalDraftNotice updated="24 September 2026" />
        <h2>1. What Nivra is</h2>
        <p>
          Nivra is an online marketplace that connects people who want to rent items (“borrowers”)
          with people who own them (“lenders”). Nivra is an intermediary: rentals are agreements
          between the borrower and the lender.
        </p>
        <h2>2. Your account</h2>
        <ul>
          <li>You must be at least 18 years old.</li>
          <li>You verify your phone number, and your email before listing or renting.</li>
          <li>Keep your account secure. You’re responsible for activity on it.</li>
        </ul>
        <h2>3. Listing items</h2>
        <ul>
          <li>
            List only items you own or are allowed to rent out, described honestly with real photos.
          </li>
          <li>
            Prohibited: weapons, drugs, alcohol, medicines, vehicles that need registration,
            animals, counterfeit or stolen goods, adult content and hazardous materials.
          </li>
        </ul>
        <h2>4. Renting</h2>
        <ul>
          <li>The price, dates and refundable deposit are shown before you pay.</li>
          <li>
            Return items on time and in the condition you received them. Late returns may be charged
            from the deposit.
          </li>
          <li>
            Share documents a lender asks for only if you’re comfortable; you can decline the
            booking instead.
          </li>
        </ul>
        <h2>5. Payments, fees and deposits</h2>
        <p>
          Payments are processed by our payment partner. Nivra keeps a platform fee from the
          lender’s earnings. Deposits are refunded after the return, minus any amount agreed or
          decided for late return or damage.
        </p>
        <h2>6. Cancellations and disputes</h2>
        <p>
          Cancellation terms are shown before booking. If something goes wrong, either side can open
          a dispute; our team reviews the evidence (including condition photos) and decides how the
          deposit is used.
        </p>
        <h2>7. Conduct</h2>
        <p>
          Be respectful, keep deals and payments on Nivra, and don’t misuse other people’s data. We
          may suspend accounts that break these terms.
        </p>
        <h2>8. Liability</h2>
        <p>
          To the extent the law allows, Nivra isn’t liable for the condition of items or for how
          they’re used. Nothing here limits rights you have under Indian consumer law.
        </p>
        <h2>9. Governing law</h2>
        <p>These terms are governed by the laws of India.</p>
        <h2>10. Contact</h2>
        <p>
          Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Prose>
    </PageShell>
  );
}
