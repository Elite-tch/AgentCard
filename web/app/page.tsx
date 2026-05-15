import Link from 'next/link';
import { HeroScene, HeroCard } from '@/app/components/HeroCard';

const METRICS = [
  { label: 'DELIVERY', value: '60s', sub: 'Instant cards' },
  { label: 'NETWORK', value: 'Stellar', sub: 'Testnet' },
  { label: 'CONTROL', value: 'Direct', sub: 'No custody' },
  { label: 'FEE', value: '$0', sub: 'No extra cost' },
];

const FLOW = [
  {
    num: '01',
    title: 'Post Order',
    body: 'Send a USD amount to our API. Get a payment quote instantly.',
  },
  {
    num: '02',
    title: 'Pay On-Chain',
    body: 'Send USDC or XLM. Your agent signs the transaction directly.',
  },
  {
    num: '03',
    title: 'Auto Process',
    body: 'Our smart contract detects the payment and issues the card.',
  },
  {
    num: '04',
    title: 'Use Card',
    body: 'Get your Visa number, CVV, and expiry. Ready to spend.',
  },
];

export default function Home() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          paddingTop: '10rem',
          paddingBottom: '9rem',
          paddingLeft: '1.35rem',
          paddingRight: '1.35rem',
          overflow: 'hidden',
          background: '#020202',
        }}
      >
        <HeroScene />
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: '4rem',
            alignItems: 'center',
            position: 'relative',
            zIndex: 2,
          }}
          className="hero-grid"
        >
          <div style={{ position: 'relative', zIndex: 10 }}>
            <div
              className="type-eyebrow"
              style={{
                color: 'var(--accent)',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.75rem',
                letterSpacing: '0.15em',
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: 'var(--accent)',
                  borderRadius: '1px',
                  boxShadow: '0 0 10px var(--accent-glow)',
                }}
              />
              LIVE ON STELLAR TESTNET
            </div>

            <h1
              className="type-display-chrome"
              style={{
                fontSize: 'clamp(3.5rem, 9vw, 5.5rem)',
                marginBottom: '1rem',
              }}
            >
              agentcard
            </h1>

            <p
              style={{
                color: 'var(--accent)',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                maxWidth: '600px',
                lineHeight: 1.2,
                marginBottom: '1.5rem',
                textTransform: 'uppercase',
              }}
            >
              Real cards for AI agents.
            </p>

            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 'clamp(1.1rem, 2.5vw, 1.3rem)',
                maxWidth: '500px',
                lineHeight: 1.5,
                marginBottom: '3rem',
              }}
            >
              Instantly issue virtual Visa cards. Pay with USDC or XLM.
              No fees, no custody, no human needed.
            </p>

            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              <Link
                href="/dashboard"
                style={{
                  background: 'var(--accent)',
                  color: '#000',
                  padding: '1.1rem 2.2rem',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  borderRadius: '2px',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  transition: 'all 0.2s ease',
                  fontFamily: 'var(--font-display)',
                }}
              >
                Get Started
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>

              <Link
                href="/docs"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)',
                  padding: '1.1rem 2.2rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderRadius: '2px',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                  fontFamily: 'var(--font-display)',
                }}
              >
                Read Docs
              </Link>
            </div>
          </div>

          <div className="hero-art">
            <HeroCard />
          </div>
        </div>
      </section>

      {/* ── Metric row ───────────────────────────────────────────── */}
      <section
        style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(0, 255, 163, 0.02)',
          padding: '2rem 1.35rem',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '2rem',
          }}
        >
          {METRICS.map((m) => (
            <div key={m.label}>
              <div className="type-eyebrow" style={{ fontSize: '0.62rem', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.4)' }}>
                {m.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  color: '#fff',
                  marginBottom: '0.2rem',
                }}
              >
                {m.value}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.75rem',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {m.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Flow ─────────────────────────────────────────────────── */}
      <section
        style={{
          padding: '6rem 1.35rem',
          position: 'relative',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
          }}
        >
          <div className="type-eyebrow" style={{ marginBottom: '1rem', color: 'var(--accent)' }}>
            HOW IT WORKS
          </div>
          <h2
            className="type-display-tight"
            style={{
              maxWidth: 600,
              fontSize: '2.5rem',
              fontWeight: 800,
              marginBottom: '3rem',
              color: '#fff',
              lineHeight: 1.1,
            }}
          >
            Simple. Automated. Fast.
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {FLOW.map((step) => (
              <article
                key={step.num}
                style={{
                  position: 'relative',
                  padding: '2rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 2,
                  transition: 'all 0.3s var(--ease-out)',
                }}
                className="flow-step"
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--accent)',
                    letterSpacing: '0.1em',
                    marginBottom: '1rem',
                    fontWeight: 800,
                  }}
                >
                  {step.num}
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: 'white',
                    marginTop: 0,
                    marginBottom: '0.75rem',
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.9rem',
                    color: 'rgba(255,255,255,0.5)',
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        .flow-step:hover {
          border-color: var(--accent);
          background: rgba(0, 255, 163, 0.04);
          transform: translateY(-2px);
        }

        @media (max-width: 860px) {
          .hero-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 3rem !important;
            text-align: center;
          }
          .hero-grid > div {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .hero-art {
            max-width: 400px;
            margin: 0 auto;
          }
        }
      `}</style>
    </>
  );
}
