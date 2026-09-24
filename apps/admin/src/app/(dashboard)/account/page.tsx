import type { Metadata } from 'next';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, getMe, unwrap } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/roles';
import { revokeSessionAction } from './actions';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'My account' };

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function describeAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown browser';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Linux/.test(ua)
          ? 'Linux'
          : /iPhone|iPad/.test(ua)
            ? 'iOS'
            : '';
  return os ? `${browser} on ${os}` : browser;
}

export default async function AccountPage() {
  const [me, sessions] = await Promise.all([
    getMe(),
    adminApi().then((api) => unwrap(api.GET('/v1/admin/me/sessions'))),
  ]);

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p className="font-medium">{me.name}</p>
            <p>{me.email}</p>
            <p>
              <Badge variant="secondary">{ROLE_LABEL[me.role]}</Badge>{' '}
              <Badge variant="outline">2FA {me.twoFactorEnabled ? 'on' : 'off'}</Badge>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Signed-in sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y" data-testid="sessions">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {describeAgent(s.userAgent)}{' '}
                      {s.current && <Badge className="ml-1">This session</Badge>}
                    </p>
                    <p className="text-muted-foreground">
                      {s.ip ?? 'unknown IP'} · signed in {dateTime.format(new Date(s.createdAt))} ·
                      expires {dateTime.format(new Date(s.expiresAt))}
                    </p>
                  </div>
                  {!s.current && (
                    <form action={revokeSessionAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Sign out
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
