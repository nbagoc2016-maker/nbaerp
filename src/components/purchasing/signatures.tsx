/** Signature boxes printed at the foot of purchasing documents. */
export function Signatures({ labels, terms }: { labels: string[]; terms?: string | null }) {
  return (
    <div className="mt-8 space-y-8">
      {terms && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Terms</p>
          <p className="mt-1 whitespace-pre-wrap">{terms}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-8 pt-6 sm:grid-cols-3">
        {labels.map((l) => (
          <div key={l} className="border-t pt-2 text-xs text-muted-foreground">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
