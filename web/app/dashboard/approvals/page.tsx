// web/app/dashboard/approvals/page.tsx
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getApprovals } from '@/lib/backend/services/approvals';
import { PageContainer } from '../_ui/PageContainer';
import { PageHeader } from '../_ui/PageHeader';
import ApprovalsList from './ApprovalsList';
import type { ApprovalRequest } from '../_lib/types';

export default async function ApprovalsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/dashboard');

  const approvals = await getApprovals(session.user.id) as ApprovalRequest[];

  return (
    <PageContainer>
      <PageHeader
        title="Approvals"
        subtitle={`${approvals.length} pending decisions`}
      />
      <ApprovalsList initialData={approvals} />
    </PageContainer>
  );
}
