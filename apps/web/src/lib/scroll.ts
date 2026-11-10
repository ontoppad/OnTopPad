import type Lenis from "lenis";

// the page-wide smooth scroller; Layout owns its lifetime, null under reduced motion
export const smooth: { lenis: Lenis | null } = { lenis: null };

export function scrollToEl(el: HTMLElement | null | undefined) {
  if (!el) return;
  if (smooth.lenis) smooth.lenis.scrollTo(el);
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
}
