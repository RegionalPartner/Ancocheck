"use server";

import { z } from "zod";
import {
  validateEmails as runValidation,
  summarize,
  type EmailStatus,
  type EmailValidationResult,
} from "@/lib/email-validation";
import {
  getCreditsRemaining,
  hasZeroBounceKey,
  mapZeroBounceStatus,
  validateWithZeroBounce,
} from "@/lib/zerobounce";

const MAX_EMAILS_PER_REQUEST = 2000;

const EmailsSchema = z
  .array(z.string().min(1).max(320))
  .min(1, "Au moins une adresse est requise")
  .max(
    MAX_EMAILS_PER_REQUEST,
    `Limite de ${MAX_EMAILS_PER_REQUEST} adresses par appel — découpez le lot côté client`
  );

export interface Step1Response {
  ok: boolean;
  error?: string;
  results?: EmailValidationResult[];
  summary?: ReturnType<typeof summarize>;
}

export interface Step2Update {
  normalized: string;
  status: EmailStatus;
  reason?: string;
  didYouMean?: string;
}

export interface Step2Response {
  ok: boolean;
  error?: string;
  updates?: Step2Update[];
  creditsConsumed?: number;
  creditsRemaining?: number | null;
}

export async function runStep1(emails: string[]): Promise<Step1Response> {
  const parsed = EmailsSchema.safeParse(emails);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const results = await runValidation(parsed.data);
  return { ok: true, results, summary: summarize(results) };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runStep2(validEmails: string[]): Promise<Step2Response> {
  if (!hasZeroBounceKey()) {
    return {
      ok: false,
      error:
        "ZEROBOUNCE_API_KEY n'est pas configurée sur le serveur. Ajoutez-la dans les variables d'environnement Vercel.",
    };
  }

  const parsed = EmailsSchema.safeParse(validEmails);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  let creditsConsumed = 0;
  const updates = await runWithConcurrency(parsed.data, 5, async (email) => {
    try {
      const zb = await validateWithZeroBounce(email);
      creditsConsumed++;
      return {
        normalized: email,
        status: mapZeroBounceStatus(zb),
        reason: zb.sub_status ? `${zb.status} / ${zb.sub_status}` : zb.status,
        didYouMean: zb.did_you_mean,
      } satisfies Step2Update;
    } catch (e) {
      return {
        normalized: email,
        status: "risky" as const,
        reason: `ZeroBounce injoignable: ${e instanceof Error ? e.message : String(e)}`,
      } satisfies Step2Update;
    }
  });

  const creditsRemaining = await getCreditsRemaining();
  return { ok: true, updates, creditsConsumed, creditsRemaining };
}
