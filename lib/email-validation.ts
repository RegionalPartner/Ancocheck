import { promises as dns } from "node:dns";

export type EmailStatus =
  | "valid"
  | "invalid_syntax"
  | "disposable"
  | "role_based"
  | "no_mx"
  | "duplicate"
  | "verified_deliverable"
  | "risky"
  | "undeliverable_smtp";

export interface EmailValidationResult {
  email: string;
  normalized: string;
  status: EmailStatus;
  reason?: string;
  mxFound?: boolean;
  didYouMean?: string;
}

// RFC 5322-ish practical regex — avoids catastrophic backtracking.
const EMAIL_REGEX =
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,63}$/;

const ROLE_PREFIXES = new Set([
  "admin",
  "administrator",
  "contact",
  "hello",
  "info",
  "mail",
  "noreply",
  "no-reply",
  "office",
  "postmaster",
  "sales",
  "support",
  "team",
  "webmaster",
]);

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "dispostable.com",
  "getnada.com",
  "guerrillamail.com",
  "mailinator.com",
  "maildrop.cc",
  "sharklasers.com",
  "tempmail.com",
  "temp-mail.org",
  "trashmail.com",
  "yopmail.com",
]);

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

export function isSyntaxValid(email: string): boolean {
  if (email.length > 254) return false;
  return EMAIL_REGEX.test(email);
}

export function isDisposable(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain);
}

export function isRoleBased(local: string): boolean {
  return ROLE_PREFIXES.has(local);
}

const mxCache = new Map<string, boolean>();

export async function hasMxRecord(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;

  try {
    const records = await dns.resolveMx(domain);
    const ok = Array.isArray(records) && records.length > 0;
    mxCache.set(domain, ok);
    return ok;
  } catch {
    try {
      const a = await dns.resolve4(domain);
      const ok = Array.isArray(a) && a.length > 0;
      mxCache.set(domain, ok);
      return ok;
    } catch {
      mxCache.set(domain, false);
      return false;
    }
  }
}

export async function validateEmail(raw: string): Promise<EmailValidationResult> {
  const normalized = normalizeEmail(raw);

  if (!isSyntaxValid(normalized)) {
    return {
      email: raw,
      normalized,
      status: "invalid_syntax",
      reason: "Adresse email syntaxiquement invalide",
    };
  }

  const parts = splitEmail(normalized);
  if (!parts) {
    return {
      email: raw,
      normalized,
      status: "invalid_syntax",
      reason: "Format local@domain invalide",
    };
  }

  if (isDisposable(parts.domain)) {
    return {
      email: raw,
      normalized,
      status: "disposable",
      reason: `Domaine jetable: ${parts.domain}`,
    };
  }

  if (isRoleBased(parts.local)) {
    return {
      email: raw,
      normalized,
      status: "role_based",
      reason: `Adresse générique: ${parts.local}@`,
    };
  }

  const mxOk = await hasMxRecord(parts.domain);
  if (!mxOk) {
    return {
      email: raw,
      normalized,
      status: "no_mx",
      reason: `Aucun enregistrement MX pour ${parts.domain}`,
      mxFound: false,
    };
  }

  return {
    email: raw,
    normalized,
    status: "valid",
    mxFound: true,
  };
}

export async function validateEmails(
  rawList: string[]
): Promise<EmailValidationResult[]> {
  const seen = new Set<string>();
  const results: EmailValidationResult[] = [];

  const deduped: { raw: string; normalized: string }[] = [];
  for (const raw of rawList) {
    const normalized = normalizeEmail(raw);
    if (!normalized) continue;

    if (seen.has(normalized)) {
      results.push({
        email: raw,
        normalized,
        status: "duplicate",
        reason: "Adresse dupliquée dans la liste",
      });
      continue;
    }
    seen.add(normalized);
    deduped.push({ raw, normalized });
  }

  const validated = await Promise.all(
    deduped.map((item) => validateEmail(item.raw))
  );

  return [...results, ...validated];
}

export function summarize(results: EmailValidationResult[]) {
  const total = results.length;
  const counts: Record<EmailStatus, number> = {
    valid: 0,
    invalid_syntax: 0,
    disposable: 0,
    role_based: 0,
    no_mx: 0,
    duplicate: 0,
    verified_deliverable: 0,
    risky: 0,
    undeliverable_smtp: 0,
  };
  for (const r of results) counts[r.status]++;
  return { total, ...counts };
}
