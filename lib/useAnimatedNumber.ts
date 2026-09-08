"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tweens the displayed value toward `target` over `durationMs` using an
 * ease-out curve, instead of the number just snapping on every poll.
 * The very first value is shown instantly (nothing to animate from yet).
 * Pass `null` while the real value isn't known yet (e.g. before the first
 * successful fetch) — the caller decides how to render that.
 */
export function useAnimatedNumber(target: number | null, durationMs = 450) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef<number | null>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    const from = fromRef.current ?? target;

    if (from === target) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}
