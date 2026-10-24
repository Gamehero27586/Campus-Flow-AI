import { redirect } from "next/navigation";
import { requirePermission } from "@/server/policies/authorize";

export default async function AdminHomePage() {
  await requirePermission("admin.users.manage");
  redirect("/admin/users");
}
