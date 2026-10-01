'use client';

import { Button } from '@sajha/ui';
import { MessageCircle } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { startChatAction } from '@/app/(app)/inbox/actions';
import { FormMessage } from '@/components/app/form-bits';

/** "Message lender": opens the chat about this item (guests sign in first). */
export function StartChatButton({ listingId }: { listingId: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        loading={pending}
        loadingLabel="Opening chat"
        onClick={() =>
          start(async () => {
            const result = await startChatAction(listingId);
            if (result?.signIn) {
              const here = `${pathname}${search.size ? `?${search}` : ''}`;
              router.push(`/login?next=${encodeURIComponent(here)}`);
            } else setError(result?.error);
          })
        }
      >
        <MessageCircle /> Message lender
      </Button>
      <FormMessage error={error} />
    </div>
  );
}
