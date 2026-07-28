import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

/**
 * Shared drag-to-reorder interaction for a same-level sibling list — used by
 * both the Tree panel (item order) and the Variables panel (variable order).
 * One instance per panel; `groupId` lets a single instance correctly handle
 * multiple independent sibling lists at once (e.g. every parent node's own
 * children in the Tree), since a drop is only valid within the dragged
 * item's own group.
 *
 * Native Pointer Events + setPointerCapture, no dnd library — same
 * technique as TableLayoutLabView.tsx's panel-resize handles. Capture
 * redirects every subsequent move/up event to the element that started the
 * drag (the handle), regardless of what's physically under the pointer —
 * so, unlike a plain hover handler, the drop target has to be looked up via
 * `elementFromPoint` inside the move handler rather than listened for on
 * each row directly. Rows advertise themselves for that lookup via
 * `data-sort-name`/`data-sort-group` (see `dropTargetProps`).
 */
export function useDragSort({
  containerRef,
  onReorder,
}: {
  /** Sort mode exits automatically on any pointerdown outside this element. */
  containerRef: RefObject<HTMLElement | null>;
  onReorder: (name: string, newIndex: number) => void;
}) {
  const [active, setActive] = useState(false);
  const [draggingName, setDraggingName] = useState<string>();
  const [dropName, setDropName] = useState<string>();
  const [dropBefore, setDropBefore] = useState(true);
  const draggingGroup = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setActive(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [active, containerRef]);

  const startDrag = (name: string, groupId: string) => (event: PointerEvent<HTMLElement>) => {
    if (!active) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingGroup.current = groupId;
    setDraggingName(name);
    setDropName(undefined);
  };

  const onDragPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!draggingName) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const row = hit?.closest<HTMLElement>("[data-sort-name]");
    if (
      !row ||
      row.dataset.sortGroup !== draggingGroup.current ||
      row.dataset.sortName === draggingName
    ) {
      setDropName(undefined);
      return;
    }
    const rect = row.getBoundingClientRect();
    setDropName(row.dataset.sortName);
    setDropBefore(event.clientY < rect.top + rect.height / 2);
  };

  /** `order` is the dragged item's current sibling-name order, supplied by the caller. */
  const endDrag = (order: string[]) => {
    if (draggingName && dropName) {
      const fromIndex = order.indexOf(draggingName);
      const targetIndex = order.indexOf(dropName);
      if (fromIndex >= 0 && targetIndex >= 0) {
        const rawIndex = dropBefore ? targetIndex : targetIndex + 1;
        onReorder(draggingName, rawIndex > fromIndex ? rawIndex - 1 : rawIndex);
      }
    }
    setDraggingName(undefined);
    setDropName(undefined);
    draggingGroup.current = undefined;
  };

  /** Spread onto each row so `onDragPointerMove` can find it via elementFromPoint. */
  const dropTargetProps = (name: string, groupId: string) => ({
    "data-sort-name": name,
    "data-sort-group": groupId,
  });

  return {
    active,
    setActive,
    draggingName,
    dropName,
    dropBefore,
    startDrag,
    onDragPointerMove,
    endDrag,
    dropTargetProps,
  };
}
