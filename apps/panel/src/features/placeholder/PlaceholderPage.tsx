export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-alt p-10 text-center">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">Esta sección estará disponible en una fase posterior.</p>
    </div>
  );
}
