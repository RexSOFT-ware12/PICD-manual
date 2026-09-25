"use client";

import { useEffect, useRef, useState } from "react";
import { ViewerEngine } from "@/lib/viewer/engine";

export default function Viewport({ onReady }: { onReady: (engine: ViewerEngine | null) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: ViewerEngine | null = null;
    try {
      engine = new ViewerEngine(host);
    } catch (e) {
      setError(e instanceof Error ? e.message : "WebGL could not start.");
      return;
    }
    onReady(engine);
    return () => {
      onReady(null);
      engine?.dispose();
    };
    // onReady is a stable state setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="viewport-canvas" ref={hostRef}>
      {error && (
        <div className="viewport-error" role="alert">
          <strong>The 3D view could not start.</strong>
          <span>{error} Check that hardware acceleration is on in your browser, then reload.</span>
        </div>
      )}
    </div>
  );
}
