import { createFileRoute } from "@tanstack/react-router";
import StaffDetailPage from "@/components/staff/StaffDetailPage";

export const Route = createFileRoute("/staff/people/$id")({
  component: function StaffDetail() {
    const { id } = Route.useParams();
    return <StaffDetailPage id={Number(id)} />;
  },
});
