/** A numbered card in the listing editor. */
export function EditorSection({
  step,
  title,
  description,
  done,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-sj-border bg-sj-surface p-5 shadow-xs">
      <header className="flex items-start gap-3">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full text-caption font-bold ${
            done ? 'bg-sj-primary text-sj-on-primary' : 'bg-sj-surface-muted text-sj-foreground'
          }`}
          aria-hidden
        >
          {done ? '✓' : step}
        </span>
        <div>
          <h2 className="text-h3">{title}</h2>
          {description && <p className="text-small text-sj-muted-foreground">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
