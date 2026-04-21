import type { EmailStatus } from "./email-validation";

const BASE_URL = "https://api.zerobounce.net/v2";
const REQUEST_TIMEOUT_MS = 10_000;

export type ZeroBounceStatus =
  | "valid"
  | "invalid"
  | "catch-all"
  | "unknown"
  | "spamtrap"
  | "abuse"
  | "do_not_mail";

export interface ZeroBounceResult {
  status: ZeroBounceStatus | string;
  sub_status?: string;
  did_you_mean?: string;
}

export interface ZeroBounceError {
  error: string;
}

export function hasZeroBounceKey(): boolean {
  return Boolean(process.env.ZEROBOUNCE_API_KEY);
}

function requireKey(): string {
  const key = process.env.ZEROBOUNCE_API_KEY;
  if (!key) throw new Error("ZEROBOUNCE_API_KEY is not configured");
  return key;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function validateWithZeroBounce(email: string): Promise<ZeroBounceResult> {
  const key = requireKey();
  const url = `${BASE_URL}/validate?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(
    email
  )}&ip_address=`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`ZeroBounce HTTP ${res.status}`);
  }
  const data = (await res.json()) as ZeroBounceResult & Partial<ZeroBounceError>;
  if (data.error) throw new Error(`ZeroBounce: ${data.error}`);
  return {
    status: data.status,
    sub_status: data.sub_status || undefined,
    did_you_mean: data.did_you_mean || undefined,
  };
}

export async function getCreditsRemaining(): Promise<number | null> {
  if (!hasZeroBounceKey()) return null;
  try {
    const key = requireKey();
    const url = `${BASE_URL}/getcredits?api_key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { Credits?: string | number };
    const n = Number(data.Credits);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function mapZeroBounceStatus(zb: ZeroBounceResult): EmailStatus {
  switch (zb.status) {
    case "valid":
      return "verified_deliverable";
    case "invalid":
    case "spamtrap":
    case "abuse":
      return "undeliverable_smtp";
    case "catch-all":
    case "do_not_mail":
    case "unknown":
      return "risky";
    default:
      return "risky";
  }
}
