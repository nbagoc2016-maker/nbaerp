/** "sales_invoice" → "Sales invoice". Shared by server pages and client tables. */
export const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
