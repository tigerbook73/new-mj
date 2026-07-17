import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Phase 5: the real login surface, replacing login-form.tsx's role as the
 * primary entry point — login-form.tsx (shadcn login-03's original social
 * buttons dropped for D16's dev-only nickname flow, see its own comment)
 * still exists but is now the secondary/dev-only section (see LoginView).
 */
export function SocialLoginForm({
  className,
  onGoogle,
  onGithub,
  pending,
  error,
  ...props
}: Omit<React.ComponentProps<"div">, "onClick"> & {
  onGoogle: () => void;
  onGithub: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Online Mahjong</CardTitle>
          <CardDescription>Sign in to start playing</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" disabled={pending} onClick={onGoogle}>
            Sign in with Google
          </Button>
          <Button variant="outline" disabled={pending} onClick={onGithub}>
            Sign in with GitHub
          </Button>
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
