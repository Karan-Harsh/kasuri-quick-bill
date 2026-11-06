import { createFileRoute } from "@tanstack/react-router";
import PayslipPage from "@/components/staff/PayslipPage";

export const Route = createFileRoute("/staff/salary/$month/$employeeId")({
  head: () => ({ meta: [{ title: "Salary slip — Kasuri" }] }),
  component: function Payslip() {
    const { month, employeeId } = Route.useParams();
    return <PayslipPage month={month} employeeId={employeeId} />;
  },
});
