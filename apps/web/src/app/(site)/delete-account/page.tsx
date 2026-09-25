import type { Metadata } from 'next';
import { LegalDraftNotice, Prose } from '@/components/site/legal';
import { PageShell } from '@/components/site/section';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your Sajha account and data, what is removed, and what we keep and for how long.',
  alternates: { canonical: '/delete-account' },
};

/** The account-deletion page Google Play asks every app for. */
export default function DeleteAccountPage() {
  return (
    <PageShell
      title="Delete your account"
      intro="You can delete your Sajha account and your data at any time, from the app or by email."
    >
      <Prose>
        <LegalDraftNotice updated="25 September 2026" />
        <h2>In the app</h2>
        <ol className="mt-4 list-decimal pl-6 [&_li]:mt-1">
          <li>Open Sajha and sign in.</li>
          <li>Tap your profile picture, then Settings.</li>
          <li>Tap Delete account and confirm.</li>
        </ol>
        <p>
          If you have a booking in progress (requested, confirmed, or an item still out), finish or
          cancel it first; the app will tell you.
        </p>
        <h2>By email</h2>
        <p>
          Can’t get into the app? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from
          the address on your account, or tell us the phone number you signed up with. We’ll confirm
          it’s you and delete the account within 7 days.
        </p>
        <h2>What’s deleted straight away</h2>
        <ul>
          <li>Your name, phone number, email address, profile photo and bio.</li>
          <li>Your listings and their photos.</li>
          <li>Your ID documents, and your signed-in devices and notification settings.</li>
          <li>Your payout bank details (Razorpay keeps what Indian payment rules require).</li>
        </ul>
        <h2>What we keep, and for how long</h2>
        <ul>
          <li>
            Payment, refund and payout records for past bookings, without your name or contact
            details: 8 years, as Indian tax and accounting rules require.
          </li>
          <li>
            Copies of documents shared for a past booking: deleted 30 days after that booking
            closed, or when an open dispute is settled.
          </li>
          <li>
            Chat messages and reviews from past rentals stay visible to the other person, without
            your name.
          </li>
          <li>Security and audit logs: 1 year.</li>
        </ul>
        <p>
          We send a confirmation to your verified email when the account is deleted. Questions:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Prose>
    </PageShell>
  );
}
