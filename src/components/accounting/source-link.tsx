import Link from "next/link";
import { SOURCE_LABELS, sourceHref } from "@/server/services/finance-shared";
import type { JournalSource } from "@/db/schema/accounting";

/** "Sales invoice INV-00012" with a link to the document when we know where it lives. */
export function SourceLink({ sourceType, sourceId, sourceNumber, showType = true }: { sourceType: JournalSource; sourceId: string | null; sourceNumber: string | null; showType?: boolean }) {
  const href = sourceHref(sourceType, sourceId);
  const label = SOURCE_LABELS[sourceType] ?? sourceType;
  return (
    <span className="whitespace-nowrap">
      {showType && <span className="text-muted-foreground">{label}</span>}
      {sourceNumber &&
        (href ? (
          <Link href={href} className="ml-1 font-medium text-primary hover:underline">
            {sourceNumber}
          </Link>
        ) : (
          <span className="ml-1 font-medium">{sourceNumber}</span>
        ))}
      {!sourceNumber && href && (
        <Link href={href} className="ml-1 text-primary hover:underline">
          Open
        </Link>
      )}
    </span>
  );
}
