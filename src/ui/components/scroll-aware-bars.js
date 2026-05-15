/**
 * Scroll-aware top app bar — flips the .is-scrolled class on the
 * topbar when its associated scroll container is past 4dp from the
 * top. Per M3 spec the bar then lifts to surface-container tonal.
 *
 * Usage:
 *   bindScrollAwareBar(document.querySelector(".topbar"),
 *                      document.querySelector(".messages"));
 */

export function bindScrollAwareBar(bar, scroller, threshold = 4) {
  if (!bar || !scroller) return () => {};
  let pending = false;
  let lastScrolled = false;

  function update() {
    pending = false;
    const scrolled = scroller.scrollTop > threshold;
    if (scrolled === lastScrolled) return;
    lastScrolled = scrolled;
    bar.classList.toggle("is-scrolled", scrolled);
  }
  function onScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }
  scroller.addEventListener("scroll", onScroll, { passive: true });
  update();
  return () => scroller.removeEventListener("scroll", onScroll);
}
