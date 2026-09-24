import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** 6-digit authenticator code field. */
export function CodeInput() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="code">Authenticator code</Label>
      <Input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        placeholder="123 456"
        required
        autoFocus
        className="text-center font-mono text-lg tracking-[0.4em]"
      />
    </div>
  );
}
