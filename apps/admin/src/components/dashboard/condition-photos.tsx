import { dateTime } from '@/lib/documents';
import { STAGE_LABEL, type ConditionReport } from '@/lib/disputes';
import { PhotoThumbs } from './photo-thumbs';

const STAGES: ConditionReport['stage'][] = ['HANDOVER', 'RETURN'];
const SIDES: ConditionReport['by'][] = ['LENDER', 'BORROWER'];

/**
 * Handover and return photos side by side, one row per person, so damage is
 * easy to compare. Photo n is the nth across [reports] in their API order.
 */
export function ConditionPhotos({ reports, base }: { reports: ConditionReport[]; base: string }) {
  const offsets: number[] = [];
  reports.reduce((at, r) => {
    offsets.push(at);
    return at + r.photos.length;
  }, 0);
  const find = (stage: ConditionReport['stage'], by: ConditionReport['by']) => {
    const i = reports.findIndex((r) => r.stage === stage && r.by === by);
    return i < 0 ? null : { r: reports[i], from: offsets[i] };
  };

  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No condition photos yet.</p>;
  }
  return (
    <div className="grid gap-4 text-sm" data-testid="condition-photos">
      {SIDES.map((by) => (
        <div key={by}>
          <p className="mb-2 font-medium">{by === 'LENDER' ? 'Lender' : 'Borrower'}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {STAGES.map((stage) => {
              const found = find(stage, by);
              return (
                <div
                  key={stage}
                  className="rounded-md border p-3"
                  data-testid={`photos-${stage}-${by}`}
                >
                  <p className="mb-2 text-xs text-muted-foreground">
                    {STAGE_LABEL[stage]}
                    {found &&
                      ` · ${found.r.byName ?? ''} · ${dateTime.format(new Date(found.r.at))}`}
                  </p>
                  {found ? (
                    <>
                      <PhotoThumbs
                        base={base}
                        from={found.from}
                        count={found.r.photos.length}
                        label={`${STAGE_LABEL[stage]} (${by.toLowerCase()})`}
                        testId="condition-photo"
                      />
                      {found.r.note && <p className="mt-2 whitespace-pre-line">“{found.r.note}”</p>}
                    </>
                  ) : (
                    <p className="text-muted-foreground">None.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
