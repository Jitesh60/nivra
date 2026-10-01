import { EmptyState, PageHeader } from '@sajha/ui';
import { MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar } from '@/components/app/avatar';
import { getConversations } from '@/lib/chat';
import { shortDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Inbox' };

export default async function InboxPage() {
  const { items } = await getConversations();
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="Inbox" description="Chats with lenders and borrowers." />
      {items.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title="No messages yet"
          description="Message a lender from any item page to ask questions or make an offer."
        />
      ) : (
        <ul className="grid divide-y divide-sj-border overflow-hidden rounded-lg border border-sj-border bg-sj-surface">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/inbox/${c.id}`}
                className="flex items-center gap-3 p-3 hover:bg-sj-surface-muted"
              >
                <Avatar name={c.other.name} url={c.other.avatarUrl} size={44} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate ${c.unreadCount ? 'font-bold' : 'font-semibold'}`}>
                      {c.other.name ?? 'Nivra user'}
                    </span>
                    <span className="shrink-0 text-caption text-sj-muted-foreground">
                      {shortDate(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className="truncate text-caption text-sj-muted-foreground">
                    {c.listing.title}
                  </span>
                  <span
                    className={`truncate text-small ${c.unreadCount ? 'font-semibold text-sj-foreground' : 'text-sj-muted-foreground'}`}
                  >
                    {c.lastMessagePreview ?? 'No messages yet'}
                  </span>
                </span>
                {c.unreadCount > 0 && (
                  <span className="grid min-w-6 place-items-center rounded-full bg-sj-accent px-1.5 text-caption font-bold text-sj-on-accent">
                    {c.unreadCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
