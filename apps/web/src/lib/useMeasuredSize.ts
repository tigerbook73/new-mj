import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measures an element's real content-box pixels via ResizeObserver.
 * Used instead of CSS container queries so the same fitTileGrid math can
 * eventually run against a React Native onLayout measurement — content-box
 * size already excludes border/padding, so callers don't need to reason
 * about box-sizing when reading the result.
 */
export function useMeasuredSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.contentBoxSize?.[0];
      setSize(
        box
          ? { width: box.inlineSize, height: box.blockSize }
          : { width: entry.contentRect.width, height: entry.contentRect.height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
