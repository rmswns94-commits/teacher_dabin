import type { ReactNode } from "react";
import { groupMixedContextsForDisplay, savedSectionsForDisplay, type SavedContext } from "@/lib/mixed-display";
import { linkedContextLabel } from "@/lib/textbooks";
import { ExpandableList } from "@/components/expandable-list";

export function MixedContextList<T extends SavedContext & { id: string }>({
  items, renderItem, expandable = false,
}: {
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
  expandable?: boolean;
}) {
  const rows = groupMixedContextsForDisplay(items).flatMap((group) => group.items.map((item, index) => (
    <div key={item.id} className="min-w-0">
      {index === 0 && group.label ? (
        <div className="caption-text mb-1 font-semibold text-[#6652b9]">{group.label}</div>
      ) : null}
      {renderItem(item)}
    </div>
  )));
  if (rows.length === 0) return null;
  // Detail retains its item-count preview. Briefing always renders every item.
  return expandable ? <ExpandableList className="min-w-0 space-y-2.5">{rows}</ExpandableList>
    : <div className="min-w-0 space-y-2.5">{rows}</div>;
}

export function SavedLessonSections(props: Parameters<typeof savedSectionsForDisplay>[0]) {
  const { entries, extra } = savedSectionsForDisplay(props);
  return (
    <div className="body-text min-w-0 space-y-2.5 whitespace-pre-wrap break-words">
      <MixedContextList items={entries} renderItem={(item) => (
        <div className="min-w-0">
          <div className="secondary-text font-semibold">{linkedContextLabel(item)}</div>
          <div>{item.text}</div>
        </div>
      )} />
      {extra ? <div>{extra}</div> : null}
    </div>
  );
}
