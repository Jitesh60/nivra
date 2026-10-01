'use client';

import { Button, Input } from '@sajha/ui';
import { useState } from 'react';
import { rupees, shortDate, todayIst } from '@/lib/format';
import type { ChatOffer } from './types';

const STATUS: Record<string, string> = {
  PENDING: 'Waiting for an answer',
  ACCEPTED: 'Accepted',
  COUNTERED: 'Countered',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  SUPERSEDED: 'Replaced by a newer offer',
};

/** A price offer in the chat, with Accept / Counter / Decline for the other side. */
export function OfferCard({
  offer: o,
  canAnswer,
  onAccept,
  onDecline,
  onCounter,
}: {
  offer: ChatOffer;
  canAnswer: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCounter: (id: string) => void;
}) {
  return (
    <div
      className="grid gap-2 rounded-lg border border-sj-border bg-sj-surface p-3 shadow-xs"
      data-testid="offer-card"
    >
      <p className="text-caption font-semibold tracking-wide text-sj-primary uppercase">
        {o.mine ? 'Your offer' : 'Offer'}
      </p>
      <p className="text-small">
        {shortDate(o.startDate)} – {shortDate(o.endDate)} · {o.days} {o.days === 1 ? 'day' : 'days'}
      </p>
      <p className="font-semibold">
        {rupees(o.pricePerDayPaise)} / day · {rupees(o.rentPaise)} rent
      </p>
      <p className="text-caption text-sj-muted-foreground">
        + {rupees(o.depositPaise)} refundable deposit · {STATUS[o.status] ?? o.status}
      </p>
      {canAnswer && o.status === 'PENDING' && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => onAccept(o.id)}>
            Accept
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onCounter(o.id)}>
            Counter
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onDecline(o.id)}>
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}

export function OfferForm({
  defaultRupees,
  counter,
  onSubmit,
  onCancel,
}: {
  defaultRupees: number;
  counter: boolean;
  onSubmit: (offer: { startDate: string; endDate: string; rupeesPerDay: number }) => void;
  onCancel: () => void;
}) {
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [price, setPrice] = useState(String(defaultRupees));
  const valid = startDate && endDate && endDate >= startDate && Number(price) > 0;
  return (
    <form
      className="grid gap-2 border-t border-sj-border bg-sj-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ startDate, endDate, rupeesPerDay: Number(price) });
      }}
    >
      <p className="text-small font-semibold">{counter ? 'Counter-offer' : 'Make an offer'}</p>
      <div className="grid grid-cols-3 gap-2">
        <label className="grid gap-1 text-caption font-semibold">
          From
          <Input
            type="date"
            min={todayIst()}
            value={startDate}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </label>
        <label className="grid gap-1 text-caption font-semibold">
          To
          <Input
            type="date"
            min={startDate || todayIst()}
            value={endDate}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </label>
        <label className="grid gap-1 text-caption font-semibold">
          ₹ per day
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid}>
          {counter ? 'Send counter-offer' : 'Send offer'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
