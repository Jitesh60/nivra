import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SetupForm } from './setup-form';

export const metadata: Metadata = { title: 'Set up two-factor authentication' };

export default async function SetupPage({ searchParams }: PageProps<'/login/setup'>) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Set up two-factor authentication</CardTitle>
        <CardDescription>Required for every admin. It only takes a minute.</CardDescription>
      </CardHeader>
      <CardContent>
        <SetupForm next={typeof next === 'string' ? next : '/'} />
      </CardContent>
    </Card>
  );
}
