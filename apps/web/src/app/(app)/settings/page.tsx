import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { Avatar } from '@/components/app/avatar';
import { ActionButton } from '@/components/bookings/booking-actions';
import { DangerZone, PreferencesForm } from '@/components/growth/settings-forms';
import { getBlocked, getPreferences, getSessions } from '@/lib/growth';
import { shortDate } from '@/lib/format';
import {
  deleteAccountAction,
  revokeSessionAction,
  savePreferencesAction,
  signOutEverywhereAction,
  unblockAction,
} from '../growth-actions';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const [sessions, prefs, blocked] = await Promise.all([
    getSessions(),
    getPreferences(),
    getBlocked(),
  ]);
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader title="Settings" />
      <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
        <h2 className="text-h3">Notifications</h2>
        <PreferencesForm initial={prefs} save={savePreferencesAction} />
      </section>
      <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
        <h2 className="text-h3">Signed-in devices</h2>
        <ul className="grid gap-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sj-border px-3 py-2 text-small"
            >
              <span>
                <span className="font-semibold">{s.deviceName ?? s.platform ?? 'Device'}</span>
                {s.current && <span className="text-sj-primary"> · this browser</span>}
                <span className="block text-caption text-sj-muted-foreground">
                  Last used {shortDate(s.lastUsedAt)} · signed in {shortDate(s.createdAt)}
                </span>
              </span>
              {!s.current && (
                <ActionButton run={revokeSessionAction.bind(null, s.id)} variant="ghost">
                  Sign out
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
        <div>
          <ActionButton
            run={signOutEverywhereAction}
            variant="outline"
            confirm="Sign out on every device, including this one?"
          >
            Sign out everywhere
          </ActionButton>
        </div>
      </section>
      {blocked.length > 0 && (
        <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
          <h2 className="text-h3">Blocked people</h2>
          <ul className="grid gap-2">
            {blocked.map((b) => (
              <li key={b.user.id} className="flex items-center justify-between gap-2 text-small">
                <span className="flex items-center gap-2">
                  <Avatar name={b.user.name} url={b.user.avatarUrl} size={28} />{' '}
                  {b.user.name ?? 'Nivra user'}
                </span>
                <ActionButton run={unblockAction.bind(null, b.user.id)} variant="ghost">
                  Unblock
                </ActionButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      <DangerZone remove={deleteAccountAction} />
    </div>
  );
}
