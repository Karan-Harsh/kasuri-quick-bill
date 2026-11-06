import { ChevronRight, Phone, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { staffApi, useLoad } from "@/lib/staff-api";
import EmployeeForm from "./EmployeeForm";
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader } from "./ui";
import { fmtNum, useMoney } from "./format";

export default function EmployeesPage() {
  const { data: employees, error, reload } = useLoad(() => staffApi.employees(), []);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [showFormer, setShowFormer] = useState(false);
  const money = useMoney();
  const navigate = useNavigate();

  const filtered = (employees ?? []).filter(
    (e) =>
      (showFormer || e.active) &&
      `${e.name} ${e.role} ${e.phone}`.toLowerCase().includes(query.toLowerCase()),
  );
  const formerCount = (employees ?? []).filter((e) => !e.active).length;

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle={employees && `${employees.filter((e) => e.active).length} people working`}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus size={18} /> Add staff
          </Button>
        }
      />
      {error && <ErrorBox message={error} />}
      {!employees ? (
        <Loading />
      ) : employees.length === 0 ? (
        <Empty icon={<Users size={48} />} title="No staff added yet">
          <p>Add your first employee to start tracking attendance and salary.</p>
          <Button className="mt-4" onClick={() => setAdding(true)}>
            <Plus size={18} /> Add staff
          </Button>
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground/60"
              />
              <input
                className="w-full pl-10"
                placeholder="Search by name, role or phone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {formerCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={showFormer}
                  onChange={(e) => setShowFormer(e.target.checked)}
                />
                Show former staff ({formerCount})
              </label>
            )}
          </div>
          <Card className="divide-y divide-border">
            {filtered.map((e) => (
              <Link
                key={e.id}
                to="/staff/people/$id"
                params={{ id: String(e.id) }}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted"
              >
                <Avatar name={e.name} id={e.id} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    {e.name}
                    {!e.active && <Badge>Left</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                    {e.role && <span>{e.role}</span>}
                    {e.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={12} /> {e.phone}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{money(e.monthly_salary)}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtNum(e.allowed_leaves)} leaves/month
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground/60" />
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-muted-foreground">
                No one matches “{query}”.
              </div>
            )}
          </Card>
        </>
      )}
      {adding && (
        <EmployeeForm
          onClose={() => setAdding(false)}
          onSaved={(e) => {
            setAdding(false);
            reload();
            navigate({ to: "/staff/people/$id", params: { id: String(e.id) } });
          }}
        />
      )}
    </>
  );
}
