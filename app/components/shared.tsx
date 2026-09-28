export function Checklist({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <Section title={title}>
      <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li className="flex gap-3 text-sm leading-6 text-ink/75" key={item}>
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-coral" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/60">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function TagList({ items }: { items: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          className="rounded-full bg-mint/10 px-3 py-1 text-xs font-medium text-mint"
          key={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function FallbackText({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink/20 bg-white p-5 text-sm text-ink/65">
      {children}
    </div>
  );
}
