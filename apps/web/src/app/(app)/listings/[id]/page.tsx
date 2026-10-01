import { Badge, PageHeader } from '@sajha/ui';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BlocksEditor } from '@/components/listings/blocks-editor';
import { DetailsForm } from '@/components/listings/details-form';
import { DocsEditor } from '@/components/listings/docs-editor';
import { PhotosEditor } from '@/components/listings/photos-editor';
import { PickupEditor } from '@/components/listings/pickup-editor';
import { EditorSection } from '@/components/listings/section';
import { StatusPanel } from '@/components/listings/status-panel';
import { getCategories } from '@/lib/discovery';
import { getAppConfig, getMyListing, missingForPublish, STATUS } from '@/lib/listings';
import {
  addPhotosAction,
  deleteListingAction,
  publishAction,
  removePhotoAction,
  reorderPhotosAction,
  saveBlocksAction,
  saveDocsAction,
  savePickupAction,
  setPausedAction,
  updateDetailsAction,
} from '../actions';

export const metadata: Metadata = { title: 'Edit listing' };

export default async function EditListingPage({
  params,
  searchParams,
}: PageProps<'/listings/[id]'>) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const [listing, categories, config] = await Promise.all([
    getMyListing(id),
    getCategories(),
    getAppConfig(),
  ]);
  if (!listing || listing.status === 'DELETED') notFound();
  const status = STATUS[listing.status];
  const missing = missingForPublish(listing, config.photos.min);
  const editable = listing.status !== 'REMOVED';

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <Link
        href="/listings"
        className="flex items-center gap-1 text-small font-semibold text-sj-muted-foreground hover:text-sj-foreground"
      >
        <ArrowLeft className="size-4" /> My listings
      </Link>
      <PageHeader
        title={listing.title}
        description={listing.category.name}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      {created && (
        <p
          role="status"
          className="rounded-md bg-sj-primary-soft px-4 py-3 text-small text-sj-on-primary-soft"
        >
          Saved as a draft. Add photos and the pickup point, then publish.
        </p>
      )}
      {listing.status === 'REJECTED' && listing.rejectionReason && (
        <p className="rounded-md border border-sj-danger/30 bg-sj-danger/5 px-4 py-3 text-small">
          <strong>Our team asked for changes:</strong> {listing.rejectionReason}
        </p>
      )}
      {listing.status === 'PENDING' && (
        <p className="rounded-md bg-sj-surface-muted px-4 py-3 text-small">
          Your listing is being reviewed. We usually finish within a day.
        </p>
      )}

      <EditorSection step={1} title="Photos" done={listing.photos.length >= config.photos.min}>
        <PhotosEditor
          photos={listing.photos}
          max={config.photos.max}
          add={addPhotosAction.bind(null, id)}
          remove={removePhotoAction.bind(null, id)}
          reorder={reorderPhotosAction.bind(null, id)}
        />
      </EditorSection>

      <EditorSection
        step={2}
        title="Pickup"
        description="Borrowers see only the area and a rough point; the exact address is shared after booking."
        done={listing.lat != null && Boolean(listing.areaLabel)}
      >
        <PickupEditor
          action={savePickupAction.bind(null, id)}
          initial={{
            lat: listing.lat,
            lng: listing.lng,
            areaLabel: listing.areaLabel,
            exactAddress: listing.exactAddress,
          }}
        />
      </EditorSection>

      <EditorSection step={3} title="Details and price" done>
        {editable && (
          <DetailsForm
            action={updateDetailsAction.bind(null, id)}
            categories={categories}
            rules={config}
            initial={{ ...listing, categoryId: listing.category.id }}
            submitLabel="Save details"
          />
        )}
      </EditorSection>

      <EditorSection
        step={4}
        title="Unavailable dates"
        description="Block days you need it yourself."
      >
        <BlocksEditor
          initial={listing.blocks}
          max={config.maxBlockedRanges}
          save={saveBlocksAction.bind(null, id)}
        />
      </EditorSection>

      <EditorSection
        step={5}
        title="Documents to see"
        description="What a borrower must share before you accept. They’re shown securely and only for this booking."
      >
        <DocsEditor action={saveDocsAction.bind(null, id)} initial={listing.requiredDocs} />
      </EditorSection>

      <EditorSection step={6} title="Status" done={listing.status === 'LIVE'}>
        <StatusPanel
          id={id}
          status={listing.status}
          missing={missing}
          publish={publishAction.bind(null, id)}
          setPaused={setPausedAction.bind(null, id)}
          remove={deleteListingAction.bind(null, id)}
        />
      </EditorSection>
    </div>
  );
}
