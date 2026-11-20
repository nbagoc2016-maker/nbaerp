import { redirect } from "next/navigation";

// The purchase orders list doubles as the purchasing hub
export default function PurchasingPage() {
  redirect("/purchasing/orders");
}
