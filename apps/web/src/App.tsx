import { RouterProvider } from "react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import { router } from "@/router";

export function App() {
  return (
    <>
      <ThemeToggle />
      <RouterProvider router={router} />
    </>
  );
}
