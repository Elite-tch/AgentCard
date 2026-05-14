// web/app/dashboard/agents/page.tsx
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getApiKeys } from '@/lib/backend/services/api-keys';
import { getOrders } from '@/lib/backend/services/orders';
import { PageContainer } from '../_ui/PageContainer';
import { PageHeader } from '../_ui/PageHeader';
import AgentsList from './AgentsList';
import type { ApiKey, Order } from '../_lib/types';

export default async function AgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/dashboard');

  const [agents, orders] = await Promise.all([
    getApiKeys(session.user.id) as Promise<ApiKey[]>,
    getOrders(session.user.id, 200) as Promise<Order[]>,
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Agents"
        subtitle={`${agents.length} total agents — Real-time via Server Components`}
      />
      <AgentsList initialAgents={agents} initialOrders={orders} />
    </PageContainer>
  );
}
