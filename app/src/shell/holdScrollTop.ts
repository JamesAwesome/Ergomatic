// Third round on the reader-opens-mid-scroll bug (ROADMAP bugfix rounds,
// 2026-08-07/08): a single programmatic scroll — even pre-paint — loses to
// real iOS WebKit's touch/scroll machinery, which can re-scroll the page
// within a few frames of a touch-driven navigation (observed on device in
// both iOS Safari and iOS Chrome; never reproducible in any touchless
// harness). So: set the top, then HOLD it at rAF cadence through the
// settle window, re-asserting whenever something else moves it — and
// abort instantly on any signal that the ROWER is scrolling on purpose,
// so this never fights a human.
//
// Returns a cleanup function; safe to call in useLayoutEffect.
const HOLD_FRAMES = 30; // ~500ms at 60Hz — covers every observed late pass

export function holdScrollTop(): () => void {
  window.scrollTo(0, 0);

  let raf = 0;
  let frames = 0;

  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("keydown", stop);
  };

  const hold = () => {
    if (frames++ >= HOLD_FRAMES) {
      stop();
      return;
    }
    if (window.scrollY !== 0) window.scrollTo(0, 0);
    raf = requestAnimationFrame(hold);
  };

  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("keydown", stop);
  raf = requestAnimationFrame(hold);

  return stop;
}
