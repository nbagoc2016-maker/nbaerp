"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/server/session-actions";
import { signOutEverywhere } from "@/app/(app)/profile/actions";

export function ChangePasswordCard() {
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const mismatch = v.confirm.length > 0 && v.next !== v.confirm;
  const short = v.next.length > 0 && v.next.length < 8;

  return (
    <Card className="gap-4">
      <form
        className="flex h-full flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await changePassword(v);
            if (res.ok) {
              toast.success("Password changed");
              setV({ current: "", next: "", confirm: "" });
            } else {
              setError(res.error ?? "Couldn't change the password");
              toast.error(res.error ?? "Couldn't change the password");
            }
          });
        }}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" /> Change password
          </CardTitle>
          <CardDescription>Use at least 8 characters. You stay signed in on this device.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div>
            <Label htmlFor="pw-current" className="mb-1.5">
              Current password
            </Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pw-next" className="mb-1.5">
                New password
              </Label>
              <Input id="pw-next" type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} required aria-invalid={short} />
              {short && <p className="mt-1 text-xs text-destructive">At least 8 characters</p>}
            </div>
            <div>
              <Label htmlFor="pw-confirm" className="mb-1.5">
                Confirm new password
              </Label>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} required aria-invalid={mismatch} />
              {mismatch && <p className="mt-1 text-xs text-destructive">Passwords don&apos;t match</p>}
            </div>
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="mt-auto justify-end">
          <Button type="submit" disabled={pending || !v.current || v.next.length < 8 || v.next !== v.confirm}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function SignOutEverywhereCard({ sessions }: { sessions: number }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="size-4 text-muted-foreground" /> Sign out everywhere
        </CardTitle>
        <CardDescription>
          You are signed in on {sessions} device{sessions === 1 ? "" : "s"} or browser{sessions === 1 ? "" : "s"}. If you used a shared computer or lost a phone, sign out of all
          of them at once.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <ConfirmButton
          variant="outline"
          size="default"
          title="Sign out of every device?"
          description="All your sessions end, including this one. You'll need to sign in again."
          confirmLabel="Sign out everywhere"
          redirectTo="/login"
          onConfirm={() => signOutEverywhere({})}
        >
          <LogOut className="size-4" /> Sign out everywhere
        </ConfirmButton>
      </CardFooter>
    </Card>
  );
}
