import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in — Kasuri" },
      { name: "description", content: "Sign in to the Kasuri billing counter." },
      { property: "og:title", content: "Staff sign in — Kasuri" },
      { property: "og:description", content: "Sign in to the Kasuri billing counter." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("has_admin").then(({ data, error }) => {
      if (error) {
        setHasAdmin(false);
        return;
      }
      setHasAdmin(Boolean(data));
    });
  }, []);

  useEffect(() => {
    if (hasAdmin) setMode("signin");
  }, [hasAdmin]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (hasAdmin) {
          throw new Error("Ask your admin to create a staff account for you.");
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data: role } = await supabase.rpc("claim_staff_role");
      navigate({ to: role === "kitchen" ? "/kitchen" : "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  const bootstrapMode = hasAdmin === false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md border-border/70 shadow-sm">
        <CardHeader className="text-center">
          <Link to="/" className="text-3xl font-extrabold text-foreground">
            Kasuri
          </Link>
          <CardTitle className="mt-4 text-xl">
            {mode === "signin" ? "Staff sign in" : "Create owner account"}
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Sign in to open the billing counter."
              : "The first account becomes the owner/admin."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <Button type="submit" disabled={busy} className="h-12 w-full text-base">
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create owner account"}
            </Button>
          </form>
          {bootstrapMode && (
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {mode === "signin"
                ? "First time here? Create owner account"
                : "Already have an account? Sign in"}
            </button>
          )}
          {hasAdmin && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Need an account? Ask your admin to create one in Settings.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
