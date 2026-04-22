"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  runStep1,
  runStep2,
  type Step1Response,
  type Step2Response,
  type Step2Update,
} from "@/app/actions/validateEmails";
import type {
  EmailStatus,
  EmailValidationResult,
} from "@/lib/email-validation";

const CHUNK_SIZE_STEP1 = 2000;
const CHUNK_SIZE_STEP2 = 100;
const STEP2_CONFIRM_THRESHOLD = 50;

const STATUS_KEYS: EmailStatus[] = [
  "valid",
  "invalid_syntax",
  "disposable",
  "role_based",
  "no_mx",
  "duplicate",
  "verified_deliverable",
  "risky",
  "undeliverable_smtp",
  "error",
];

const STATUS_LABELS: Record<EmailStatus, string> = {
  valid: "Valide",
  invalid_syntax: "Syntaxe invalide",
  disposable: "Jetable",
  role_based: "Générique",
  no_mx: "Sans MX",
  duplicate: "Doublon",
  verified_deliverable: "Vérifié ✓✓",
  risky: "À risque ⚠️",
  undeliverable_smtp: "Non délivrable",
  error: "Erreur",
};

const STATUS_CLASSES: Record<EmailStatus, string> = {
  valid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  invalid_syntax: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  disposable: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  role_based: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100",
  no_mx: "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100",
  duplicate: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100",
  verified_deliverable:
    "bg-emerald-700 text-emerald-50 dark:bg-emerald-600 dark:text-emerald-50",
  risky: "bg-orange-200 text-orange-950 dark:bg-orange-800/60 dark:text-orange-50",
  undeliverable_smtp: "bg-red-200 text-red-950 dark:bg-red-900/60 dark:text-red-50",
  error: "bg-zinc-300 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100",
};

function summarize(results: EmailValidationResult[]) {
  const counts = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0])) as Record<
    EmailStatus,
    number
  >;
  for (const r of results) counts[r.status]++;
  return { total: results.length, ...counts };
}

