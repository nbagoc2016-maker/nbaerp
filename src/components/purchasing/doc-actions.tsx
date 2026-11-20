"use client";

// Action bars for purchasing detail pages. The server page decides which actions the user may see.
import Link from "next/link";
import { Ban, CheckCircle2, FileCheck2, HandCoins, PackageCheck, Pencil, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/app/confirm-button";
import {
  approvePurchaseOrderAction,
  cancelPurchaseOrderAction,
  closePurchaseOrderAction,
  deletePurchaseOrderAction,
  markPurchaseOrderSentAction,
} from "@/app/(app)/purchasing/orders/actions";
import { deleteGoodsReceiptAction, postGoodsReceiptAction, voidGoodsReceiptAction } from "@/app/(app)/purchasing/receipts/actions";
import { deleteSupplierBillAction, postSupplierBillAction, voidSupplierBillAction } from "@/app/(app)/purchasing/bills/actions";
import { voidSupplierPaymentAction } from "@/app/(app)/purchasing/payments/actions";
import { deletePurchaseReturnAction, postPurchaseReturnAction, voidPurchaseReturnAction } from "@/app/(app)/purchasing/returns/actions";
import { toggleSupplierActive } from "@/app/(app)/purchasing/suppliers/actions";
import { VoidButton } from "./void-button";

const LinkButton = ({ href, icon: Icon, children, variant = "outline" }: { href: string; icon: typeof Pencil; children: React.ReactNode; variant?: "outline" | "default" }) => (
  <Button asChild size="sm" variant={variant}>
    <Link href={href}>
      <Icon className="size-4" />
      {children}
    </Link>
  </Button>
);

const DeleteDraft = ({ what, number, onConfirm, redirectTo }: { what: string; number: string; onConfirm: () => ReturnType<typeof deletePurchaseOrderAction>; redirectTo: string }) => (
  <ConfirmButton
    variant="outline"
    title={`Delete draft ${what} ${number}?`}
    description="The draft is removed. Nothing was posted, so stock and accounts are not affected."
    confirmLabel="Delete draft"
    destructive={false}
    onConfirm={onConfirm}
    success="Draft deleted"
    redirectTo={redirectTo}
  >
    <Trash2 className="size-4" />
    Delete
  </ConfirmButton>
);

export function SupplierActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  return (
    <ConfirmButton
      variant="outline"
      title={isActive ? "Deactivate this supplier?" : "Reactivate this supplier?"}
      description={isActive ? "They will be hidden from pickers on new documents. History and balances stay." : "They will show in pickers again."}
      confirmLabel={isActive ? "Deactivate" : "Reactivate"}
      onConfirm={() => toggleSupplierActive({ id, isActive: !isActive })}
      success={isActive ? "Supplier deactivated" : "Supplier reactivated"}
    >
      {isActive ? "Deactivate" : "Reactivate"}
    </ConfirmButton>
  );
}

// ---- Purchase order -------------------------------------------------------------------------

export function OrderActions({
  id,
  number,
  status,
  hasToReceive,
  hasToBill,
  perms,
}: {
  id: string;
  number: string;
  status: string;
  hasToReceive: boolean;
  hasToBill: boolean;
  perms: { create: boolean; approve: boolean };
}) {
  const open = ["approved", "sent", "partial"].includes(status);
  return (
    <>
      {status === "draft" && perms.create && (
        <>
          <DeleteDraft what="purchase order" number={number} onConfirm={() => deletePurchaseOrderAction({ id })} redirectTo="/purchasing/orders" />
          <LinkButton href={`/purchasing/orders/${id}/edit`} icon={Pencil}>
            Edit
          </LinkButton>
        </>
      )}
      {["draft", "approved", "sent"].includes(status) && perms.approve && (
        <ConfirmButton
          variant="outline"
          title={`Cancel ${number}?`}
          description="The supplier is no longer expected to deliver. Cancelled orders can't be reopened."
          confirmLabel="Cancel order"
          destructive
          onConfirm={() => cancelPurchaseOrderAction({ id })}
          success="Purchase order cancelled"
        >
          <XCircle className="size-4" />
          Cancel order
        </ConfirmButton>
      )}
      {status === "partial" && perms.approve && (
        <ConfirmButton
          variant="outline"
          title={`Close ${number}?`}
          description="Whatever hasn't arrived yet is no longer expected. Receipts and bills already made stay as they are."
          confirmLabel="Close order"
          onConfirm={() => closePurchaseOrderAction({ id })}
          success="Purchase order closed"
        >
          <Ban className="size-4" />
          Close
        </ConfirmButton>
      )}
      {status === "approved" && (perms.create || perms.approve) && (
        <ConfirmButton
          variant="outline"
          title={`Mark ${number} as sent?`}
          description="Records that the order has gone to the supplier."
          confirmLabel="Mark as sent"
          onConfirm={() => markPurchaseOrderSentAction({ id })}
          success="Marked as sent"
        >
          <Send className="size-4" />
          Mark as sent
        </ConfirmButton>
      )}
      {status === "draft" && perms.approve && (
        <ConfirmButton
          title={`Approve ${number}?`}
          description="Approved orders can be sent to the supplier and received against. They can no longer be edited."
          confirmLabel="Approve"
          onConfirm={() => approvePurchaseOrderAction({ id })}
          success="Purchase order approved"
        >
          <CheckCircle2 className="size-4" />
          Approve
        </ConfirmButton>
      )}
      {status !== "draft" && status !== "cancelled" && hasToBill && perms.create && (
        <LinkButton href={`/purchasing/bills/new?po=${id}`} icon={FileCheck2}>
          Create bill
        </LinkButton>
      )}
      {open && hasToReceive && perms.create && (
        <LinkButton href={`/purchasing/receipts/new?po=${id}`} icon={PackageCheck} variant="default">
          Receive goods
        </LinkButton>
      )}
    </>
  );
}

