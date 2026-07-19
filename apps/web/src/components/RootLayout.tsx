import { Outlet, useNavigation } from "react-router";
import { RevalidateOnSessionLoss } from "@/components/RevalidateOnSessionLoss";

/**
 * Wraps every route (including /login, /auth/callback, /session-blocked).
 * `useNavigation()` covers every loader-driven wait — cold-start restore,
 * client-side transitions between protected routes, and revalidation
 * triggered by RevalidateOnSessionLoss — with one consistent "still on the
 * previous screen, dimmed" treatment instead of a per-view spinner.
 */
export function RootLayout() {
  const navigation = useNavigation();
  return (
    <>
      <RevalidateOnSessionLoss />
      <div
        className={navigation.state === "loading" ? "pointer-events-none opacity-60" : undefined}
      >
        <Outlet />
      </div>
    </>
  );
}
