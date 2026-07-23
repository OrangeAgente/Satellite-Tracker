import { useEffect, useState } from "react";

/**
 * True when the viewport matches `query` (default: phone-sized). Reactive to
 * resize / orientation via matchMedia. Drives the App's desktop/mobile layout
 * branch.
 */
export function useIsMobile(query = "(max-width: 768px)"): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" && "matchMedia" in window
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
