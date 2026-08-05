import { Link, useParams } from "react-router";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { VARIANT_INFO } from "./variantInfoContent";

/**
 * Public, static rules explainer — no auth/socket dependency, reachable
 * without logging in (see router.tsx: sits outside ProtectedLayout, unlike
 * every other feature page). Content lives in variantInfoContent.ts, an
 * adapted-for-players summary of docs/variants/<rulesetId>.md.
 */
export function VariantInfoView() {
  const { rulesetId } = useParams<{ rulesetId: string }>();
  const info = rulesetId ? VARIANT_INFO[rulesetId] : undefined;

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Link to="/games" className="w-fit text-sm underline">
          返回大厅
        </Link>
        {info ? (
          <Card>
            <CardHeader>
              <h1 className="font-heading text-2xl font-medium">{info.title}</h1>
              <p className="text-sm text-muted-foreground">{info.tagline}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {info.sections.map((section) => (
                <div key={section.heading} className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold">{section.heading}</h2>
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">未找到这个玩法的介绍。</p>
        )}
      </div>
    </main>
  );
}
