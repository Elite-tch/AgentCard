'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavLinks } from './NavLinks';
import { Wordmark } from './Wordmark';
import type { MouseEvent, ReactNode } from 'react';

export function MarketingChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname.startsWith('/dashboard');

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="grain" aria-hidden />
      <nav
        className="marketing-nav"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'rgba(2, 2, 2, 0.7)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          transition: 'all 0.3s ease',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '3rem 1.3rem',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: 'var(--fg)',
              transition: 'color 0.4s var(--ease-out)',
            }}
            onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) =>
              (e.currentTarget.style.color = 'var(--accent)')
            }
            onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) =>
              (e.currentTarget.style.color = 'var(--fg)')
            }
          >
            <Wordmark height={26} />
          </Link>
          <NavLinks />
        </div>
      </nav>

      <main id="main" style={{ flex: 1, position: 'relative', zIndex: 2 }}>
        {children}
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '2.5rem 1.35rem',
          marginTop: '4rem',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.5rem',
          }}
        >
          <div style={{ opacity: 0.6 }}>
            <Wordmark height={18} />
          </div>
          <div
            style={{
              fontSize: '0.7rem',
              color: 'rgba(255,255,255,0.4)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em',
            }}
          >
            © 2026 AGENTCARD. TESTNET PHASE.
          </div>
        </div>
      </footer>
    </>
  );
}
