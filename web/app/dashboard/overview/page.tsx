// web/app/dashboard/overview/page.tsx
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDashboardStats } from '@/lib/backend/services/stats';
import { getOrders } from '@/lib/backend/services/orders';
import { getApiKeys } from '@/lib/backend/services/api-keys';
import { KpiTile, KpiRow } from '../_ui/KpiTile';
import { Card } from '../_ui/Card';
import { EmptyState } from '../_ui/EmptyState';
import { SpendChart } from '../_ui/SpendChart';
import { OrderStatusPill } from '../_ui/OrderStatusPill';
import { PageContainer } from '../_ui/PageContainer';
import { PageHeader } from '../_ui/PageHeader';
import { formatUsd, parseTimestamp, timeAgo, bucketSpendByDay } from '../_lib/format';
import type { Order, ApiKey } from '../_lib/types';

export default async function OverviewPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/dashboard');

  const [stats, orders, agents] = await Promise.all([
    getDashboardStats(session.user.id),
    getOrders(session.user.id, 50) as Promise<Order[]>,
    getApiKeys(session.user.id) as Promise<ApiKey[]>,
  ]);


  // Derive top agents for the 7d window
  const now = Date.now();
  const DAY = 86_400_000;
  const in7d = orders.filter((o) => now - parseTimestamp(o.created_at) < 7 * DAY);
  const delivered7d = in7d.filter((o) => o.status === 'delivered');
  
  const spendByAgentId = new Map<string, number>();
  for (const o of delivered7d) {
    spendByAgentId.set(
      o.api_key_id,
      (spendByAgentId.get(o.api_key_id) || 0) + (parseFloat(o.amount_usdc) || 0),
    );
  }
  const topAgents = [...spendByAgentId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, spent]) => {
      const agent = agents.find((a) => a.id === id);
      return { id, label: agent?.label ?? null, spent };
    });

  const chartData = bucketSpendByDay(orders, 14);
  const recentActivity = orders.slice(0, 10);

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        subtitle="Dashboard metrics and activity"
      />

      <KpiRow>
        <KpiTile
          label="Total Spend"
          value={formatUsd(stats.total_gmv)}
          hint={`${stats.total_orders} orders`}
        />
        <KpiTile
          label="Delivered"
          value={stats.delivered}
          hint={`${((stats.delivered / (stats.total_orders || 1)) * 100).toFixed(1)}% success`}
        />
        <KpiTile
          label="Pending"
          value={stats.pending}
          hint="Awaiting payment"
        />
        <KpiTile 
          label="Active agents" 
          value={stats.active_keys} 
          hint={`${agents.length} total`} 
        />
        <KpiTile 
          label="Approvals" 
          value={stats.pending_approvals} 
          hint="Awaiting review" 
          tone={stats.pending_approvals > 0 ? "yellow" : "green"}
        />
      </KpiRow>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: '1.25rem',
          marginBottom: '1.5rem'
        }}
      >
        <Card
          title="Spend — last 14 days"
          actions={
            <Link
              href="/dashboard/analytics"
              style={{
                fontSize: '0.72rem',
                color: 'var(--fg-dim)',
                textDecoration: 'none',
              }}
            >
              View analytics →
            </Link>
          }
        >
          <SpendChart data={chartData} height={220} />
        </Card>

        <Card title="Top agents (7d)">
          {topAgents.length === 0 ? (
            <EmptyState
              title="No active agents yet"
              description="Your highest-spending agents this week will show up here."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {topAgents.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                  }}
                >
                  <Link
                    href={`/dashboard/agents/${a.id}`}
                    style={{
                      color: 'var(--fg)',
                      textDecoration: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '65%',
                    }}
                  >
                    {a.label || 'Unnamed'}
                  </Link>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--fg-dim)',
                      fontSize: '0.75rem',
                    }}
                  >
                    {formatUsd(a.spent)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Recent activity"
        actions={
          <Link
            href="/dashboard/orders"
            style={{ fontSize: '0.72rem', color: 'var(--fg-dim)', textDecoration: 'none' }}
          >
            View all orders →
          </Link>
        }
        padding={0}
      >
        {recentActivity.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Orders from your agents will appear here as they flow through the system."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                    {o.api_key_label || o.api_key_id.slice(0, 8)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{formatUsd(o.amount_usdc)}</td>
                  <td>
                    <OrderStatusPill status={o.status} />
                  </td>
                  <td style={{ color: 'var(--fg-dim)' }}>{timeAgo(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
            </table>
          )}
        </Card>
      </PageContainer>
    );
}
