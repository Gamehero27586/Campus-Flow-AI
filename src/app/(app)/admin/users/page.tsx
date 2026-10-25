import Link from "next/link";
import { RoleBadge } from "@/components/layout/role-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type AdminUserRow, listUsersForAdmin } from "@/server/admin/queries";
import { requirePermission } from "@/server/policies/authorize";
import { ApproveForm, RejectForm, ResetToPendingForm } from "@/app/(app)/admin/users/review-forms";

const STATUSES = ["pending", "active", "rejected", "deactivated"] as const;
const STATUS_LABELS: Record<AdminUserRow["status"], string> = {
  pending: "Pending",
  active: "Active",
  rejected: "Rejected",
  deactivated: "Deactivated",
};

function parseStatus(value: string | string[] | undefined): AdminUserRow["status"] | undefined {
  return STATUSES.find((status) => status === value);
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { user } = await requirePermission("admin.users.manage");

  const { status: statusParam } = await searchParams;
  const selected = parseStatus(statusParam) ?? (statusParam === "all" ? undefined : "pending");
  const rows = await listUsersForAdmin(user, { status: selected });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-brand">Users</h1>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {[...STATUSES, "all" as const].map((status) => {
          const isSelected = (status === "all" && !selected) || status === selected;
          return (
            <Link
              key={status}
              href={`/admin/users?status=${status}`}
              aria-current={isSelected ? "page" : undefined}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium",
                isSelected ? "border-brand bg-teal-soft text-brand" : "bg-card hover:bg-muted",
              )}
            >
              {status === "all" ? "All" : STATUS_LABELS[status]}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">No accounts here.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested role</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="align-top">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {row.username ? `@${row.username}` : "No username yet"}
                    </div>
                    {row.isSeed ? <Badge variant="outline">Sample data</Badge> : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <div>{row.email}</div>
                    {row.emailVerified ? (
                      <span className="text-sm font-medium text-success">Email verified</span>
                    ) : (
                      <span className="rounded bg-amber-soft px-1.5 py-0.5 text-sm font-medium text-amber-strong">
                        Email not verified
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <div>{STATUS_LABELS[row.status]}</div>
                    {row.roleKey ? <RoleBadge roleKey={row.roleKey} className="mt-1" /> : null}
                    {row.rejectionReason ? (
                      <div className="text-sm text-muted-foreground">{row.rejectionReason}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">{row.requestedRole ?? "None"}</TableCell>
                  <TableCell className="min-w-72 align-top">
                    {row.status !== "pending" && row.status !== "rejected" ? (
                      <span className="text-sm text-muted-foreground">No action</span>
                    ) : row.id === user.id ? (
                      <span className="text-sm text-muted-foreground">
                        You cannot review your own account.
                      </span>
                    ) : row.status === "rejected" ? (
                      // Rejected by mistake: reapprove with a role, or send back to the pending list.
                      <div className="space-y-3">
                        {row.username ? (
                          <ApproveForm
                            mode="reapprove"
                            userId={row.id}
                            emailVerified={row.emailVerified}
                            requestedRole={row.requestedRole}
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Has not chosen a username yet.
                          </span>
                        )}
                        <ResetToPendingForm userId={row.id} />
                      </div>
                    ) : !row.username ? (
                      <span className="text-sm text-muted-foreground">
                        Has not chosen a username yet.
                      </span>
                    ) : (
                      <div className="space-y-3">
                        <ApproveForm
                          userId={row.id}
                          emailVerified={row.emailVerified}
                          requestedRole={row.requestedRole}
                        />
                        <RejectForm userId={row.id} />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
