import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function readPreference(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

/** OS-level reduced-motion preference — gates table entry animations (table-ux-plan.md Phase 5). */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(readPreference);
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setPrefersReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return prefersReduced;
}
