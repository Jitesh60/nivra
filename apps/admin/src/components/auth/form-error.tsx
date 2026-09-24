import { Alert, AlertDescription } from '@/components/ui/alert';

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" data-testid="form-error">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
