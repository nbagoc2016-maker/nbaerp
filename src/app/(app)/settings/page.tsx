import { redirect } from "next/navigation";
import { can, requireUser } from "@/server/auth";

export default async function SettingsPage() {
  const user = await requireUser();
  if (can(user, "settings.company")) redirect("/settings/company");
  if (can(user, "settings.users")) redirect("/settings/users");
  if (can(user, "settings.audit")) redirect("/settings/audit");
  redirect("/forbidden");
}
