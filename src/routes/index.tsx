import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kasuri — Billing & Sales for the Counter" },
      {
        name: "description",
        content:
          "Kasuri restaurant billing: 8 table board, parcel bills, GST invoices and daily sales reports.",
      },
      { property: "og:title", content: "Kasuri — Billing & Sales for the Counter" },
      {
        property: "og:description",
        content:
          "Kasuri restaurant billing: 8 table board, parcel bills, GST invoices and daily sales reports.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 py-16 text-center">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-primary">
          Restaurant counter
        </p>
        <h1 className="text-6xl font-extrabold text-foreground sm:text-7xl">Kasuri</h1>
        <p className="mx-auto max-w-md text-lg text-muted-foreground">
          Take orders on 8 tables, punch parcel bills, print GST invoices and see the
          day's sales — all from one screen.
        </p>
      </div>
      <Button asChild size="lg" className="h-14 px-10 text-lg">
        <Link to="/auth">Staff sign in</Link>
      </Button>
    </main>
  );
}
