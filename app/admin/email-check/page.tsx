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
          virgules/points-virgules) pour vérifier leur validité avant l&apos;envoi
          d&apos;une campagne. Les doublons, domaines jetables, adresses
          génériques (type contact@, noreply@) et domaines sans MX sont détectés
          automatiquement.
        </p>
      </header>
      <EmailCheckClient />
    </main>
  );
}
