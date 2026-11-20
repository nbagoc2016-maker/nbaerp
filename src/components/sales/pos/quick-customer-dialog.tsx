"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { quickAddCustomer } from "@/app/(app)/sales/customers/actions";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "../common";

export interface NewCustomer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  priceLevel: "retail" | "wholesale";
}

export function QuickCustomerDialog({
  open,
  onOpenChange,
  initialName = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialName?: string;
  onCreated: (c: NewCustomer) => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState<"retail" | "wholesale" | "corporate">("retail");
  const { run, pending, fieldErrors } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const priceLevel = type === "wholesale" ? "wholesale" : "retail";
    run(() => quickAddCustomer({ name, phone, city, type, priceLevel }), {
      success: (d) => `Added ${d.name}`,
      refresh: false,
      onSuccess: (d) => {
        onCreated({ id: d.id, code: d.code, name: d.name, phone: phone || null, priceLevel });
        setName("");
        setPhone("");
        setCity("");
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              Add customer
            </DialogTitle>
            <DialogDescription>Save the customer to put this sale on their account. Add more details later from Customers.</DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="qc-name" required error={fieldErrors.name}>
            <Input id="qc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="qc-phone">
              <Input id="qc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" />
            </Field>
            <Field label="City" htmlFor="qc-city">
              <Input id="qc-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
          </div>
          <Field label="Type">
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="wholesale">Wholesale (wholesale prices)</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Add & select
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
