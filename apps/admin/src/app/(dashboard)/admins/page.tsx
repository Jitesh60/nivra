import type { Metadata } from 'next';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, getMe, unwrap } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/roles';
import { AdminRowActions } from './admin-row-actions';
import { InviteForm } from './invite-form';

export const metadata: Metadata = { title: 'Admins' };

export default async function AdminsPage() {
  const me = await getMe();
  if (me.role !== 'SUPER_ADMIN') return <Forbidden />;

  const admins = await unwrap((await adminApi()).GET('/v1/admin/admins'));

  return (
    <>
      <PageHeader title="Admins" description="Only Super Admins can see this page." />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Invite an admin</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>2FA</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((admin) => (
              <TableRow key={admin.id} data-testid="admin-row">
                <TableCell className="font-medium">{admin.name}</TableCell>
                <TableCell>{admin.email}</TableCell>
                <TableCell>{ROLE_LABEL[admin.role]}</TableCell>
                <TableCell>
                  <Badge variant={admin.status === 'ACTIVE' ? 'outline' : 'destructive'}>
                    {admin.status.toLowerCase()}
                  </Badge>
                  {admin.mustChangePassword && (
                    <Badge variant="secondary" className="ml-1">
                      invited
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{admin.twoFactorEnabled ? 'On' : 'Pending'}</TableCell>
                <TableCell>
                  <AdminRowActions
                    id={admin.id}
                    email={admin.email}
                    role={admin.role}
                    status={admin.status}
                    isSelf={admin.id === me.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