// ---- Goods receipt --------------------------------------------------------------------------

export function ReceiptActions({
  id,
  number,
  status,
  billStatus,
  perms,
}: {
  id: string;
  number: string;
  status: string;
  billStatus: string;
  perms: { create: boolean; post: boolean; void: boolean };
}) {
  return (
    <>
      {status === "draft" && perms.create && (
        <>
          <DeleteDraft what="goods receipt" number={number} onConfirm={() => deleteGoodsReceiptAction({ id })} redirectTo="/purchasing/receipts" />
          <LinkButton href={`/purchasing/receipts/${id}/edit`} icon={Pencil}>
            Edit
          </LinkButton>
        </>
      )}
      {status === "draft" && perms.post && (
        <ConfirmButton
          title={`Post ${number}?`}
          description="Stock is added to the warehouse (with any rolls), Inventory is debited and Goods Received Not Invoiced credited. Posted receipts can only be voided."
          confirmLabel="Post receipt"
          onConfirm={() => postGoodsReceiptAction({ id })}
          success="Goods receipt posted"
        >
          <CheckCircle2 className="size-4" />
          Post receipt
        </ConfirmButton>
      )}
      {status === "posted" && billStatus === "unbilled" && perms.void && (
        <VoidButton
          title={`Void ${number}?`}
          description="The stock comes out again, the journal is voided and the purchase order goes back to awaiting these goods."
          onVoid={(reason) => voidGoodsReceiptAction({ id, reason })}
        />
      )}
      {status === "posted" && billStatus !== "billed" && perms.create && (
        <LinkButton href={`/purchasing/bills/new?grn=${id}`} icon={FileCheck2} variant="default">
          Create bill
        </LinkButton>
      )}
    </>
  );
}

// ---- Supplier bill --------------------------------------------------------------------------

export function BillActions({
  id,
  number,
  status,
  paymentStatus,
  supplierId,
  canVoid,
  perms,
}: {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  supplierId: string;
  canVoid: boolean;
  perms: { create: boolean; post: boolean; void: boolean; payments: boolean };
}) {
  return (
    <>
      {status === "draft" && perms.create && (
        <>
          <DeleteDraft what="bill" number={number} onConfirm={() => deleteSupplierBillAction({ id })} redirectTo="/purchasing/bills" />
          <LinkButton href={`/purchasing/bills/${id}/edit`} icon={Pencil}>
            Edit
          </LinkButton>
        </>
      )}
      {status === "draft" && perms.post && (
        <ConfirmButton
          title={`Post ${number}?`}
          description="The amount is added to what you owe the supplier. Receipt lines clear Goods Received Not Invoiced; stock lines on a direct bill are received into the warehouse."
          confirmLabel="Post bill"
          onConfirm={() => postSupplierBillAction({ id })}
          success="Bill posted"
        >
          <CheckCircle2 className="size-4" />
          Post bill
        </ConfirmButton>
      )}
      {status === "posted" && perms.void && (
        <VoidButton
          title={`Void ${number}?`}
          disabled={!canVoid}
          description={
            canVoid
              ? "The payable and journal are reversed, stock received with the bill comes out, and receipts become unbilled again."
              : "Void its payments and returns first."
          }
          onVoid={(reason) => voidSupplierBillAction({ id, reason })}
        />
      )}
      {status === "posted" && perms.create && (
        <LinkButton href={`/purchasing/returns/new?bill=${id}`} icon={Undo2}>
          Return goods
        </LinkButton>
      )}
      {status === "posted" && paymentStatus !== "paid" && perms.payments && (
        <LinkButton href={`/purchasing/payments/new?supplier=${supplierId}&bill=${id}`} icon={HandCoins} variant="default">
          Record payment
        </LinkButton>
      )}
    </>
  );
}

// ---- Payment --------------------------------------------------------------------------------

export function PaymentActions({ id, number, status, canVoid }: { id: string; number: string; status: string; canVoid: boolean }) {
  if (status !== "posted" || !canVoid) return null;
  return (
    <VoidButton
      title={`Void ${number}?`}
      description="The journal is voided, the money goes back to the account it was paid from and the allocated bills become unpaid again."
      onVoid={(reason) => voidSupplierPaymentAction({ id, reason })}
    />
  );
}

// ---- Purchase return ------------------------------------------------------------------------

export function ReturnActions({ id, number, status, perms }: { id: string; number: string; status: string; perms: { create: boolean; post: boolean; void: boolean } }) {
  return (
    <>
      {status === "draft" && perms.create && (
        <>
          <DeleteDraft what="return" number={number} onConfirm={() => deletePurchaseReturnAction({ id })} redirectTo="/purchasing/returns" />
          <LinkButton href={`/purchasing/returns/${id}/edit`} icon={Pencil}>
            Edit
          </LinkButton>
        </>
      )}
      {status === "draft" && perms.post && (
        <ConfirmButton
          title={`Post ${number}?`}
          description="The goods leave stock and the supplier's payable is reduced by the bill value of what is returned."
          confirmLabel="Post return"
          onConfirm={() => postPurchaseReturnAction({ id })}
          success="Return posted"
        >
          <CheckCircle2 className="size-4" />
          Post return
        </ConfirmButton>
      )}
      {status === "posted" && perms.void && (
        <VoidButton
          title={`Void ${number}?`}
          description="The goods come back into stock and the payable goes back up."
          onVoid={(reason) => voidPurchaseReturnAction({ id, reason })}
        />
      )}
    </>
  );
}
