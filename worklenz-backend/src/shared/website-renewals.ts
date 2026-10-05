const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const WEBSITE_STATUSES = ["active", "suspended", "expired", "archived"] as const;
export const MANAGED_BY = ["us", "client"] as const;
export const RENEWAL_ITEMS = ["domain", "hosting"] as const;

export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];
export type ManagedBy = (typeof MANAGED_BY)[number];
export type RenewalItem = (typeof RENEWAL_ITEMS)[number];

export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0];
  value = value.replace(/:\d+$/, "");
  value = value.replace(/\.$/, "");
  if (value.startsWith("www.")) value = value.slice(4);
  if (!HOSTNAME.test(value)) return null;
  return value;
}

export function parseOptionalEmail(input: unknown): string | null | undefined {
  if (input == null || input === "") return null;
  if (typeof input !== "string") return undefined;
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (!EMAIL.test(value) || value.length > 254) return undefined;
  return value;
}

export function parseOptionalDate(input: unknown): string | null | undefined {
  if (input == null || input === "") return null;
  if (typeof input !== "string" || !DATE.test(input)) return undefined;
  const [year, month, day] = input.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return input;
}

export function parseManagedBy(input: unknown): ManagedBy | undefined {
  if (input === "us" || input === "client") return input;
  return undefined;
}

export function parseStatus(input: unknown): WebsiteStatus | undefined {
  if (typeof input !== "string") return undefined;
  return (WEBSITE_STATUSES as readonly string[]).includes(input)
    ? (input as WebsiteStatus)
    : undefined;
}

export function daysBefore(expiryDate: string, today: string): number {
  const expiry = Date.parse(`${expiryDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  return Math.round((expiry - current) / 86400000);
}

export function nearerExpiry(domainExpiry: string | null, hostingExpiry: string | null): string | null {
  if (!domainExpiry) return hostingExpiry;
  if (!hostingExpiry) return domainExpiry;
  return domainExpiry <= hostingExpiry ? domainExpiry : hostingExpiry;
}

export function parseIntervals(input: unknown): number[] | undefined {
  if (!Array.isArray(input) || input.length === 0 || input.length > 12) return undefined;
  const days = input.map(value => Number(value));
  if (days.some(value => !Number.isInteger(value) || value < 0 || value > 365)) return undefined;
  return Array.from(new Set(days)).sort((a, b) => b - a);
}

export function daysRemainingColor(days: number | null): "error" | "warning" | "gold" | "success" | null {
  if (days == null || Number.isNaN(days)) return null;
  if (days < 7) return "error";
  if (days < 30) return "warning";
  if (days < 60) return "gold";
  return "success";
}
