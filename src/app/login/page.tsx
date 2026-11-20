import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3, Boxes, Landmark, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const HIGHLIGHTS = [
  { icon: Landmark, title: "Double-entry accounting", text: "Every sale, purchase and expense lands in one General Ledger." },
  { icon: Boxes, title: "Multi-warehouse stock", text: "Rolls, batches, transfers and counts with live valuation." },
  { icon: BarChart3, title: "Real-time insight", text: "Profit, cash and stock at a glance, any period." },
  { icon: ShieldCheck, title: "Secure by design", text: "Server-side roles and permissions with a full audit trail." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-sidebar-primary/25 blur-3xl"
        />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-24 size-[30rem] rounded-full bg-chart-2/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-lg font-bold text-sidebar-primary-foreground">
            S4
          </div>
          <div>
            <p className="text-lg font-semibold text-sidebar-accent-foreground">Shusui V4</p>
            <p className="text-xs text-sidebar-foreground/60">by LabridTech</p>
          </div>
        </div>
        <div className="relative mt-auto max-w-lg space-y-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-sidebar-accent-foreground">
            Run sales, stock, money and people from one place.
          </h1>
          <ul className="grid gap-5 sm:grid-cols-2">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="space-y-1.5">
                <h.icon className="size-5 text-sidebar-primary" />
                <p className="font-medium text-sidebar-accent-foreground">{h.title}</p>
                <p className="text-sm text-sidebar-foreground/70">{h.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-sidebar-foreground/50">© {new Date().getFullYear()} LabridTech. All rights reserved.</p>
      </aside>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">S4</div>
              <span className="text-lg font-semibold">Shusui V4</span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in with your work email to continue.</p>
          </div>
          <LoginForm next={next} />
        </div>
      </section>
    </div>
  );
}
