"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  validateEmailsAction,
  type ValidateEmailsResponse,
} from "@/app/actions/validateEmails";
import type { EmailStatus } from "@/lib/email-validation";

const STATUS_LABELS: Record<EmailStatus, string> = {
  valid: "Valide",
  invalid_syntax: "Syntaxe invalide",
  disposable: "Jetable",
  role_based: "Générique",
  no_mx: "Sans MX",
  duplicate: "Doublon",
};

const STATUS_CLASSES: Record<EmailStatus, string> = {
  valid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  invalid_syntax: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  disposable: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  role_based: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100",
  no_mx: "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100",
  duplicate: "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100",
};

function parseInput(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function EmailCheckClient() {
  const [text, setText] = useState("");
  const [response, setResponse] = useState<ValidateEmailsResponse | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emails = useMemo(() => parseInput(text), [text]);

  const handleSubmit = () => {
    if (emails.length === 0) {
      toast.error("Collez au moins une adresse email.");
      return;
    }

    startTransition(async () => {
      const res = await validateEmailsAction({ emails });
      setResponse(res);
      if (res.ok) {
        toast.success(`Validation terminée — ${res.summary?.valid ?? 0} valides`);
      } else {
        toast.error(res.error ?? "Échec de la validation");
      }
    });
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

      setText((prev) => {
        const joined = extracted.join("\n");
        return prev.trim() ? `${prev.trimEnd()}\n${joined}` : joined;
      });
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

  const validEmails = useMemo(
    () => response?.results?.filter((r) => r.status === "valid") ?? [],
    [response]
  );
  const validCount = validEmails.length;

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
    if (validCount === 0) return;
    const content = validEmails.map((r) => r.normalized).join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `emails-valides-${timestamp()}.txt`);
  };

  const handleExportCsv = () => {
    if (validCount === 0) return;
    const header = "email,status,suggestion";
    const rows = validEmails.map((r) => `${r.normalized},${r.status},`);
    const csv = "﻿" + [header, ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `emails-valides-${timestamp()}.csv`);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Liste d&apos;emails</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[color:var(--muted)]"
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
            onChange={(e) => setText(e.target.value)}
            placeholder={"alice@example.com\nbob@domain.fr\n..."}
            rows={10}
            className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--primary)]"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || emails.length === 0}
            className="rounded-md bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-[color:var(--primary-foreground)] disabled:opacity-50"
          >
            {isPending ? "Validation…" : `Valider ${emails.length || ""}`.trim()}
          </button>
          <span className="text-sm text-[color:var(--muted-foreground)]">
            {emails.length} adresse{emails.length > 1 ? "s" : ""} détectée
            {emails.length > 1 ? "s" : ""}
          </span>
        </div>
      </section>

      {response?.summary ? (
        <section className="rounded-lg border border-[color:var(--border)] p-4">
          <h2 className="text-lg font-semibold">Résumé</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Total" value={response.summary.total} />
            <Stat label="Valides" value={response.summary.valid} />
            <Stat label="Syntaxe KO" value={response.summary.invalid_syntax} />
            <Stat label="Sans MX" value={response.summary.no_mx} />
            <Stat label="Jetables" value={response.summary.disposable} />
            <Stat label="Génériques" value={response.summary.role_based} />
            <Stat label="Doublons" value={response.summary.duplicate} />
          </dl>
        </section>
      ) : null}

      {response?.results ? (
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Détails</h2>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleExportTxt}
                disabled={validCount === 0}
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[color:var(--muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Télécharger .txt ({validCount})
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={validCount === 0}
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[color:var(--muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Télécharger .csv ({validCount})
              </button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[color:var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--muted)] text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Raison</th>
                </tr>
              </thead>
              <tbody>
                {response.results.map((r, i) => (
                  <tr
                    key={`${r.normalized}-${i}`}
                    className="border-t border-[color:var(--border)]"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.normalized}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[r.status]}`}
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[color:var(--muted-foreground)]">
                      {r.reason ?? "—"}
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
