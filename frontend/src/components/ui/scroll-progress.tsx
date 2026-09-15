import { useEffect, useRef } from "react";

/**
 * Fixed hairline at the top of the viewport reflecting vertical scroll
 * progress through the current page. Mounted once at the shell root, fully
 * independent of the sidebar and of route content -- it reads the browser's
 * own scroll position and recomputes on scroll, resize, and content-height
 * changes (ResizeObserver), so it stays correct across navigation without
 * any per-route wiring or polling loop.
 */
export function ScrollProgress() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const fill = fillRef.current;
    if (!root || !fill) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let ticking = false;
    let idleTimer: number | undefined;

    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const maxScroll = doc.scrollHeight - doc.clientHeight;
      const scrollable = maxScroll > 1;
      const progress = scrollable ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      fill.style.width = `${progress * 100}%`;
      root.style.opacity = scrollable ? "" : "0";
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    const onScroll = () => {
      requestUpdate();
      if (reducedMotion) return;
      root.classList.add("scrolling");
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => root.classList.remove("scrolling"), 200);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", requestUpdate);

    const ro = new ResizeObserver(requestUpdate);
    ro.observe(document.body);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", requestUpdate);
      ro.disconnect();
      window.clearTimeout(idleTimer);
    };
  }, []);

  return (
    <div ref={rootRef} className="scroll-progress" aria-hidden="true">
      <div ref={fillRef} className="scroll-progress-fill" />
    </div>
  );
}
