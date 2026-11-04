import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "@fontsource-variable/bricolage-grotesque";
import "@/styles.css";
import { Toaster } from "@/components/ui/sonner";
import { WaiterApp } from "./WaiterApp";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WaiterApp />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  </StrictMode>,
);
