import { Button, EmptyState } from '@sajha/ui';
import { PackageX } from 'lucide-react';
import Link from 'next/link';

export default function ItemNotFound() {
  return (
    <EmptyState
      icon={<PackageX />}
      title="This item isn’t available"
      description="It may have been paused or removed by the lender."
      action={
        <Button asChild>
          <Link href="/explore">Browse other items</Link>
        </Button>
      }
    />
  );
}
