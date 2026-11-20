import { redirect } from "next/navigation";

// /sales has no screen of its own; the invoice list is the natural landing page.
export default function SalesIndex() {
  redirect("/sales/invoices");
}
