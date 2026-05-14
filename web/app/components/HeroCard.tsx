// Hero card + scene, split into two exports:
//
//   <HeroScene />  — the ambient backdrop. Absolute-positioned
//                    starfield + conic holographic wash + halo.
//                    Drop it as the first child of a positioned
//                    hero <section> so it paints across the whole
//                    section.
//
//   <HeroCard />   — the actual virtual card in perspective space.
//                    Flows with normal layout, so it can sit in the
//                    right column of a hero grid on desktop and wrap
//                    below the text on tablet/mobile.
//
// Pointer tracking sets CSS custom properties on document.documentElement
// so both the scene and the card share state without needing a React
// context. A single useEffect registered once per page installs the
// listeners; it's a no-op if neither component ever mounts.
//
// The visual language (layered gradients, chip, sheen, grid texture,
// noise, orbs) is a faithful port of the standalone prototype at
// ~/code/cards402animation/index.html with three deltas:
//   - Idle drift dialled back from ±8/±6 to ±2.5/±1.8 per pass.
//   - The brand mark is replaced with a Cards402 wordmark rendered
//     via mask-image so it inherits the card's cream ink.
//   - The bottomline shows 'YOUR AGENT' instead of 'ASH / PRIMARY'.

'use client';

import { useEffect, useRef } from 'react';

// Shared init guard — if multiple HeroCard/HeroScene instances mount on
// the same page we only want one pointer listener, one rAF loop. The
// flag is module-scoped so the React strict-mode double-mount doesn't
// double up the listeners either.
let tiltInstalled = false;

