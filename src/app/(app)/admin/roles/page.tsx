import { Check, Lock, Minus, TriangleAlert } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type GridCell, loadPermissionGrid } from "@/server/admin/permission-grid";
import { ROLE_DEFINITIONS, ROLE_KEYS } from "@/server/auth/permission-keys";
import { requirePermission } from "@/server/policies/authorize";

// Which role holds which permission key, right now (docs/permissions.md §3 and §8). Read only:
// editing the grid arrives in a later slice. Every cell says what it means in words, with an icon.

function Cell({ cell }: { cell: GridCell }) {
  switch (cell) {
    case "granted":
      return (
        <span className="inline-flex items-center gap-1.5 font-medium text-success">
          <Check aria-hidden className="size-4" /> Granted
        </span>
      );
    case "eligible_off":
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Minus aria-hidden className="size-4" /> Off, can be turned on
        </span>
      );
    case "not_possible":
      return <span className="text-muted-foreground">Not possible</span>;
    case "ineligible_grant":
    case "locked_missing":
      return (
        <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
          <TriangleAlert aria-hidden className="size-4" /> Problem
        </span>
      );
  }
}

export default async function RolesPage() {
  await requirePermission("admin.roles.edit_permissions");
  const grid = await loadPermissionGrid();

  // Group the rows by module, keeping the order of the definitions.
  const modules = [...new Set(grid.rows.map((row) => row.module))];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand">Roles and permissions</h1>
        <p className="text-sm text-muted-foreground">
          What each role may do right now. This page is read only: editing the grid is not available
          yet. Four keys are locked to Admin and can never be removed.
        </p>
      </div>

      {grid.warnings.length > 0 ? (
        <div role="alert" className="space-y-1 rounded-lg bg-amber-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-strong">
            <TriangleAlert aria-hidden className="size-4" /> The database does not match the rules
          </p>
          <ul className="list-disc pl-6">
            {grid.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-80">Permission</TableHead>
              {ROLE_KEYS.map((role) => (
                <TableHead key={role}>{ROLE_DEFINITIONS[role].name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((module) => (
              <ModuleRows
                key={module}
                module={module}
                rows={grid.rows.filter((row) => row.module === module)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ModuleRows({
  module,
  rows,
}: {
  module: string;
  rows: Awaited<ReturnType<typeof loadPermissionGrid>>["rows"];
}) {
  return (
    <>
      <TableRow className="bg-muted hover:bg-muted">
        <TableCell colSpan={1 + ROLE_KEYS.length} className="font-semibold">
          {module}
        </TableCell>
      </TableRow>
      {rows.map((row) => (
        <TableRow key={row.key}>
          <TableCell className="align-top whitespace-normal">
            <div className="flex items-center gap-2">
              <code className="text-sm font-medium">{row.key}</code>
              {row.locked ? (
                <span className="inline-flex items-center gap-1 rounded bg-amber-soft px-1.5 py-0.5 text-xs font-medium text-amber-strong">
                  <Lock aria-hidden className="size-3" /> Locked
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
          </TableCell>
          {ROLE_KEYS.map((role) => (
            <TableCell key={role} className="align-top">
              <Cell cell={row.cells[role]} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
