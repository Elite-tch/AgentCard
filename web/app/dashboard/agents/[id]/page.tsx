// web/app/dashboard/agents/[id]/page.tsx
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { getApiKey } from '@/lib/backend/services/api-keys';
import { getOrdersForAgent } from '@/lib/backend/services/orders';
import AgentDetailClient from './AgentDetailClient';
import type { ApiKey, Order } from '../../_lib/types';

type PageProps = { params: Promise<{ id: string }> };

export default async function AgentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/dashboard');

  const [agent, orders] = await Promise.all([
    getApiKey(id) as Promise<ApiKey | null>,
    getOrdersForAgent(id, 100) as Promise<Order[]>,
  ]);

  if (!agent) return notFound();

  return (
    <AgentDetailClient 
      id={id} 
      initialAgent={agent} 
      initialOrders={orders} 
    />
  );
}