function installTilt() {
  if (tiltInstalled || typeof window === 'undefined') return;
  tiltInstalled = true;

  const root = document.documentElement;

  // Kick the load-in progress variable to 1 on the first frame. Until
  // this runs, elements that multiply their opacity by
  // var(--load-progress) are fully hidden — so the sheen, grid texture,
  // noise speckle, orb highlights and corner rings all gate-in behind
  // the outline + shell intro instead of being visible from frame 1.
  requestAnimationFrame(() => root.style.setProperty('--load-progress', '1'));

  // Note: the tilt / parallax loop does NOT gate on
  // prefers-reduced-motion. An earlier commit did, but Windows
  // users who toggle "Show animations in Windows" off (a common
  // setting for perceived perf) end up with prefers-reduced-motion:
  // reduce set, and they didn't expect parallax to disappear as a
  // side effect. The real perf cost was never the pointer tilt loop
  // — it was the filter: blur(...) on pointer-bound backgrounds
  // (scene, halo, card-shadow) and the continuous hc-floatCard filter
  // animation. Those were removed in 4845dcc, so this rAF is cheap
  // enough to run unconditionally: six CSS variable writes per
  // frame driving composite-only transforms.

  // Tilt targets (pixels / degrees) + lerped current values
  let pointerX = 0;
  let pointerY = 0;
  let currentX = 0;
  let currentY = 0;
  // Sheen-glare pointer position in percent.
  let targetGlareX = 50;
  let targetGlareY = 50;
  let currentGlareX = 50;
  let currentGlareY = 50;
  let lastMove = performance.now();

  function setVar(name: string, value: string) {
    root.style.setProperty(name, value);
  }

  function onMove(e: PointerEvent) {
    // Read the root rect fresh on each event. An earlier refactor
    // tried to cache the rect and invalidate on scroll/resize — but
    // documentElement's rect changes on scroll (its top becomes
    // negative) and on any mid-page reflow, and the cache got stale
    // enough to break the parallax math. getBoundingClientRect on
    // documentElement is a few microseconds in practice — not worth
    // the correctness risk.
    const rect = root.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const clampX = Math.max(0, Math.min(1, x));
    const clampY = Math.max(0, Math.min(1, y));
    pointerX = (clampX - 0.5) * 30;
    pointerY = (clampY - 0.5) * 22;
    targetGlareX = clampX * 100;
    targetGlareY = clampY * 100;
    lastMove = performance.now();
  }
  function onLeave() {
    pointerX = 0;
    pointerY = 0;
    targetGlareX = 50;
    targetGlareY = 50;
  }

  function animate() {
    // Dialled-down idle drift — original prototype was ±8/±6, too
    // busy for a financial surface. At ±2.5/±1.8 the card has a
    // gentle breath without bobbing.
    const idle = (performance.now() - lastMove) / 1000;
    const driftX = Math.sin(idle * 0.7) * 2.5;
    const driftY = Math.cos(idle * 0.6) * 1.8;
    const targetX = pointerX * 0.85 + driftX;
    const targetY = pointerY * 0.85 + driftY;

    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    currentGlareX += (targetGlareX - currentGlareX) * 0.08;
    currentGlareY += (targetGlareY - currentGlareY) * 0.08;

    setVar('--card-x', `${currentX}px`);
    setVar('--card-y', `${currentY}px`);
    setVar('--rotate-y', `${currentX * 0.55}deg`);
    setVar('--rotate-x', `${-currentY * 0.7}deg`);
    setVar('--pointer-x', `${currentGlareX}%`);
    setVar('--pointer-y', `${currentGlareY}%`);

    requestAnimationFrame(animate);
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  // `pointerleave` on window is unreliable — use `pointerout` with a
  // null relatedTarget (which means the cursor left the viewport) as
  // a more consistent signal across browsers.
  window.addEventListener('pointerout', (e: PointerEvent) => {
    if (!e.relatedTarget) onLeave();
  });
  window.addEventListener('blur', onLeave);
  requestAnimationFrame(animate);
}

function useTilt() {
  useEffect(() => {
    installTilt();
  }, []);
}

// ─────────────────────────────────────────────────────────────────────
// HeroScene — absolute backdrop (starfield + conic glow + halo)
// ─────────────────────────────────────────────────────────────────────

export function HeroScene() {
  useTilt();
  return (
    <>
      <div className="hc-scene">
        <div className="hc-halo" />
      </div>
      <SceneStyles />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HeroCard — the card itself, flows with layout
// ─────────────────────────────────────────────────────────────────────

export function HeroCard() {
  const cardRef = useRef<HTMLElement>(null);
  useTilt();

  return (
    <>
      <div className="hc-card-wrap">
        <div className="hc-card-shadow" aria-hidden />
        <article ref={cardRef} className="hc-card" aria-label="AgentCard virtual card">
          {/* Load-in choreography elements (rendered first so they sit
              underneath the noise + content layers in z-order):
                · outline-glow: soft radial that pulses outward
                · card-outline: SVG rect that draws around the perimeter
                · card-shell:   holographic gradient that wipes upward
              See the keyframes block in CardStyles for the timing. */}
          <div className="hc-outline-glow" aria-hidden />
          <svg
            className="hc-card-outline"
            viewBox="0 0 384 600"
            preserveAspectRatio="none"
            aria-hidden
          >
            <rect x="1.5" y="1.5" width="381" height="597" rx="28" ry="28" />
          </svg>
          <div className="hc-card-shell" aria-hidden />
          <div className="hc-noise" aria-hidden />
          <div className="hc-card-content">
            {/* The signature "A" marks from the mockup */}
            <div className="hc-mark-top-left" aria-hidden>A</div>
            <div className="hc-mark-bottom-right" aria-hidden>A</div>

            <header className="hc-topline">
              <div className="hc-brand-group">
                <span className="hc-brand-icon">A</span>
                <span className="hc-brand-text">AGENTCARD</span>
              </div>
              <div className="hc-topline-right">DEBIT</div>
            </header>

            <div className="hc-middle">
              <div className="hc-chip" aria-hidden />
              <div className="hc-digits">1234 5678 9101 1121</div>

              <div className="hc-meta-row">
                <div className="hc-holder">SARAH L. CHEN</div>
                <div className="hc-expiry">
                  <span className="hc-label">VALID</span>
                  <span className="hc-value">09/27</span>
                </div>
              </div>
            </div>

            <footer className="hc-bottomline">
              <div className="hc-network-circles">
                <span className="hc-circle-one" />
                <span className="hc-circle-two" />
              </div>
            </footer>
          </div>
        </article>
      </div>
      <CardStyles />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Styles — split so each component carries what it needs.
// ─────────────────────────────────────────────────────────────────────

function SceneStyles() {
  return (
    <style>{`
      :root {
        --card-x: 0px;
        --card-y: 0px;
        --rotate-x: -18deg;
        --rotate-y: 42deg;
        --rotate-z: -12deg;
        --pointer-x: 50%;
        --pointer-y: 50%;
        --load-progress: 0;
      }
      .hc-scene {
        position: absolute;
        inset: 0;
        isolation: isolate;
        overflow: hidden;
        pointer-events: none;
        background: #050505;
      }
      .hc-scene::before {
        content: '';
        position: absolute;
        inset: -10%;
        pointer-events: none;
        background:
          radial-gradient(circle at 30% 35%, rgba(255, 255, 255, 0.05) 0 1px, transparent 2px),
          radial-gradient(circle at 65% 50%, rgba(255, 255, 255, 0.04) 0 1px, transparent 2px);
        background-size: 400px 400px;
        opacity: 0.4;
        animation: hc-driftStars 40s linear infinite;
      }
      .hc-scene::after {
        content: '';
        position: absolute;
        inset: 0;
        background: transparent;
        opacity: 0.6;
      }

      .hc-halo {
        position: absolute;
        top: 50%;
        left: 72%;
        width: min(55vw, 40rem);
        aspect-ratio: 1;
        border-radius: 999px;
        pointer-events: none;
        background: transparent;
        opacity: 0.85;
        transform: translate(-50%, -50%);
      }
      .hc-halo::before {
        content: '';
        position: absolute;
        inset: 15%;
        border-radius: 50%;
        border: 1px solid rgba(0, 255, 163, 0.15);
        mask-image: radial-gradient(circle, black, transparent 80%);
      }

      @media (max-width: 1100px) {
        .hc-halo { left: 62%; }
      }
      @media (max-width: 860px) {
        .hc-halo { left: 50%; top: 72%; width: min(85vw, 30rem); }
      }

      @keyframes hc-driftStars {
        from { transform: translate3d(0, 0, 0); }
        to { transform: translate3d(-100px, 50px, 0); }
      }
    `}</style>
  );
}

function CardStyles() {
  return (
    <style>{`
      .hc-card-wrap {
        position: relative;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        perspective: 1800px;
        transform-style: preserve-3d;
        /* Intro: the whole wrap lifts from 2rem below with a blur +
           scale, then settles. 1.4s ease-out-expo so it feels like
           the card is arriving, not just fading in. */
        animation: hc-wrapEnter 1400ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .hc-card-shadow {
        position: absolute;
        left: 10%;
        right: 10%;
        bottom: -2rem;
        height: 3rem;
        border-radius: 50%;
        /* Radial gradient alone produces a soft shadow without needing
           filter blur. The previous version had filter blur 20px plus
           a transform binding on var(--card-x/y), which forced a
           software-mode re-rasterize of the blurred region on every
           pointer move. Dropping both makes the shadow static but
           identical-looking. */
        background: transparent;
        transform: translate3d(0, 0, -80px) scale(1.1);
        opacity: 0.8;
        pointer-events: none;
      }
      .hc-card {
        position: relative;
        width: min(85vw, 24rem);
        aspect-ratio: 1.586 / 1;
        background: #080808;
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 
          0 30px 60px -12px rgba(0, 0, 0, 0.8),
          0 0 0 1px rgba(255, 255, 255, 0.05),
          0 0 3rem rgba(0, 255, 163, 0.1);
        transform-style: preserve-3d;
        transform: translate3d(var(--card-x), var(--card-y), 0)
          rotateX(var(--rotate-x)) rotateY(var(--rotate-y)) rotateZ(var(--rotate-z)) scale(1.1);
        transition: transform 150ms ease-out;
        /* Hint the browser that this element will be transformed so
           it gets its own paint layer even when GPU compositing is
           off. In software mode this means we only re-rasterise the
           card region on pointer move, not the whole hero section. */
        will-change: transform;
        color: #f5f1e8;
        font-family: var(--font-body);
      }
      .hc-card::before,
      .hc-card::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .hc-card::before {
        /* The previous version used mix-blend-mode: screen to
           brighten the card face where the cursor hovers. Blend modes
           force a new compositing layer and re-composite on every
           paint, which is extremely expensive under software
           rendering. A straight rgba overlay looks ~identical on
           a dark card without the blend-mode cost. */
        background: none;
        /* Gated through load-progress so the sheen doesn't appear
           until the outline + shell have established the card. */
        opacity: calc(0.85 * var(--load-progress));
        transform: translateZ(60px);
      }
      .hc-card::after {
        background:
          repeating-linear-gradient(90deg, rgba(0, 255, 163, 0.03) 0 1px, transparent 1px 34px),
          repeating-linear-gradient(0deg, rgba(0, 255, 163, 0.02) 0 1px, transparent 1px 34px);
        mask-image: linear-gradient(180deg, transparent, black 18%, black 82%, transparent);
        -webkit-mask-image: linear-gradient(180deg, transparent, black 18%, black 82%, transparent);
        opacity: calc(0.5 * var(--load-progress));
        transform: translateZ(20px);
      }

      /* Holographic fill that wipes upward from the bottom of the
         card during the intro. clip-path does the wipe; the
         filter brightness/saturate pulse makes it feel like the
         card is cooling from a red-hot state back to resting. */
      .hc-card-shell {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: transparent;
        opacity: 0;
        transform: translateZ(10px);
        clip-path: inset(100% 0 0 0 round 1.7rem);
        animation: hc-fillIn 1100ms cubic-bezier(0.2, 0.9, 0.2, 1) forwards 620ms;
      }

      /* SVG rect outline that draws around the card perimeter on
         load. The rect is 381 x 597 with rx=28, so its real
         perimeter is 2(325) + 2(541) + 2π(28) ≈ 1908 units.
         stroke-dasharray must be STRICTLY GREATER than the real
         perimeter or the last ~16% of the stroke ends up in the
         gap portion of the dash pattern and never gets drawn.
         An earlier comment here claimed 1600 was longer than the
         ~2050 perimeter — both figures were wrong, and the result
         was a stroke that drew ~84% of the way round and stopped.
         2200 comfortably exceeds the real perimeter for the
         current rect dimensions and leaves headroom if the
         aspect-ratio ever changes. Animation #1 draws the stroke,
         animation #2 dims it from full white to a subtle rim
         after the draw. */
      .hc-card-outline {
        position: absolute;
        inset: 0.08rem;
        width: calc(100% - 0.16rem);
        height: calc(100% - 0.16rem);
        overflow: visible;
        transform: translateZ(88px);
        pointer-events: none;
      }
      .hc-card-outline rect {
        fill: none;
        stroke: rgba(255, 245, 225, 0.95);
        stroke-width: 1.35;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 2200;
        stroke-dashoffset: 2200;
        filter:
          drop-shadow(0 0 8px rgba(255, 255, 255, 0.15))
          drop-shadow(0 0 18px rgba(0, 255, 163, 0.2));
        animation:
          hc-drawOutline 900ms cubic-bezier(0.65, 0, 0.35, 1) forwards 80ms,
          hc-outlineFade 700ms ease forwards 1120ms;
      }

      /* Radial aura that pulses out from the card during the
         outline draw. Sits behind/around the card at negative
         inset so it spills past the card edges. */
      .hc-outline-glow {
        position: absolute;
        inset: -8%;
        border-radius: inherit;
        pointer-events: none;
        background: radial-gradient(
          circle at 50% 50%,
          rgba(0, 255, 163, 0.14),
          transparent 54%
        );
        filter: blur(18px);
        opacity: 0;
        transform: translateZ(92px) scale(0.94);
        animation: hc-glowPulse 1200ms ease forwards 260ms;
      }

      .hc-noise {
        position: absolute;
        inset: 0;
        /* mix-blend-mode: soft-light removed for the same perf reason
           as the sheen above. At 8% opacity on a dark card the visual
           result is close enough — a faint speckle — without paying
           the always-on blend cost. */
        opacity: calc(0.1 * var(--load-progress));
        background-image:
          radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.6) 0 0.7px, transparent 0.8px),
          radial-gradient(circle at 70% 55%, rgba(255, 255, 255, 0.6) 0 0.7px, transparent 0.8px);
        background-size: 10px 10px, 13px 13px;
      }

      .hc-rings {
        position: absolute;
        inset: 18% -24% auto auto;
        width: 9rem;
        height: 9rem;
        transform: translateZ(42px);
        opacity: calc(0.7 * var(--load-progress));
        pointer-events: none;
      }
      .hc-rings::before,
      .hc-rings::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .hc-rings::after {
        inset: 1.4rem;
        border-color: rgba(124, 245, 208, 0.2);
      }

      .hc-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(0.5px);
        pointer-events: none;
      }
      .hc-orb-one {
        width: 4.6rem;
        height: 4.6rem;
        right: -1rem;
        bottom: 4rem;
        background: transparent;
        transform: translateZ(84px);
        opacity: calc(0.95 * var(--load-progress));
      }
      .hc-orb-two {
        width: 2.9rem;
        height: 2.9rem;
        left: -1rem;
        top: 6rem;
        background: transparent;
        transform: translateZ(64px);
        opacity: calc(0.75 * var(--load-progress));
      }

      .hc-card-content {
        position: relative;
        height: 100%;
        padding: 1.75rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        z-index: 10;
        transform: translateZ(40px);
      }

      .hc-mark-top-left,
      .hc-mark-bottom-right {
        position: absolute;
        font-family: var(--font-display);
        font-weight: 900;
        color: var(--accent);
        opacity: 0.4;
        filter: drop-shadow(0 0 20px var(--accent-glow));
        line-height: 1;
        pointer-events: none;
      }
      .hc-mark-top-left {
        top: 1.25rem;
        left: 1.25rem;
        font-size: 2.5rem;
        transform: rotate(-10deg);
      }
      .hc-mark-bottom-right {
        bottom: 1.25rem;
        right: 1.25rem;
        font-size: 4rem;
        transform: rotate(5deg) translateZ(10px);
        opacity: 0.4;
      }

      .hc-topline {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .hc-brand-group {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .hc-brand-icon {
        background: var(--accent);
        color: white;
        width: 1.4rem;
        height: 1.4rem;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 0.9rem;
        border-radius: 2px;
      }
      .hc-brand-text {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 0.95rem;
        color: white;
        letter-spacing: 0.05em;
      }
      .hc-topline-right {
        font-family: var(--font-mono);
        font-size: 0.65rem;
        letter-spacing: 0.2em;
        color: rgba(255, 255, 255, 0.4);
      }

      .hc-middle {
        margin-top: 1rem;
      }
      .hc-chip {
        width: 3.2rem;
        height: 2.4rem;
        background: linear-gradient(135deg, #e0e0e0 0%, #a0a0a0 100%);
        border-radius: 6px;
        margin-bottom: 1.5rem;
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(0,0,0,0.2);
      }
      .hc-chip::after {
        content: '';
        position: absolute;
        inset: 0;
        background: 
          repeating-linear-gradient(90deg, transparent 0 8px, rgba(0,0,0,0.1) 8px 9px),
          repeating-linear-gradient(0deg, transparent 0 6px, rgba(0,0,0,0.1) 6px 7px);
      }

      .hc-digits {
        font-family: var(--font-mono);
        font-size: 1.5rem;
        letter-spacing: 0.1em;
        color: white;
        margin-bottom: 1.5rem;
        text-shadow: 0 0 10px var(--accent-glow);
      }

      .hc-meta-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .hc-holder {
        font-family: var(--font-mono);
        font-size: 0.8rem;
        color: rgba(255, 255, 255, 0.8);
        text-transform: uppercase;
        letter-spacing: 0.15em;
      }
      .hc-expiry {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.2rem;
      }
      .hc-expiry .hc-label {
        font-family: var(--font-mono);
        font-size: 0.45rem;
        color: rgba(255, 255, 255, 0.3);
      }
      .hc-expiry .hc-value {
        font-family: var(--font-mono);
        font-size: 0.8rem;
        color: white;
      }

      .hc-network-circles {
        display: flex;
        align-items: center;
        margin-left: auto;
        width: fit-content;
      }
      .hc-circle-one, .hc-circle-two {
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 50%;
      }
      .hc-circle-one {
        background: rgba(255, 255, 255, 0.15);
        margin-right: -0.8rem;
      }
      .hc-circle-two {
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(2px);
      }

      .hc-card-shell {
        position: absolute;
        inset: 0;
        background: none;
        pointer-events: none;
      }

      .hc-noise {
        position: absolute;
        inset: 0;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        opacity: 0.05;
        mix-blend-mode: overlay;
        pointer-events: none;
      }

      /* Animations */
      @keyframes hc-wrapEnter {
        0% { opacity: 0; transform: translateY(2rem) scale(0.95); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes hc-glowPulse {
        0% { opacity: 0; transform: scale(0.8); }
        100% { opacity: 0.4; transform: scale(1.1); }
      }

      @media (max-width: 640px) {
        .hc-card {
          width: min(90vw, 20rem);
        }
        .hc-digits {
          font-size: 1.2rem;
        }
        .hc-mark-bottom-right {
          font-size: 2.5rem;
        }
      }
    `}</style>
  );
}
