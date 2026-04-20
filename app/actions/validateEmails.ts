"use server";

import { z } from "zod";
import {
  validateEmails as runValidation,
  summarize,
  type EmailValidationResult,
} from "@/lib/email-validation";
import { createAdminClient } from "@/lib/supabase/admin";

const InputSchema = z.object({
  emails: z
    .array(z.string().min(1).max(320))
    .min(1, "Au moins une adresse est requise")
    .max(10_000, "Limite de 10 000 adresses par lot"),
  campaignLabel: z.string().max(200).optional(),
});

export interface ValidateEmailsResponse {
  ok: boolean;
  error?: string;
  runId?: string;
  results?: EmailValidationResult[];
  summary?: ReturnType<typeof summarize>;
}

export async function validateEmailsAction(
  input: z.infer<typeof InputSchema>
): Promise<ValidateEmailsResponse> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const { emails, campaignLabel } = parsed.data;

  const results = await runValidation(emails);
  const summary = summarize(results);

  let runId: string | undefined;
  try {
    const supabase = createAdminClient();
    const { data: run, error: runErr } = await supabase
      .from("email_validation_runs")
      .insert({
        campaign_label: campaignLabel ?? null,
        total: summary.total,
        valid_count: summary.valid,
        invalid_syntax_count: summary.invalid_syntax,
        disposable_count: summary.disposable,
        role_based_count: summary.role_based,
        no_mx_count: summary.no_mx,
        duplicate_count: summary.duplicate,
      })
      .select("id")
      .single();

    if (runErr) throw runErr;
    runId = run.id as string;

    const rows = results.map((r) => ({
      run_id: runId,
      email: r.email,
      normalized: r.normalized,
      status: r.status,
      reason: r.reason ?? null,
      mx_found: r.mxFound ?? null,
    }));

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from("email_validations").insert(chunk);
      if (error) throw error;
    }
  } catch (e) {
    return {
      ok: false,
      error: `Validation effectuée mais enregistrement Supabase échoué: ${
        e instanceof Error ? e.message : String(e)
      }`,
      results,
      summary,
    };
  }

  return { ok: true, runId, results, summary };
}
