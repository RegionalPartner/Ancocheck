"use server";

import { z } from "zod";
import {
  validateEmails as runValidation,
  summarize,
  type EmailValidationResult,
} from "@/lib/email-validation";
import {
  getCreditsRemaining,
  hasZeroBounceKey,
  mapZeroBounceStatus,
  validateWithZeroBounce,
} from "@/lib/zerobounce";

const InputSchema = z.object({
  emails: z
    .array(z.string().min(1).max(320))
    .min(1, "Au moins une adresse est requise")
    .max(10_000, "Limite de 10 000 adresses par lot"),
});

export interface ValidateEmailsResponse {
  ok: boolean;
  error?: string;
  mode?: "pass1" | "pass2";
  results?: EmailValidationResult[];
  summary?: ReturnType<typeof summarize>;
  creditsConsumed?: number;
  creditsRemaining?: number | null;
}

export async function validateEmailsAction(
  input: z.infer<typeof InputSchema>
): Promise<ValidateEmailsResponse> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const results = await runValidation(parsed.data.emails);
  const summary = summarize(results);
  return { ok: true, mode: "pass1", results, summary };
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

export async function validateEmailsDeepAction(
  input: z.infer<typeof InputSchema>
): Promise<ValidateEmailsResponse> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  if (!hasZeroBounceKey()) {
    return {
      ok: false,
      error:
        "ZEROBOUNCE_API_KEY n'est pas configurée sur le serveur. Ajoutez-la dans les variables d'environnement Vercel.",
    };
  }

  const pass1 = await runValidation(parsed.data.emails);

  const candidateIndexes: number[] = [];
  pass1.forEach((r, i) => {
    if (r.status === "valid") candidateIndexes.push(i);
  });

  let creditsConsumed = 0;

  await runWithConcurrency(candidateIndexes, 5, async (idx) => {
    const r = pass1[idx];
    try {
      const zb = await validateWithZeroBounce(r.normalized);
      creditsConsumed++;
      const mapped = mapZeroBounceStatus(zb);
      pass1[idx] = {
        ...r,
        status: mapped,
        reason: zb.sub_status ? `${zb.status} / ${zb.sub_status}` : zb.status,
        didYouMean: zb.did_you_mean,
      };
    } catch (e) {
      pass1[idx] = {
        ...r,
        status: "risky",
        reason: `ZeroBounce injoignable: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  });

  const creditsRemaining = await getCreditsRemaining();
  const summary = summarize(pass1);

  return {
    ok: true,
    mode: "pass2",
    results: pass1,
    summary,
    creditsConsumed,
    creditsRemaining,
  };
}