function parseInput(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function csvEscape(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

interface Progress {
  label: string;
  processed: number;
  total: number;
  unit?: string;
}

interface EmailCheckClientProps {
  deepEnabled: boolean;
}

export default function EmailCheckClient({ deepEnabled }: EmailCheckClientProps) {
  const [text, setText] = useState("");
  const [step1Results, setStep1Results] = useState<EmailValidationResult[] | null>(null);
  const [step2Done, setStep2Done] = useState(false);
  const [creditsConsumed, setCreditsConsumed] = useState<number | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [isStep1Pending, setIsStep1Pending] = useState(false);
  const [isStep2Pending, setIsStep2Pending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  const emails = useMemo(() => parseInput(text), [text]);

  const resetRun = () => {
    setStep1Results(null);
    setStep2Done(false);
    setCreditsConsumed(null);
    setCreditsRemaining(null);
    setProgress(null);
  };

  const updateText = (next: string) => {
    setText(next);
    if (step1Results !== null || step2Done) resetRun();
  };

  const handleCancel = () => {
    cancelRef.current = true;
  };

  const handleStep1 = async () => {
    if (emails.length === 0) {
      toast.error("Collez au moins une adresse email.");
      return;
    }
    cancelRef.current = false;
    setIsStep1Pending(true);
    setStep1Results([]);
    setStep2Done(false);
    setCreditsConsumed(null);
    setCreditsRemaining(null);

    const chunks = chunk(emails, CHUNK_SIZE_STEP1);
    const accumulated: EmailValidationResult[] = [];
    let processed = 0;
    let errorCount = 0;

    setProgress({ label: "Vérification rapide", processed: 0, total: emails.length });

    for (const c of chunks) {
      if (cancelRef.current) break;

      let res: Step1Response | null = null;
      try {
        res = await retryOnce(() => runStep1(c));
      } catch {
        res = null;
      }

      if (res?.ok && res.results) {
        accumulated.push(...res.results);
      } else {
        errorCount += c.length;
        for (const raw of c) {
          accumulated.push({
            email: raw,
            normalized: raw.trim().toLowerCase(),
            status: "error",
            reason: res?.error ?? "Appel serveur en échec",
          });
        }
      }

      processed += c.length;
      setStep1Results([...accumulated]);
      setProgress({
        label: "Vérification rapide",
        processed,
        total: emails.length,
      });
    }

    const cancelled = cancelRef.current;
    setProgress(null);
    setIsStep1Pending(false);

    if (cancelled) {
      toast.info(`Étape 1 annulée — ${processed} / ${emails.length} adresses traitées`);
    } else {
      const valid = accumulated.filter((r) => r.status === "valid").length;
      toast.success(
        `Étape 1 terminée — ${valid} adresse${valid > 1 ? "s" : ""} à confirmer`
      );
    }
    if (errorCount > 0) {
      toast.error(
        `${errorCount} adresse${errorCount > 1 ? "s" : ""} n'${
          errorCount > 1 ? "ont" : "a"
        } pas pu être vérifiée${errorCount > 1 ? "s" : ""}, réessayez plus tard`
      );
    }
  };

  const handleStep2 = async () => {
    if (!step1Results) return;
    const candidates = step1Results
      .filter((r) => r.status === "valid")
      .map((r) => r.normalized);
    if (candidates.length === 0) {
      toast.error("Aucune adresse valide à confirmer.");
      return;
    }
    if (candidates.length > STEP2_CONFIRM_THRESHOLD) {
      const ok = window.confirm(
        `Vous vous apprêtez à consommer ${candidates.length} crédits ZeroBounce. Continuer ?`
      );
      if (!ok) return;
    }

    cancelRef.current = false;
    setIsStep2Pending(true);
    setProgress({
      label: "Confirmation SMTP",
      processed: 0,
      total: candidates.length,
      unit: "crédits",
    });

    const chunks = chunk(candidates, CHUNK_SIZE_STEP2);
    const updatesByEmail = new Map<string, Step2Update>();
    let processed = 0;
    let totalConsumed = 0;
    let lastRemaining: number | null = null;
    let errorCount = 0;

    for (const c of chunks) {
      if (cancelRef.current) break;

      let res: Step2Response | null = null;
      try {
        res = await retryOnce(() => runStep2(c));
      } catch {
        res = null;
      }

      if (res?.ok && res.updates) {
        for (const u of res.updates) updatesByEmail.set(u.normalized, u);
        totalConsumed += res.creditsConsumed ?? 0;
        if (typeof res.creditsRemaining === "number") lastRemaining = res.creditsRemaining;
      } else {
        errorCount += c.length;
        for (const email of c) {
          updatesByEmail.set(email, {
            normalized: email,
            status: "error",
            reason: res?.error ?? "Appel ZeroBounce en échec",
          });
        }
      }

      processed += c.length;
      setStep1Results((prev) =>
        prev
          ? prev.map((r) => {
              const u = updatesByEmail.get(r.normalized);
              return u
                ? { ...r, status: u.status, reason: u.reason, didYouMean: u.didYouMean }
                : r;
            })
          : prev
      );
      setCreditsConsumed(totalConsumed);
      setCreditsRemaining(lastRemaining);
      setProgress({
        label: "Confirmation SMTP",
        processed,
        total: candidates.length,
        unit: "crédits",
      });
    }

    const cancelled = cancelRef.current;
    setProgress(null);
    setIsStep2Pending(false);
    setStep2Done(!cancelled);

    if (cancelled) {
      toast.info(
        `Étape 2 annulée — ${processed} / ${candidates.length} adresses traitées`
      );
    } else {
      toast.success(
        `ZeroBounce terminé — ${totalConsumed} crédit${totalConsumed > 1 ? "s" : ""} consommé${
          totalConsumed > 1 ? "s" : ""
        }`
      );
    }
    if (errorCount > 0) {
      toast.error(
        `${errorCount} adresse${errorCount > 1 ? "s" : ""} n'${
          errorCount > 1 ? "ont" : "a"
        } pas pu être vérifiée${errorCount > 1 ? "s" : ""}, réessayez plus tard`
      );
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      toast.error("Les fichiers Excel ne sont pas pris en charge. Exportez-les en CSV (UTF-8).");
      e.target.value = "";
      return;
    }

    try {
      const raw = await file.text();
      const content = raw.replace(/^﻿/, "");
      const extracted = parseInput(content).filter((t) => t.includes("@"));

      if (extracted.length === 0) {
        toast.error("Aucune adresse email détectée dans le fichier.");
        return;
      }

      const base = text.trim() ? `${text.trimEnd()}\n` : "";
      updateText(base + extracted.join("\n"));
      toast.success(
        `${extracted.length} adresse${extracted.length > 1 ? "s" : ""} importée${
          extracted.length > 1 ? "s" : ""
        } depuis ${file.name}`
      );
    } catch {
      toast.error("Impossible de lire le fichier.");
    } finally {
      e.target.value = "";
    }
  };

  const step1Done = step1Results !== null && !isStep1Pending;
  const step2Candidates = useMemo(
    () => (step1Results ? step1Results.filter((r) => r.status === "valid").length : 0),
    [step1Results]
  );
  const anyBusy = isStep1Pending || isStep2Pending;

  const step1Disabled = anyBusy || emails.length === 0;

  let step2Disabled = anyBusy;
  let step2Title: string | undefined;
  if (!deepEnabled) {
    step2Disabled = true;
    step2Title =
      "Configurez ZEROBOUNCE_API_KEY sur Vercel pour activer la vérification SMTP";
  } else if (!step1Done) {
    step2Disabled = true;
    step2Title = "Complétez d'abord l'étape 1";
  } else if (step2Done) {
    step2Disabled = true;
  } else if (step2Candidates === 0) {
    step2Disabled = true;
    step2Title = "Aucune adresse valide à confirmer";
  }

  const summary = useMemo(
    () => (step1Results && step1Results.length > 0 ? summarize(step1Results) : null),
    [step1Results]
  );

  const exportableStatus: EmailStatus = step2Done ? "verified_deliverable" : "valid";
  const exportable = useMemo(
    () => step1Results?.filter((r) => r.status === exportableStatus) ?? [],
    [step1Results, exportableStatus]
  );
  const exportableCount = exportable.length;

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const timestamp = () =>
    new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

  const handleExportTxt = () => {
    if (exportableCount === 0) return;
    const content = exportable.map((r) => r.normalized).join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `emails-valides-${timestamp()}.txt`);
  };

  const handleExportCsv = () => {
    if (exportableCount === 0) return;
    const header = "email,status,suggestion";
    const rows = exportable.map(
      (r) =>
        `${csvEscape(r.normalized)},${csvEscape(r.status)},${csvEscape(r.didYouMean ?? "")}`
    );
    const csv = "﻿" + [header, ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `emails-valides-${timestamp()}.csv`);
  };

  const progressPct = progress
    ? Math.min(100, Math.round((progress.processed / Math.max(1, progress.total)) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Liste d&apos;emails</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={anyBusy}
              className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[color:var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Importer un fichier CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFileImport}
              className="hidden"
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => updateText(e.target.value)}
            placeholder={"alice@example.com\nbob@domain.fr\n..."}
            rows={10}
            disabled={anyBusy}
            className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--primary)] disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            {emails.length} adresse{emails.length > 1 ? "s" : ""} détectée
            {emails.length > 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <button
            type="button"
            onClick={handleStep1}
            disabled={step1Disabled}
            className={[
              "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              step1Done
                ? "border-2 border-emerald-600 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
                : "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90",
            ].join(" ")}
          >
            {isStep1Pending
              ? "Étape 1 en cours…"
              : step1Done
                ? "Étape 1 ✓ terminée"
                : "Étape 1 : Vérification rapide (gratuit)"}
          </button>

          <div className="flex flex-1 flex-col gap-1">
            <button
              type="button"
              onClick={handleStep2}
              disabled={step2Disabled}
              title={step2Title}
              className={[
                "w-full rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                step2Done
                  ? "border-2 border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-100"
                  : "bg-orange-600 text-white hover:bg-orange-700 disabled:hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600",
              ].join(" ")}
            >
              {isStep2Pending
                ? "Étape 2 en cours…"
                : step2Done
                  ? "Étape 2 ✓ terminée"
                  : step1Done && step2Candidates > 0
                    ? `Étape 2 : Confirmer ${step2Candidates} adresse${
                        step2Candidates > 1 ? "s" : ""
                      } via ZeroBounce (${step2Candidates} crédit${
                        step2Candidates > 1 ? "s" : ""
                      })`
                    : "Étape 2 : Confirmation SMTP (ZeroBounce)"}
            </button>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Seules les adresses validées à l&apos;étape 1 seront envoyées à
              ZeroBounce, pour économiser vos crédits.
            </p>
          </div>
        </div>

        {progress ? (
          <div className="space-y-2 rounded-lg border border-[color:var(--border)] p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                {progress.label} : {progress.processed.toLocaleString("fr-FR")} /{" "}
                {progress.total.toLocaleString("fr-FR")}
                {progress.unit ? ` ${progress.unit}` : ""} ({progressPct}%)
              </span>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs font-medium hover:bg-[color:var(--muted)]"
              >
                Annuler
              </button>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--muted)]">
              <div
                className="h-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: "#ff645f" }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {summary ? (
        <section className="rounded-lg border border-[color:var(--border)] p-4">
          <h2 className="text-lg font-semibold">Résumé</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Total" value={summary.total} />
            {step2Done ? (
              <>
                <Stat label="Délivrables" value={summary.verified_deliverable} />
                <Stat label="À risque" value={summary.risky} />
                <Stat label="Non délivrables" value={summary.undeliverable_smtp} />
              </>
            ) : (
              <Stat label="Valides" value={summary.valid} />
            )}
            <Stat label="Syntaxe KO" value={summary.invalid_syntax} />
            <Stat label="Sans MX" value={summary.no_mx} />
            <Stat label="Jetables" value={summary.disposable} />
            <Stat label="Génériques" value={summary.role_based} />
            <Stat label="Doublons" value={summary.duplicate} />
            {summary.error > 0 ? (
              <Stat label="Erreurs" value={summary.error} />
            ) : null}
          </dl>
        </section>
      ) : null}

      {step1Results && step1Results.length > 0 ? (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">Détails</h2>
              {step2Done || creditsConsumed !== null ? (
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  {creditsConsumed ?? 0} crédit{(creditsConsumed ?? 0) > 1 ? "s" : ""}{" "}
                  ZeroBounce consommé{(creditsConsumed ?? 0) > 1 ? "s" : ""}
                  {typeof creditsRemaining === "number"
                    ? ` · ${creditsRemaining} crédit${
                        creditsRemaining > 1 ? "s" : ""
                      } restant${creditsRemaining > 1 ? "s" : ""}`
                    : ""}
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleExportTxt}
                disabled={exportableCount === 0}
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[color:var(--muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Télécharger .txt ({exportableCount})
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exportableCount === 0}
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[color:var(--muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Télécharger .csv ({exportableCount})
              </button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[color:var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--muted)] text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Raison / suggestion</th>
                </tr>
              </thead>
              <tbody>
                {step1Results.map((r, i) => (
                  <tr
                    key={`${r.normalized}-${i}`}
                    className="border-t border-[color:var(--border)]"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.normalized}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[r.status]}`}
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[color:var(--muted-foreground)]">
                      {r.didYouMean ? (
                        <span>
                          {r.reason ? `${r.reason} · ` : ""}Suggestion :{" "}
                          <span className="font-mono">{r.didYouMean}</span>
                        </span>
                      ) : (
                        r.reason ?? "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-[color:var(--muted)] px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
