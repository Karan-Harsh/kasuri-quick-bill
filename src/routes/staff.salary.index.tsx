import { createFileRoute } from "@tanstack/react-router";
import SalaryPage from "@/components/staff/SalaryPage";

export const Route = createFileRoute("/staff/salary/")({ component: SalaryPage });
