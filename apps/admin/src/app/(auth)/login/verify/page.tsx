import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VerifyForm } from './verify-form';

export const metadata: Metadata = { title: 'Two-factor authentication' };

export default async function VerifyPage({ searchParams }: PageProps<'/login/verify'>) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Two-factor authentication</CardTitle>
        <CardDescription>Enter the code from your authenticator app.</CardDescription>
      </CardHeader>
      <CardContent>
        <VerifyForm next={typeof next === 'string' ? next : '/'} />
      </CardContent>
    </Card>
  );
}
