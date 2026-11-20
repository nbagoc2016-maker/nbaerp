import { ShieldCheck, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RolesPanel } from "@/components/settings/roles-panel";
import { UsersPanel } from "@/components/settings/users-panel";
import { requirePermission } from "@/server/auth";
import { listRoles, listUsers } from "@/server/queries/admin";

export const metadata = { title: "Users & roles" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requirePermission("settings.users");
  const { tab } = await searchParams;
  const [users, roles] = await Promise.all([listUsers(), listRoles()]);
  const active = users.filter((u) => u.isActive).length;
  const admins = users.filter((u) => u.isActive && u.isAdmin).length;

  return (
    <div className="space-y-6">
      <PageHeader className="mb-0" title="Users & roles" description="Who can sign in, and what each role is allowed to see and do." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Users" value={users.length} icon={Users} hint={`${active} active`} />
        <StatCard label="Administrators" value={admins} icon={ShieldCheck} tone="info" hint="Active users with full access" />
        <StatCard label="Roles" value={roles.length} icon={UserCheck} tone="success" hint="Including built-in roles" />
      </div>
      <Tabs defaultValue={tab === "roles" ? "roles" : "users"} className="gap-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersPanel users={users} roles={roles} meId={me.id} />
        </TabsContent>
        <TabsContent value="roles">
          <RolesPanel roles={roles} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
