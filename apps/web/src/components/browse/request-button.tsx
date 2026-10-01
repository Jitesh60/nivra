'use client';

import { Button } from '@sajha/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';
import { requestBookingAction } from '@/app/(app)/bookings/actions';

/** Sends a booking request for the quoted dates (guests sign in first and come back). */
export function RequestButton({
  listingId,
  startDate,
  endDate,
  signedIn,
}: {
  listingId: string;
  startDate: string;
  endDate: string;
  signedIn: boolean;
}) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        size="lg"
        loading={pending}
        loadingLabel="Sending request"
        onClick={() => {
          if (!signedIn) {
            router.push(`/login?next=${encodeURIComponent(`${pathname}?${search}`)}`);
            return;
          }
          start(async () =>
            setError((await requestBookingAction(listingId, startDate, endDate))?.error),
          );
        }}
      >
        Request to book
      </Button>
      <FormMessage error={error} />
      <p className="text-center text-caption text-sj-muted-foreground">
        You won’t pay until the lender accepts.
      </p>
    </div>
  );
}
