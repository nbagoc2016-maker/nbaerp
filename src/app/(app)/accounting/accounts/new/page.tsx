import { redirect } from "next/navigation";

export default function NewAccountPage() {
  redirect("/accounting/accounts?new=1");
}
