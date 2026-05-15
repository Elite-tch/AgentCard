'use client';

// Top marketing nav — a single responsive menu that renders as a
// horizontal bar on desktop (>860px) and collapses to a hamburger
// with a fullscreen sheet on mobile. Links are rendered once; CSS
// handles the layout switch.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const PRIMARY: { href: string; label: string }[] = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
];

export function NavLinks() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // ESC closes any open menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Route change closes everything.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock page scroll while the mobile menu is open. Both html and body
  // need overflow:hidden — iOS Safari ignores it on body alone.
  useEffect(() => {
    if (!menuOpen) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
      {/* Single nav menu — row on desktop, fullscreen column on mobile */}
      <div
        className={`nav-menu${menuOpen ? ' nav-menu--open' : ''}`}
        onClick={() => setMenuOpen(false)}
      >
        {PRIMARY.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="nav-menu-link"
            data-active={isActive(l.href) || undefined}
          >
            {l.label}
          </Link>
        ))}

        <Link
          href="/dashboard"
          className="nav-menu-link nav-menu-link--dashboard"
          data-active={isActive('/dashboard') || undefined}
        >
          Dashboard
        </Link>
      </div>

      {/* Primary CTA */}
      <Link href="/dashboard" className="nav-cta">
        Get started
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          style={{ opacity: 0.7, display: 'block' }}
        >
          <path
            d="M2 7h10m-3.5-3.5L12 7l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>

      {/* Hamburger — visible only on mobile */}
      <button
        className="nav-toggle"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-label="Menu"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d={menuOpen ? 'M3 3L13 13M13 3L3 13' : 'M2 4h12M2 8h12M2 12h12'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <style>{`
        /* Pseudo-element carries the nav's backdrop so the <nav> itself
           doesn't create a containing block for position:fixed children
           (the mobile menu). Background + border live here too. */
        .marketing-nav::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          background: rgba(5,5,5,0.72);
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          border-bottom: 1px solid var(--border);
        }

        /* ---- Desktop (default) ---- */
        .nav-menu {
          display: flex;
          align-items: center;
          gap: 0.1rem;
        }
        .nav-menu-link {
          text-decoration: none;
          color: var(--fg-muted);
          font-size: 0.95rem;
          font-family: var(--font-body);
          font-weight: 500;
          padding: 0.45rem 0.7rem;
          border-radius: 6px;
          transition: color 0.3s var(--ease-out);
          white-space: nowrap;
        }
        .nav-menu-link[data-active] { color: var(--fg); }
        .nav-menu-link--dashboard { margin-left: 0.25rem; }

        .nav-cta {
          margin-left: 0.6rem;
          text-decoration: none;
          font-size: 0.85rem;
          font-family: var(--font-mono);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 2px;
          background: var(--accent);
          color: white;
          transition: transform 0.3s var(--ease-out), box-shadow 0.3s var(--ease-out);
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          white-space: nowrap;
          box-shadow: 0 0 12px var(--accent-glow);
        }
        .nav-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 24px var(--accent-glow);
        }

        .nav-toggle {
          display: none;
          margin-left: 0.5rem;
          width: 36px;
          height: 36px;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--accent-border);
          border-radius: 2px;
          color: var(--fg);
          cursor: pointer;
        }

        /* ---- Mobile (≤ 860px) ---- */
        @media (max-width: 860px) {
          .nav-toggle { display: inline-flex; }
          .nav-cta { display: none; }

          .nav-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            height: calc(100vh - 64px);
            height: calc(100dvh - 64px);
            flex-direction: column;
            align-items: stretch;
            background: rgba(5,5,5,0.96);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            z-index: 40;
            padding: 1.5rem 1.35rem;
            overflow-y: auto;
            overscroll-behavior: contain;
          }
          .nav-menu--open { display: flex; }

          .nav-menu-link {
            padding: 1rem 0;
            font-size: 1.2rem;
            font-family: var(--font-display);
            color: var(--fg);
            border-bottom: 1px solid var(--border);
            border-radius: 0;
            white-space: normal;
          }
          .nav-menu-link--dashboard { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}
