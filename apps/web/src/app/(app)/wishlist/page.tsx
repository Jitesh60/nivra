import { Button, EmptyState, PageHeader } from '@sajha/ui';
import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ListingGrid } from '@/components/browse/listing-card';
import { getFavorites } from '@/lib/discovery';

export const metadata: Metadata = { title: 'Wishlist' };

export default async function WishlistPage() {
  const saved = await getFavorites();
  return (
    <div className="grid gap-6">
      <PageHeader title="Wishlist" description="Things you saved for later." />
      {saved.length === 0 ? (
        <EmptyState
          icon={<Heart />}
          title="Nothing saved yet"
          description="Tap the heart on any item to keep it here."
          action={
            <Button asChild>
              <Link href="/explore">Explore items</Link>
            </Button>
          }
        />
      ) : (
        <ListingGrid listings={saved} />
      )}
    </div>
  );
}
