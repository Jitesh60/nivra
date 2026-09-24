import type { Schemas } from '@sajha/api-client';
import { Badge } from '@/components/ui/badge';
import { dateTime } from '@/lib/documents';
import { cn } from '@/lib/utils';

type Transcript = Schemas['AdminTranscriptDto'];

/** "Asha (borrower)" by sender id. */
export function transcriptNames(t: Transcript): Record<string, string> {
  return {
    [t.borrower.id]: `${t.borrower.name ?? 'Borrower'} (borrower)`,
    [t.lender.id]: `${t.lender.name ?? 'Lender'} (lender)`,
  };
}

/** Chat messages as typed, oldest at the top. */
export function TranscriptList({ t }: { t: Transcript }) {
  const names = transcriptNames(t);
  const messages = [...t.messages].reverse();
  return (
    <ol className="grid gap-3" aria-label="Messages">
      {messages.length === 0 && <li className="text-muted-foreground">No messages.</li>}
      {messages.map((m) => (
        <li
          key={m.id}
          data-testid="transcript-message"
          className={cn(
            'max-w-2xl rounded-lg border p-3 text-sm',
            m.senderId === t.lender.id ? 'bg-muted' : 'bg-card',
            m.type === 'SYSTEM' && 'border-dashed text-muted-foreground',
          )}
        >
          <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{names[m.senderId] ?? m.senderId}</span>
            <span>{dateTime.format(new Date(m.createdAt))}</span>
            {m.type !== 'TEXT' && <Badge variant="outline">{m.type.toLowerCase()}</Badge>}
            {m.masked && (
              <Badge variant="destructive">contact details hidden from the other person</Badge>
            )}
          </p>
          {m.body && <p className="whitespace-pre-line">{m.body}</p>}
          {m.offerSummary && <p>{m.offerSummary}</p>}
          {m.imageUrl && (
            <a
              href={m.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              View photo ↗
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
