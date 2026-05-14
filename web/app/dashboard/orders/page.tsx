// web/app/dashboard/orders/page.tsx
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getOrders } from '@/lib/backend/services/orders';
import { getApiKeys } from '@/lib/backend/services/api-keys';
import { PageContainer } from '../_ui/PageContainer';
import { PageHeader } from '../_ui/PageHeader';
import OrdersList from './OrdersList';
import type { Order, ApiKey } from '../_lib/types';

export default async function OrdersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/dashboard');

  const [orders, agents] = await Promise.all([
    getOrders(session.user.id, 500) as Promise<Order[]>,
    getApiKeys(session.user.id) as Promise<ApiKey[]>,
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Orders"
        subtitle={`${orders.length} total history — Real-time via Server Actions`}
      />
      <OrdersList initialOrders={orders} initialAgents={agents} />
    </PageContainer>
  );
}
