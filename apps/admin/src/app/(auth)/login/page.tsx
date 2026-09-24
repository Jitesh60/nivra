import type { Metadata } from 'next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const REASONS: Record<string, string> = {
  expired: 'Your session ended. Please sign in again.',
  disabled: 'This account is disabled. Contact a Super Admin.',
  'signed-out': 'You’re signed out.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next, reason } = await searchParams;
  const notice = typeof reason === 'string' ? REASONS[reason] : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Use your Sajha staff account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <LoginForm next={typeof next === 'string' ? next : undefined} />
      </CardContent>
    </Card>
  );
}
