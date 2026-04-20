import EmailCheckClient from "./EmailCheckClient";

export const metadata = {
  title: "Validation d'emails — Ancocheck",
};

export default function EmailCheckPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Validation d&apos;emails
        </h1>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          Collez une liste d&apos;adresses (une par ligne, ou séparées par des
          virgules/points-virgules) avant envoi de campagne. Les doublons, les
          domaines jetables, les adresses génériques et les domaines sans MX
          sont détectés et journalisés dans Supabase.
        </p>
      </header>
      <EmailCheckClient />
    </main>
  );
}
