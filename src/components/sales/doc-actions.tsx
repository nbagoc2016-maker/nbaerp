"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, FileOutput, HandCoins, Pencil, RotateCcw, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { deleteInvoiceAction, postInvoiceAction, voidInvoiceAction } from "@/app/(app)/sales/invoices/actions";
import { cancelOrderAction, confirmOrderAction, deleteOrderAction } from "@/app/(app)/sales/orders/actions";
import { convertQuotationAction, deleteQuotationAction, setQuotationStatusAction } from "@/app/(app)/sales/quotations/actions";
import { voidReceiptAction } from "@/app/(app)/sales/receipts/actions";
import { postReturnAction, voidReturnAction } from "@/app/(app)/sales/returns/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { PrintButton } from "@/components/app/print-button";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { VoidDialog } from "./void-dialog";

// ---- Invoice ----------------------------------------------------------------------------------

export function InvoiceActions({
  id,
  number,
  status,
  channel,
  customerId,
  balance,
  returnable,
  perms,
}: {
  id: string;
  number: string;
  status: string;
  channel: string;
  customerId: string | null;
  balance: number;
  returnable: boolean;
  perms: { create: boolean; post: boolean; void: boolean; receipts: boolean };
}) {
  return (
    <>
      <PrintButton />
      {status === "draft" && (
        <>
          {perms.create && (
            <ConfirmButton
              variant="outline"
              title={`Delete draft ${number}?`}
              description="The draft is removed for good. Nothing was posted, so stock and the books aren't affected."
              confirmLabel="Delete draft"
              destructive
              onConfirm={() => deleteInvoiceAction({ id })}
              success="Draft deleted"
              redirectTo="/sales/invoices"
            >
              <Trash2 className="size-4" />
              Delete
            </ConfirmButton>
          )}
          {perms.create && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/sales/invoices/${id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          )}
          {perms.post && (
            <ConfirmButton
              title={`Post invoice ${number}?`}
              description="Stock leaves the warehouse and the sale is recorded in the books. Posted invoices can't be edited; void or return instead."
              confirmLabel="Post invoice"
              onConfirm={async () => {
                const res = await postInvoiceAction({ id });
                if (res.ok && res.data.warning) toast.warning(res.data.warning, { duration: 8000 });
                return res;
              }}
              success="Invoice posted"
            >
              <CheckCircle2 className="size-4" />
              Post invoice
            </ConfirmButton>
          )}
        </>
      )}
      {status === "posted" && (
        <>
          {perms.void && (
            <VoidDialog
              title={`Void ${number}?`}
              description={
                channel === "pos"
                  ? "Stock comes back, the sale is reversed in the books and the payments taken at the counter for this sale are voided with it."
                  : "Stock comes back and the sale is reversed in the books. Receipts allocated to this invoice must be voided first."
              }
              confirmLabel="Void invoice"
              onConfirm={(reason) => voidInvoiceAction({ id, reason })}
              success="Invoice voided"
            />
          )}
          {returnable && perms.create && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/sales/returns/new?invoice=${id}`}>
                <RotateCcw className="size-4" />
                Create return
              </Link>
            </Button>
          )}
          {balance > 0 && perms.receipts && (
            <Button asChild size="sm">
              <Link href={`/sales/receipts/new?customer=${customerId ?? "walkin"}&invoice=${id}`}>
                <HandCoins className="size-4" />
                Record payment
              </Link>
            </Button>
          )}
        </>
      )}
    </>
  );
}

// ---- Quotation --------------------------------------------------------------------------------

export function QuotationActions({ id, number, status, hasCustomer, canCreate }: { id: string; number: string; status: string; hasCustomer: boolean; canCreate: boolean }) {
  const { run, pending } = useAction();
  const router = useRouter();
  const setStatus = (s: "draft" | "sent" | "accepted" | "rejected" | "expired", msg: string) => run(() => setQuotationStatusAction({ id, status: s }), { success: msg });
  const convert = (target: "order" | "invoice") =>
    run(() => convertQuotationAction({ id, target }), {
      success: (d) => `${target === "order" ? "Sales order" : "Draft invoice"} ${d.number} created`,
      onSuccess: (d) => router.push(target === "order" ? `/sales/orders/${d.id}` : `/sales/invoices/${d.id}/edit`),
      refresh: false,
    });
  const editable = status === "draft" || status === "sent";
  const open = status !== "converted" && status !== "rejected";
  return (
    <>
      <PrintButton />
      {canCreate && editable && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/sales/quotations/${id}/edit`}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </Button>
      )}
      {canCreate && status !== "converted" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              Mark as…
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(status === "draft" || status === "accepted") && (
              <DropdownMenuItem onSelect={() => setStatus("sent", "Marked as sent")}>
                <Send className="size-4" /> Sent to customer
              </DropdownMenuItem>
            )}
            {editable && (
              <DropdownMenuItem onSelect={() => setStatus("accepted", "Marked as accepted")}>
                <CheckCircle2 className="size-4" /> Accepted
              </DropdownMenuItem>
            )}
            {(editable || status === "accepted") && (
              <DropdownMenuItem onSelect={() => setStatus("rejected", "Marked as rejected")}>
                <XCircle className="size-4" /> Rejected
              </DropdownMenuItem>
            )}
            {editable && <DropdownMenuItem onSelect={() => setStatus("expired", "Marked as expired")}>Expired</DropdownMenuItem>}
            {(status === "rejected" || status === "expired" || status === "sent") && (
              <DropdownMenuItem onSelect={() => setStatus("draft", "Reopened as draft")}>Back to draft</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canCreate && status !== "converted" && (
        <ConfirmButton
          variant="outline"
          title={`Delete quotation ${number}?`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => deleteQuotationAction({ id })}
          success="Quotation deleted"
          redirectTo="/sales/quotations"
        >
          <Trash2 className="size-4" />
          Delete
        </ConfirmButton>
      )}
      {canCreate && open && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={pending}>
              <FileOutput className="size-4" />
              Convert
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!hasCustomer} onSelect={() => convert("order")}>
              <ClipboardList className="size-4" /> To sales order{!hasCustomer && " (needs a customer)"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => convert("invoice")}>
              <FileOutput className="size-4" /> To invoice
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

// ---- Order ------------------------------------------------------------------------------------

export function OrderActions({
  id,
  number,
  status,
  perms,
  invoiceDialog,
}: {
  id: string;
  number: string;
  status: string;
  perms: { create: boolean; void: boolean };
  invoiceDialog?: React.ReactNode;
}) {
  return (
    <>
      <PrintButton />
      {status === "draft" && perms.create && (
        <>
          <ConfirmButton
            variant="outline"
            title={`Delete draft order ${number}?`}
            confirmLabel="Delete"
            destructive
            onConfirm={() => deleteOrderAction({ id })}
            success="Order deleted"
            redirectTo="/sales/orders"
          >
            <Trash2 className="size-4" />
            Delete
          </ConfirmButton>
          <Button asChild variant="outline" size="sm">
            <Link href={`/sales/orders/${id}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </Button>
          <ConfirmButton title={`Confirm order ${number}?`} description="Confirmed orders can be invoiced, all at once or in parts." confirmLabel="Confirm order" onConfirm={() => confirmOrderAction({ id })} success="Order confirmed">
            <CheckCircle2 className="size-4" />
            Confirm order
          </ConfirmButton>
        </>
      )}
      {(status === "confirmed" || status === "partial") && (
        <>
          {perms.void && (
            <VoidDialog
              label="Cancel order"
              title={`Cancel order ${number}?`}
              description="Nothing more can be invoiced from it. Invoices already posted stay as they are."
              confirmLabel="Cancel order"
              onConfirm={(reason) => cancelOrderAction({ id, reason })}
              success="Order cancelled"
            />
          )}
          {perms.create && invoiceDialog}
        </>
      )}
    </>
  );
}

// ---- Receipt / Return -------------------------------------------------------------------------

export function ReceiptActions({ id, number, status, canVoid }: { id: string; number: string; status: string; canVoid: boolean }) {
  return (
    <>
      <PrintButton label="Print receipt" />
      {status === "posted" && canVoid && (
        <VoidDialog
          title={`Void receipt ${number}?`}
          description="The money is taken out of the books again and the invoices it paid become open."
          confirmLabel="Void receipt"
          onConfirm={(reason) => voidReceiptAction({ id, reason })}
          success="Receipt voided"
        />
      )}
    </>
  );
}

export function ReturnActions({ id, number, status, perms }: { id: string; number: string; status: string; perms: { post: boolean; void: boolean } }) {
  return (
    <>
      <PrintButton />
      {status === "draft" && perms.void && (
        <ConfirmButton
          variant="outline"
          title={`Delete draft return ${number}?`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => voidReturnAction({ id })}
          success="Draft return deleted"
          redirectTo="/sales/returns"
        >
          <Trash2 className="size-4" />
          Delete
        </ConfirmButton>
      )}
      {status === "draft" && perms.post && (
        <ConfirmButton
          title={`Post return ${number}?`}
          description="Stock comes back into the warehouse and the customer is credited or refunded."
          confirmLabel="Post return"
          onConfirm={() => postReturnAction({ id })}
          success="Return posted"
        >
          <CheckCircle2 className="size-4" />
          Post return
        </ConfirmButton>
      )}
      {status === "posted" && perms.void && (
        <VoidDialog
          title={`Void return ${number}?`}
          description="The returned stock goes back out and the credit or refund is reversed in the books."
          confirmLabel="Void return"
          onConfirm={(reason) => voidReturnAction({ id, reason })}
          success="Return voided"
        />
      )}
    </>
  );
}
