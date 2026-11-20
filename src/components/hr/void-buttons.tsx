"use client";

import { Ban } from "lucide-react";
import { voidAdvanceAction } from "@/app/(app)/hr/advances/actions";
import { voidPayrollRunAction, voidSalaryPaymentAction } from "@/app/(app)/hr/payroll/actions";
import { ConfirmButton } from "@/components/app/confirm-button";

export function VoidAdvanceButton({ id, number }: { id: string; number: string }) {
  return (
    <ConfirmButton
      destructive
      variant="outline"
      title={`Void ${number}?`}
      description="The journal is reversed and the advance drops out of the employee's balance. Do this only if the money was never actually paid or was returned."
      confirmLabel="Void advance"
      onConfirm={() => voidAdvanceAction({ id })}
      success={`${number} voided`}
    >
      <Ban className="size-4" />
      Void
    </ConfirmButton>
  );
}

export function VoidRunButton({ id, number }: { id: string; number: string }) {
  return (
    <ConfirmButton
      destructive
      title={`Void payroll ${number}?`}
      description="The salary journal is reversed, advance recoveries are restored and attendance for the month is unlocked. The month can then be run again."
      confirmLabel="Void payroll"
      onConfirm={() => voidPayrollRunAction({ id })}
      success={`Payroll ${number} voided`}
    >
      <Ban className="size-4" />
      Void
    </ConfirmButton>
  );
}

export function VoidSalaryPaymentButton({ id, number }: { id: string; number: string }) {
  return (
    <ConfirmButton
      variant="ghost"
      size="sm"
      title={`Void salary payment ${number}?`}
      description="The payment journal is reversed and the salary shows as due again."
      confirmLabel="Void payment"
      destructive
      onConfirm={() => voidSalaryPaymentAction({ id })}
      success={`${number} voided`}
    >
      Void
    </ConfirmButton>
  );
}
