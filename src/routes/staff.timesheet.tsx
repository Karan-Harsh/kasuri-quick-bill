import { createFileRoute } from "@tanstack/react-router";
import TimesheetPage from "@/components/staff/TimesheetPage";

export const Route = createFileRoute("/staff/timesheet")({ component: TimesheetPage });
