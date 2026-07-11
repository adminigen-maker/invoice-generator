import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency = process.env.NEXT_PUBLIC_COMPANY_CURRENCY ?? "AED",
  locale = "en-AE"
): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(d: string | Date | null | undefined, locale = "en-AE"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

/** Sum a numeric column safely. */
export function sum<T>(rows: T[], pick: (r: T) => number | string | null | undefined): number {
  return rows.reduce((acc, r) => acc + Number(pick(r) ?? 0), 0);
}
