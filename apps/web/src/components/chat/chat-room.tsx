'use client';

import { Button, Input } from '@sajha/ui';
import { ArrowLeft, ImagePlus, MoreVertical, Send, Tag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Avatar } from '@/components/app/avatar';
import { FormMessage } from '@/components/app/form-bits';
import { shrinkImage } from '@/lib/client-image';
import { OfferCard, OfferForm } from './offers';
import type { ChatConversation, ChatMessage, Result } from './types';

const POLL_MS = 4000;

export function ChatRoom({
  conversation: c,
  initial,
  actions,
}: {
  conversation: ChatConversation;
  initial: ChatMessage[];
  actions: {
    latest: () => Promise<ChatMessage[] | null>;
    sendText: (body: string, clientId: string) => Promise<Result>;
    sendImage: (form: FormData) => Promise<Result>;
    markRead: (upTo: string) => Promise<void>;
    makeOffer: (
      offer: { startDate: string; endDate: string; rupeesPerDay: number },
      counterTo?: string,
    ) => Promise<Result>;
    answerOffer: (offerId: string, accept: boolean) => Promise<Result>;
    setBlocked: (block: boolean) => Promise<Result>;
    report: (
      reason: 'SPAM' | 'SCAM' | 'OFF_PLATFORM_PAYMENT' | 'INAPPROPRIATE' | 'OTHER',
      note: string,
    ) => Promise<Result>;
  };
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [offering, setOffering] = useState<{ counterTo?: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [pending, start] = useTransition();
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastRead = useRef<string | null>(null);

  const newest = useRef(initial.at(-1)?.id);
  const refresh = useCallback(async () => {
    const latest = await actions.latest();
    if (!latest) return;
    setMessages(latest);
    // Something happened (a reply, an accepted offer): refresh the header too,
    // e.g. so the new booking's link appears.
    const last = latest.at(-1)?.id;
    if (last !== newest.current) {
      newest.current = last;
      router.refresh();
    }
  }, [actions, router]);

  // New messages arrive by polling while the tab is visible.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  // Keep the newest message in view, and mark the other person's as read.
  const last = messages.at(-1);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
    if (last && !last.mine && lastRead.current !== last.id) {
      lastRead.current = last.id;
      void actions.markRead(last.id);
    }
  }, [last, actions]);

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const result = await fn();
      setError(result.error);
      setNotice(result.success);
      if (!result.error) after?.();
      await refresh();
      router.refresh();
    });

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    run(() => actions.sendText(body, crypto.randomUUID()));
  };

  const sendImage = (file: File | undefined) => {
    if (!file) return;
    run(async () => {
      const form = new FormData();
      form.set('image', await shrinkImage(file));
      form.set('clientId', crypto.randomUUID());
      const result = await actions.sendImage(form);
      if (fileInput.current) fileInput.current.value = '';
      return result;
    });
  };

  const pendingOfferId = c.pendingOffer?.id;

  return (
    <div className="mx-auto flex h-[calc(100dvh-9.5rem)] max-w-3xl flex-col overflow-hidden rounded-lg border border-sj-border bg-sj-surface md:h-[calc(100dvh-7.5rem)]">
      <header className="flex items-center gap-3 border-b border-sj-border p-3">
        <Link
          href="/inbox"
          aria-label="Back to inbox"
          className="grid size-9 place-items-center rounded-full hover:bg-sj-surface-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Avatar name={c.other.name} url={c.other.avatarUrl} size={40} />
        <div className="grid min-w-0 flex-1">
          <span className="truncate font-semibold">{c.other.name ?? 'Nivra user'}</span>
          <Link
            href={`/item/${c.listing.id}`}
            className="truncate text-caption text-sj-muted-foreground hover:underline"
          >
            {c.listing.title}
          </Link>
        </div>
        {c.openBookingId && (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/bookings/${c.openBookingId}`}>Booking</Link>
          </Button>
        )}
        <div className="relative">
          <button
            type="button"
            aria-label="Chat options"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            className="grid size-9 place-items-center rounded-full hover:bg-sj-surface-muted"
          >
            <MoreVertical className="size-5" />
          </button>
          {menu && (
            <SafetyMenu
              blocked={c.blockedByMe}
              onBlock={(block) => {
                setMenu(false);
                run(() => actions.setBlocked(block));
              }}
              onReport={(reason, note) => {
                setMenu(false);
                run(() => actions.report(reason, note));
              }}
            />
          )}
        </div>
      </header>

      <div
        ref={list}
        className="flex-1 space-y-2 overflow-y-auto bg-sj-background p-4"
        aria-live="polite"
      >
        <p className="mx-auto max-w-sm rounded-md bg-sj-surface px-3 py-2 text-center text-caption text-sj-muted-foreground">
          Keep chats and payments on Nivra. Phone numbers and links are hidden until a booking is
          confirmed.
        </p>
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            canAnswer={m.offer?.id === pendingOfferId && !m.offer?.mine && c.canMessage}
            onAccept={(id) => run(() => actions.answerOffer(id, true))}
            onDecline={(id) => run(() => actions.answerOffer(id, false))}
            onCounter={(id) => setOffering({ counterTo: id })}
          />
        ))}
      </div>

      {offering && (
        <OfferForm
          defaultRupees={Math.round(c.listing.pricePerDayPaise / 100)}
          counter={Boolean(offering.counterTo)}
          onCancel={() => setOffering(null)}
          onSubmit={(offer) =>
            run(
              () => actions.makeOffer(offer, offering.counterTo),
              () => setOffering(null),
            )
          }
        />
      )}

      <div className="border-t border-sj-border p-3">
        <FormMessage error={error} success={notice} className="mb-2" />
        {c.canMessage ? (
          <form onSubmit={send} className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Send a photo"
              onClick={() => fileInput.current?.click()}
              className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-sj-surface-muted"
            >
              <ImagePlus className="size-5" />
            </button>
            {!offering && !pendingOfferId && (
              <button
                type="button"
                aria-label="Make an offer"
                title="Make an offer"
                onClick={() => setOffering({})}
                className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-sj-surface-muted"
              >
                <Tag className="size-5" />
              </button>
            )}
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a message"
              aria-label="Message"
              maxLength={2000}
              className="min-w-0 flex-1"
            />
            <Button type="submit" size="icon" aria-label="Send" disabled={pending || !text.trim()}>
              <Send />
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Photo to send"
              onChange={(e) => sendImage(e.target.files?.[0])}
            />
          </form>
        ) : (
          <p className="text-center text-small text-sj-muted-foreground">
            {c.blockedByMe
              ? 'You blocked this person. Unblock them from the menu to chat.'
              : 'You can’t reply in this chat.'}
          </p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message: m,
  canAnswer,
  onAccept,
  onDecline,
  onCounter,
}: {
  message: ChatMessage;
  canAnswer: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCounter: (id: string) => void;
}) {
  if (m.type === 'SYSTEM') {
    return <p className="text-center text-caption text-sj-muted-foreground">{m.body}</p>;
  }
  const time = new Date(m.createdAt).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
      <div className="grid max-w-[80%] gap-1">
        {m.type === 'OFFER' && m.offer ? (
          <OfferCard
            offer={m.offer}
            canAnswer={canAnswer}
            onAccept={onAccept}
            onDecline={onDecline}
            onCounter={onCounter}
          />
        ) : m.type === 'IMAGE' && (m.thumbUrl || m.imageUrl) ? (
          <a
            href={m.imageUrl ?? m.thumbUrl!}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- storage URL */}
            <img src={m.thumbUrl ?? m.imageUrl!} alt="Photo" className="max-h-64 object-cover" />
          </a>
        ) : (
          <p
            className={`rounded-2xl px-3.5 py-2 text-small whitespace-pre-wrap break-words ${
              m.mine
                ? 'rounded-br-sm bg-sj-primary text-sj-on-primary'
                : 'rounded-bl-sm bg-sj-surface shadow-xs'
            }`}
          >
            {m.body}
          </p>
        )}
        <span className={`text-[11px] text-sj-muted-foreground ${m.mine ? 'text-right' : ''}`}>
          {time}
          {m.masked && ' · contact details hidden'}
          {m.mine && m.readAt && ' · Seen'}
        </span>
      </div>
    </div>
  );
}

const REASONS = [
  ['SCAM', 'Scam or fraud'],
  ['OFF_PLATFORM_PAYMENT', 'Asked to pay outside Nivra'],
  ['INAPPROPRIATE', 'Rude or inappropriate'],
  ['SPAM', 'Spam'],
  ['OTHER', 'Something else'],
] as const;

function SafetyMenu({
  blocked,
  onBlock,
  onReport,
}: {
  blocked: boolean;
  onBlock: (block: boolean) => void;
  onReport: (reason: (typeof REASONS)[number][0], note: string) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>('SCAM');
  const [note, setNote] = useState('');
  return (
    <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-sj-border bg-sj-surface p-2 shadow-md">
      {!reporting ? (
        <>
          <button
            type="button"
            onClick={() => onBlock(!blocked)}
            className="block w-full rounded-md px-3 py-2 text-left text-small hover:bg-sj-surface-muted"
          >
            {blocked ? 'Unblock' : 'Block this person'}
          </button>
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="block w-full rounded-md px-3 py-2 text-left text-small text-sj-danger hover:bg-sj-surface-muted"
          >
            Report
          </button>
        </>
      ) : (
        <div className="grid gap-2 p-1">
          <label className="grid gap-1 text-caption font-semibold">
            What happened?
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="h-10 rounded-md border border-sj-input bg-sj-surface px-2 text-small"
            >
              {REASONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Details (optional)"
            aria-label="Report details"
          />
          <Button type="button" variant="danger" size="sm" onClick={() => onReport(reason, note)}>
            Send report
          </Button>
        </div>
      )}
    </div>
  );
}
