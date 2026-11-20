import { Check, Minus, ShieldCheck } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { PERMISSION_GROUPS, hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordCard, SignOutEverywhereCard } from "@/components/settings/profile-forms";
import { requireUser } from "@/server/auth";
import { profileInfo } from "@/server/queries/admin";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const me = await requireUser();
  const info = await profileInfo(me.id);
  const isAdmin = me.permissions.includes("*");
  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const groups = PERMISSION_GROUPS.map((g) => ({
    label: g.label,
    items: g.permissions.map((p) => ({ key: p.key, label: p.label, granted: hasPermission(me.permissions, p.key) })),
  }));
  const grantedCount = groups.reduce((s, g) => s + g.items.filter((i) => i.granted).length, 0);
  const total = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader className="mb-0" title="My profile" description="Your account, what your role allows, and sign-in security." />

      <Card className="py-0">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{me.name}</p>
            <p className="truncate text-sm text-muted-foreground">{me.email}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
            <dt className="text-muted-foreground">Role</dt>
            <dd className="flex items-center gap-1.5 font-medium sm:justify-end">
              {isAdmin && <ShieldCheck className="size-4 text-primary" />}
              {me.roleName}
            </dd>
            <dt className="text-muted-foreground">Last sign-in</dt>
            <dd className="tabular">{info.lastLoginAt ? formatDateTime(info.lastLoginAt) : "—"}</dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="tabular">{info.createdAt ? formatDate(info.createdAt) : "—"}</dd>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChangePasswordCard />
        <SignOutEverywhereCard sessions={info.activeSessions} />
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>What you can do</CardTitle>
          <CardDescription>
            {isAdmin ? "Your role has full access to everything." : `Your role (${me.roleName}) grants ${grantedCount} of ${total} permissions. Ask an administrator if you need more.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const on = g.items.filter((i) => i.granted).length;
            return (
              <div key={g.label} className="rounded-lg border">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                  <p className="text-sm font-medium">{g.label}</p>
                  <span className={cn("tabular rounded-full px-2 py-0.5 text-xs", on ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>
                    {on}/{g.items.length}
                  </span>
                </div>
                <ul className="space-y-1 p-3 text-sm">
                  {g.items.map((i) => (
                    <li key={i.key} className={cn("flex items-start gap-2", !i.granted && "text-muted-foreground")}>
                      {i.granted ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <Minus className="mt-0.5 size-4 shrink-0" />}
                      {i.label}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
