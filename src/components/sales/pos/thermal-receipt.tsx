import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { METHOD_LABEL } from "../common";

export interface ThermalReceiptData {
  company: { name: string; address?: string | null; city?: string | null; phone?: string | null; taxNumber?: string | null; invoiceFooter?: string | null };
  number: string;
  at: Date | string;
  cashier: string;
  customerName: string;
  customerPhone?: string | null;
  warehouse?: string | null;
  lines: { name: string; sku?: string; qty: number; unit: string; price: number; discountPct: number; amount: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: { method: string; amount: number; reference?: string | null }[];
  tendered: number;
  change: number;
  balanceDue: number;
}

const m = (n: number) => formatMoney(n, { fixed: true });

/**
 * 80 mm thermal-style receipt. When printed, only this element is shown (see the print styles),
 * on a narrow page with black text so it works on receipt printers.
 */
export function ThermalReceipt({ data }: { data: ThermalReceiptData }) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 3mm; }
          body * { visibility: hidden !important; }
          #pos-receipt, #pos-receipt * { visibility: visible !important; }
          [data-slot="dialog-content"] { position: absolute !important; inset: 0 auto auto 0 !important; transform: none !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; max-width: none !important; }
          #pos-receipt { position: absolute; left: 0; top: 0; width: 74mm; margin: 0; padding: 0; border: 0 !important; box-shadow: none !important; background: #fff !important; color: #000 !important; }
          #pos-receipt * { color: #000 !important; border-color: #000 !important; }
        }
      `}</style>
      <div
        id="pos-receipt"
        className="mx-auto w-full max-w-[302px] rounded-md border bg-card px-4 py-5 font-mono text-[11.5px] leading-snug text-card-foreground shadow-sm"
      >
        <div className="text-center">
          <p className="text-[15px] font-bold uppercase tracking-wide">{data.company.name}</p>
          {data.company.address && (
            <p>
              {data.company.address}
              {data.company.city ? `, ${data.company.city}` : ""}
            </p>
          )}
          {data.company.phone && <p>Tel {data.company.phone}</p>}
          {data.company.taxNumber && <p>NTN {data.company.taxNumber}</p>}
        </div>
        <Rule />
        <div className="space-y-0.5">
          <Row label="Receipt" value={data.number} bold />
          <Row label="Date" value={formatDateTime(data.at)} />
          <Row label="Cashier" value={data.cashier} />
          <Row label="Customer" value={data.customerName} />
          {data.customerPhone && <Row label="Phone" value={data.customerPhone} />}
        </div>
        <Rule />
        <div className="space-y-1.5">
          {data.lines.map((l, i) => (
            <div key={i}>
              <p className="font-semibold">{l.name}</p>
              <div className="flex justify-between gap-2">
                <span>
                  {formatQty(l.qty)} {l.unit} x {formatMoney(l.price, { symbol: "" }).trim()}
                  {l.discountPct > 0 && ` -${l.discountPct}%`}
                </span>
                <span className="tabular">{formatMoney(l.amount, { symbol: "", fixed: true }).trim()}</span>
              </div>
            </div>
          ))}
        </div>
        <Rule />
        <div className="space-y-0.5">
          <Row label={`Items (${data.lines.length})`} value={m(data.subtotal)} />
          {data.discount > 0 && <Row label="Discount" value={`-${m(data.discount)}`} />}
          {data.tax > 0 && <Row label="Sales tax" value={m(data.tax)} />}
          <div className="flex justify-between pt-1 text-[15px] font-bold">
            <span>TOTAL</span>
            <span className="tabular">{m(data.total)}</span>
          </div>
        </div>
        <Rule />
        <div className="space-y-0.5">
          {data.payments.map((p, i) => (
            <Row key={i} label={`${METHOD_LABEL[p.method] ?? p.method}${p.reference ? ` (${p.reference})` : ""}`} value={m(p.method === "cash" ? data.tendered : p.amount)} />
          ))}
          {data.change > 0 && <Row label="Change" value={m(data.change)} bold />}
          {data.balanceDue > 0 && <Row label="On account" value={m(data.balanceDue)} bold />}
        </div>
        <Rule />
        <p className="text-center">{data.company.invoiceFooter || "Thank you for shopping with us!"}</p>
        <p className="mt-2 text-center text-[10px] opacity-70">Powered by Shusui · LabridTech</p>
      </div>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className={bold ? "flex justify-between gap-2 font-bold" : "flex justify-between gap-2"}>
      <span className="truncate">{label}</span>
      <span className="shrink-0 tabular text-right">{value}</span>
    </div>
  );
}

function Rule() {
  return <div className="my-2 border-t border-dashed border-foreground/40" />;
}
