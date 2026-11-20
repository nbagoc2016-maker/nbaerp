"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import {
  deleteDepartmentAction,
  deleteLeaveTypeAction,
  saveDepartmentAction,
  saveLeaveTypeAction,
} from "@/app/(app)/hr/employees/actions";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatQty } from "@/lib/format";

type Dept = { id: string; name: string; employees: number };
type LeaveType = { id: string; name: string; daysPerYear: number; isPaid: boolean };

function DepartmentRow({ d }: { d: Dept }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const { run, pending } = useAction();
  return (
    <li className="flex items-center gap-2 py-2">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveDepartmentAction({ id: d.id, name }), { success: "Department renamed", onSuccess: () => setEditing(false) });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" autoFocus />
          <Button size="icon-sm" type="submit" disabled={pending} aria-label="Save">
            <Check />
          </Button>
          <Button size="icon-sm" variant="ghost" type="button" onClick={() => setEditing(false)} aria-label="Cancel">
            <X />
          </Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{d.name}</p>
            <p className="text-xs text-muted-foreground">
              {d.employees} employee{d.employees === 1 ? "" : "s"}
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Rename ${d.name}`}>
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            aria-label={`Delete ${d.name}`}
            onClick={() => {
              if (d.employees === 0 || window.confirm(`${d.employees} employee(s) will be left without a department. Delete "${d.name}"?`)) {
                run(() => deleteDepartmentAction({ id: d.id }), { success: "Department deleted" });
              }
            }}
          >
            <Trash2 />
          </Button>
        </>
      )}
    </li>
  );
}

function LeaveTypeRow({ t }: { t: LeaveType }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ name: t.name, daysPerYear: String(t.daysPerYear), isPaid: t.isPaid });
  const { run, pending } = useAction();
  if (editing) {
    return (
      <li className="py-2">
        <LeaveTypeEditor
          value={v}
          onChange={setV}
          pending={pending}
          onCancel={() => setEditing(false)}
          onSave={() => run(() => saveLeaveTypeAction({ id: t.id, ...v }), { success: "Leave type saved", onSuccess: () => setEditing(false) })}
        />
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{t.name}</p>
        <p className="text-xs text-muted-foreground">
          {t.daysPerYear > 0 ? `${formatQty(t.daysPerYear)} days a year` : "No yearly limit"} · {t.isPaid ? "Paid" : "Unpaid (deducted in payroll)"}
        </p>
      </div>
      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${t.name}`}>
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        aria-label={`Delete ${t.name}`}
        onClick={() => window.confirm(`Delete "${t.name}"?`) && run(() => deleteLeaveTypeAction({ id: t.id }), { success: "Leave type deleted" })}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

type LeaveDraft = { name: string; daysPerYear: string; isPaid: boolean };

function LeaveTypeEditor({
  value,
  onChange,
  onSave,
  onCancel,
  pending,
}: {
  value: LeaveDraft;
  onChange: (v: LeaveDraft) => void;
  onSave: () => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Leave type name, e.g. Casual Leave" className="h-8" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Days / year
          <Input
            value={value.daysPerYear}
            onChange={(e) => onChange({ ...value, daysPerYear: e.target.value })}
            type="number"
            min={0}
            className="tabular h-8 w-20 text-right"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={value.isPaid} onCheckedChange={(c) => onChange({ ...value, isPaid: c })} />
          Paid leave
        </label>
        <div className="ml-auto flex gap-1">
          {onCancel && (
            <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="sm" type="submit" disabled={pending || !value.name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

/** "HR setup" side sheet: manage departments and leave types without leaving the page. */
export function HrSetupSheet({ departments, leaveTypes, defaultTab = "departments" }: { departments: Dept[]; leaveTypes: LeaveType[]; defaultTab?: "departments" | "leave" }) {
  const [deptName, setDeptName] = useState("");
  const [draft, setDraft] = useState<LeaveDraft>({ name: "", daysPerYear: "0", isPaid: true });
  const { run, pending } = useAction();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="size-4" />
          Departments & leave types
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>HR setup</SheetTitle>
          <SheetDescription>Departments group your staff; leave types set yearly entitlements and whether leave is paid.</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue={defaultTab} className="px-4 pb-6">
          <TabsList className="w-full">
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="leave">Leave types</TabsTrigger>
          </TabsList>
          <TabsContent value="departments" className="space-y-3 pt-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveDepartmentAction({ name: deptName }), { success: "Department added", onSuccess: () => setDeptName("") });
              }}
            >
              <Input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="New department" className="h-9" />
              <Button type="submit" size="sm" className="h-9" disabled={pending || !deptName.trim()}>
                <Plus className="size-4" />
                Add
              </Button>
            </form>
            {departments.length ? (
              <ul className="divide-y">
                {departments.map((d) => (
                  <DepartmentRow key={d.id} d={d} />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No departments yet.</p>
            )}
          </TabsContent>
          <TabsContent value="leave" className="space-y-3 pt-2">
            <LeaveTypeEditor
              value={draft}
              onChange={setDraft}
              pending={pending}
              onSave={() =>
                run(() => saveLeaveTypeAction(draft), { success: "Leave type added", onSuccess: () => setDraft({ name: "", daysPerYear: "0", isPaid: true }) })
              }
            />
            {leaveTypes.length ? (
              <ul className="divide-y">
                {leaveTypes.map((t) => (
                  <LeaveTypeRow key={t.id} t={t} />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No leave types yet.</p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
