import type { FormEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Adapted from shadcn's login-03 block: dev-mode fake login only (nickname,
 * decisions.md D16), the password field and terms footer from the original
 * block are dropped, keeping the Card/Field visual scaffold. Phase 5:
 * real sign-in moved to social-login-form.tsx (the block's original social
 * buttons, reinstated); this form now only renders behind
 * `import.meta.env.DEV` in LoginView, as a dev/e2e-test-only fallback.
 */
export function LoginForm({
  className,
  nickname,
  onNicknameChange,
  onSubmit,
  pending,
  error,
  ...props
}: Omit<React.ComponentProps<"div">, "onSubmit"> & {
  nickname: string;
  onNicknameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Online Mahjong</CardTitle>
          <CardDescription>Enter a nickname to start playing</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="nickname">Nickname</FieldLabel>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(event) => onNicknameChange(event.target.value)}
                  placeholder="Enter nickname"
                  disabled={pending}
                  autoFocus
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "Connecting…" : "Enter game"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
