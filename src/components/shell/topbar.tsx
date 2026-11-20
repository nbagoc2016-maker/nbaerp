"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { LogOut, Moon, Plus, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { NAV } from "@/config/nav";
import { QUICK_CREATE } from "@/config/quick-create";
import { hasPermission } from "@/lib/permissions";
import { signOut } from "@/server/session-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CommandMenu } from "./command-menu";
import { isActive } from "./app-sidebar";

function useCrumbs() {
  const pathname = usePathname();
  for (const group of NAV) {
    // Prefer the longest matching href so /sales/invoices/new resolves to "Invoices"
    const item = [...group.items].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(pathname, i.href));
    if (item) {
      const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
      const tail = rest[0] === "new" ? "New" : rest.length ? "Details" : null;
      return { group: group.title, item, tail };
    }
  }
  return null;
}

export function Topbar({ user }: { user: { name: string; email: string; roleName: string; permissions: string[] } }) {
  const crumbs = useCrumbs();
  const { resolvedTheme, setTheme } = useTheme();
  const creates = QUICK_CREATE.filter((q) => !q.permission || hasPermission(user.permissions, q.permission));
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      {crumbs && (
        <Breadcrumb className="hidden md:block">
          <BreadcrumbList>
            <BreadcrumbItem className="text-muted-foreground">{crumbs.group}</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {crumbs.tail ? (
                <BreadcrumbLink asChild>
                  <Link href={crumbs.item.href}>{crumbs.item.title}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumbs.item.title}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {crumbs.tail && (
              <Fragment>
                <BreadcrumbSeparator />
                <BreadcrumbPage>{crumbs.tail}</BreadcrumbPage>
              </Fragment>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="ml-auto flex items-center gap-2">
        <CommandMenu permissions={user.permissions} />
        {creates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="size-4" />
                <span className="hidden sm:inline">New</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Create</DropdownMenuLabel>
              {creates.map((q) => (
                <DropdownMenuItem key={q.href} asChild>
                  <Link href={q.href}>
                    <q.icon />
                    {q.title}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium lg:inline">{user.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-1 text-xs text-primary">{user.roleName}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserRound />
                My profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => signOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
