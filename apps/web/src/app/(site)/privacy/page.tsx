import type { Metadata } from 'next';
import { LegalDraftNotice, Prose } from '@/components/site/legal';
import { PageShell } from '@/components/site/section';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Sajha collects, uses and protects your personal data.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <PageShell title="Privacy Policy">
      <Prose>
        <LegalDraftNotice updated="24 September 2026" />
        <p>
          Sajha (“we”) runs a marketplace where people rent items to and from each other in India.
          This policy explains what personal data we collect, why, and the choices you have, in line
          with the Digital Personal Data Protection Act, 2023.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: your mobile number, email address and name.</li>
          <li>
            Verification: one-time codes we send you (stored only in scrambled form, for minutes).
          </li>
          <li>Listings and bookings: items, photos, prices, dates, messages and reviews.</li>
          <li>
            Documents a lender asks for, such as a government or college ID, when you choose to
            share them.
          </li>
          <li>
            Payments: handled by our payment partner. We never see or store your card or UPI
            details.
          </li>
          <li>Device and usage data: device type, app version, IP address and security logs.</li>
          <li>Waitlist: your email and, if you give them, your city and interest.</li>
        </ul>
        <h2>Why we use it</h2>
        <ul>
          <li>To create and secure your account and verify your phone and email.</li>
          <li>To run rentals: listings, chat, bookings, payments, deposits and support.</li>
          <li>To keep the community safe: preventing fraud and resolving disputes.</li>
          <li>To tell you about Sajha’s launch if you joined the waitlist.</li>
        </ul>
        <h2>Documents you share</h2>
        <p>
          An ID you share for a booking is visible only to that booking’s lender, only while the
          booking is active. Every view is logged, and shared copies are deleted after the booking
          ends (unless a dispute is open).
        </p>
        <h2>Who we share it with</h2>
        <p>
          The other person in a rental (only what they need), and service providers that help us run
          Sajha: hosting, SMS, email and payments. We don’t sell your personal data.
        </p>
        <h2>How long we keep it</h2>
        <p>
          We keep account data while your account is open. When you delete your account in the app,
          we remove your name, phone number and email, and keep only what the law requires (for
          example, payment records).
        </p>
        <h2>Your rights</h2>
        <p>
          You can access, correct or delete your data and withdraw consent. Most of this can be done
          in the app; for anything else, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <h2>Grievance officer</h2>
        <p>
          Name and contact details will be published here before launch. Until then, write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Prose>
    </PageShell>
  );
}
