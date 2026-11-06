import { createFileRoute } from "@tanstack/react-router";
import AdvancesPage from "@/components/staff/AdvancesPage";

export const Route = createFileRoute("/staff/advances")({ component: AdvancesPage });
