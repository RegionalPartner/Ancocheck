# Ancocheck

Outil interne de validation d'adresses email avant envoi de campagnes.
Vérifie syntaxe, domaines jetables, adresses génériques et présence
d'enregistrements MX.

Stack : **Next.js 16** (App Router) · **React 19** · **TypeScript** ·
**Tailwind v4** · **shadcn/ui** (tokens prêts) · **sonner**.

## Prérequis

- Node.js ≥ 20

## Variables d'environnement

Aucune variable d'environnement n'est requise.

## Installation

```bash
pnpm install
```

## Commandes

```bash
pnpm dev        # démarre Next.js en dev sur http://localhost:3000
pnpm build      # build production
pnpm start      # lance le build
pnpm typecheck  # tsc --noEmit
pnpm lint       # next lint
```

L'URL racine redirige vers `/admin/email-check`.

## Utilisation

1. Va sur `/admin/email-check`
2. Colle la liste d'emails (une par ligne ou séparés par `,` / `;`)
3. Renseigne un libellé de campagne (optionnel)
4. Clique sur **Valider** — chaque adresse est classée :
   - `valid` — syntaxe OK, domaine avec MX, non jetable, non générique
   - `invalid_syntax` — format invalide
   - `disposable` — domaine jetable connu
   - `role_based` — préfixe générique (`info@`, `contact@`, …)
   - `no_mx` — domaine sans enregistrement MX ni A
   - `duplicate` — déjà présent plus haut dans la liste
5. Exporte les adresses valides en `.txt` ou `.csv` (UTF-8 avec BOM,
   compatible Excel) si besoin

## Structure

```
app/
  actions/validateEmails.ts   Server Action zod-validée
  admin/email-check/          UI (page serveur + client)
  layout.tsx, page.tsx
lib/
  email-validation.ts         Logique métier (regex, MX, disposable, role)
```
