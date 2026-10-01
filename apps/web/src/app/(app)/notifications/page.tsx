import { EmptyState, PageHeader } from '@sajha/ui';
import { Bell } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarkAllRead } from '@/components/chat/mark-all-read';
import { getNotifications, notificationHref } from '@/lib/chat';
import { markNotificationsReadAction } from './actions';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const { items, unread } = await getNotifications();
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader
        title="Notifications"
        description="Booking updates, offers and more."
        actions={
          unread > 0 &&
          items[0] && <MarkAllRead run={markNotificationsReadAction.bind(null, items[0].id)} />
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="You’re all caught up"
          description="Updates about your bookings show up here."
        />
      ) : (
        <ul className="grid divide-y divide-sj-border overflow-hidden rounded-lg border border-sj-border bg-sj-surface">
          {items.map((n, i) => {
            const href = notificationHref(n);
            const body = (
              <span className="flex gap-3 p-4">
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-sj-accent'}`}
                />
                <span className="grid gap-0.5">
                  <span className={n.readAt ? 'font-semibold' : 'font-bold'}>{n.title}</span>
                  <span className="text-small text-sj-muted-foreground">{n.body}</span>
                  <span className="text-caption text-sj-muted-foreground">
                    {new Date(n.createdAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </span>
              </span>
            );
            return (
              <li key={n.id} className="rise-in" style={{ '--i': i } as React.CSSProperties}>
                {href ? (
                  <Link href={href} className="block hover:bg-sj-surface-muted">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
