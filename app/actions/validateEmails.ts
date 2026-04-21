"use server";

import { z } from "zod";
import {
  validateEmails as runValidation,
  summarize,
  type EmailValidationResult,
} from "@/lib/email-validation";

const InputSchema = z.object({
  emails: z
    .array(z.string().min(1).max(320))
    .min(1, "Au moins une adresse est requise")
    .max(10_000, "Limite de 10 000 adresses par lot"),
});

export interface ValidateEmailsResponse {
  ok: boolean;
  error?: string;
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

  const { emails } = parsed.data;

  const results = await runValidation(emails);
  const summary = summarize(results);

  return { ok: true, results, summary };
}
