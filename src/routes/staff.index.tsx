import { createFileRoute } from "@tanstack/react-router";
import TodayPage from "@/components/staff/TodayPage";

export const Route = createFileRoute("/staff/")({ component: TodayPage });
