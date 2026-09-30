import { Badge, PageHeader } from '@sajha/ui';
import { BadgeCheck, Mail, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getMe } from '@/lib/api';
import { AvatarEditor } from './avatar-editor';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const me = await getMe();
  const phone = me.phone.replace(/^\+91/, '+91 ');
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader title="Profile" description="How other people see you on Nivra." />
      <section className="rounded-lg border border-sj-border bg-sj-surface p-6 shadow-sm">
        <AvatarEditor name={me.name} url={me.avatarUrl} />
        <div className="mt-6">
          <ProfileForm name={me.name ?? ''} city={me.city ?? ''} bio={me.bio ?? ''} />
        </div>
      </section>
      <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-6 shadow-sm">
        <h2 className="text-h3">Contact and verification</h2>
        <p className="flex flex-wrap items-center gap-2 text-small">
          <Phone className="size-4 text-sj-muted-foreground" /> {phone}
          <Badge tone="success">Verified</Badge>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-small">
          <Mail className="size-4 text-sj-muted-foreground" /> {me.email ?? 'No email yet'}
          {me.emailVerified ? (
            <Badge tone="success">Verified</Badge>
          ) : (
            <Link
              href="/welcome/email?next=/profile"
              className="font-semibold text-sj-primary underline-offset-4 hover:underline"
            >
              {me.email ? 'Verify email' : 'Add email'}
            </Link>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-small">
          <BadgeCheck className="size-4 text-sj-muted-foreground" /> ID{' '}
          {me.idVerified ? (
            <Badge tone="success">Verified</Badge>
          ) : (
            <span className="text-sj-muted-foreground">
              Not verified yet. Add an ID document to build trust.
            </span>
          )}
        </p>
      </section>
    </div>
  );
}
