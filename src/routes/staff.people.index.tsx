import { createFileRoute } from "@tanstack/react-router";
import StaffListPage from "@/components/staff/StaffListPage";

export const Route = createFileRoute("/staff/people/")({ component: StaffListPage });
