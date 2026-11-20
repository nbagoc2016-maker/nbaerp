// Document maths shared by the line editor (client) and the services (server).
// The server always recomputes with this; client totals are never trusted.
import { round2 } from "./format";

export interface CalcLineInput {
  qty: number;
  price: number; // unit sale price or unit cost
  discountPct?: number;
  taxRate?: number; // percent
}

export interface CalcLine extends Required<CalcLineInput> {
  gross: number; // qty * price
  discountAmount: number;
  net: number; // after line discount, before tax
  taxAmount: number;
  lineTotal: number; // net + tax
}

export interface CalcTotals {
  lines: CalcLine[];
  subtotal: number; // sum of gross
  lineDiscounts: number;
  documentDiscount: number;
  discountTotal: number;
  taxTotal: number;
  charges: number; // shipping / freight
  roundOff: number;
  total: number;
  netBeforeTax: number; // revenue / cost after all discounts, excluding tax and charges
}

export function calcLine(input: CalcLineInput): CalcLine {
  const qty = Number(input.qty) || 0;
  const price = Number(input.price) || 0;
  const discountPct = Math.min(Math.max(Number(input.discountPct) || 0, 0), 100);
  const taxRate = Math.max(Number(input.taxRate) || 0, 0);
  const gross = round2(qty * price);
  const discountAmount = round2((gross * discountPct) / 100);
  const net = round2(gross - discountAmount);
  const taxAmount = round2((net * taxRate) / 100);
  return { qty, price, discountPct, taxRate, gross, discountAmount, net, taxAmount, lineTotal: round2(net + taxAmount) };
}

/**
 * Document discount is spread across lines in proportion to their net value, and tax is charged
 * on the discounted amount, so tax stays correct when a whole-bill discount is given.
 */
export function calcDocument(
  inputs: CalcLineInput[],
  opts: { documentDiscount?: number; charges?: number; roundToWhole?: boolean } = {}
): CalcTotals {
  const base = inputs.map(calcLine);
  const netSum = base.reduce((s, l) => s + l.net, 0);
  const documentDiscount = round2(Math.min(Math.max(opts.documentDiscount ?? 0, 0), netSum));

  let allocated = 0;
  const lines = base.map((l, i) => {
    if (!documentDiscount || !netSum) return l;
    const share = i === base.length - 1 ? round2(documentDiscount - allocated) : round2((documentDiscount * l.net) / netSum);
    allocated = round2(allocated + share);
    const net = round2(l.net - share);
    const taxAmount = round2((net * l.taxRate) / 100);
    return { ...l, net, taxAmount, lineTotal: round2(net + taxAmount) };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const lineDiscounts = round2(base.reduce((s, l) => s + l.discountAmount, 0));
  const taxTotal = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const netBeforeTax = round2(lines.reduce((s, l) => s + l.net, 0));
  const charges = round2(Math.max(opts.charges ?? 0, 0));
  const exact = round2(netBeforeTax + taxTotal + charges);
  const total = opts.roundToWhole ? Math.round(exact) : exact;

  return {
    lines,
    subtotal,
    lineDiscounts,
    documentDiscount,
    discountTotal: round2(lineDiscounts + documentDiscount),
    taxTotal,
    charges,
    roundOff: round2(total - exact),
    total,
    netBeforeTax,
  };
}
