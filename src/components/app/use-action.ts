"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Run a server action from a client component with a pending flag and toasts.
 *
 *   const { run, pending } = useAction();
 *   await run(() => postInvoice({ id }), { success: "Invoice posted", redirectTo: (d) => `/sales/invoices/${d.id}` })
 */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function run<T>(
    fn: () => Promise<Result<T>>,
    opts: { success?: string | ((data: T) => string); redirectTo?: string | ((data: T) => string); refresh?: boolean; onSuccess?: (data: T) => void } = {}
  ): Promise<Result<T>> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await fn();
        if (res.ok) {
          setFieldErrors({});
          const msg = typeof opts.success === "function" ? opts.success(res.data) : (opts.success ?? res.message);
          if (msg) toast.success(msg);
          opts.onSuccess?.(res.data);
          if (opts.redirectTo) router.push(typeof opts.redirectTo === "function" ? opts.redirectTo(res.data) : opts.redirectTo);
          else if (opts.refresh !== false) router.refresh();
        } else {
          setFieldErrors(res.fieldErrors ?? {});
          toast.error(res.error);
        }
        resolve(res);
      });
    });
  }

  return { run, pending, fieldErrors };
}
