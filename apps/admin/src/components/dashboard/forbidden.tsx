import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function Forbidden() {
  return (
    <Alert variant="destructive" data-testid="forbidden">
      <AlertTitle>403 · Not allowed</AlertTitle>
      <AlertDescription>Your role doesn’t have access to this page.</AlertDescription>
    </Alert>
  );
}
