# Ancocheck

Outil interne de validation d'adresses email avant envoi de campagnes.
Vérifie syntaxe, domaines jetables, adresses génériques et présence
d'enregistrements MX, puis journalise chaque run dans Supabase.

Stack : **Next.js 16** (App Router) · **React 19** · **TypeScript** ·
**Tailwind v4** · **shadcn/ui** (tokens prêts) · **Supabase** · **sonner**.

## Prérequis

- Node.js ≥ 20
- Un projet Supabase (URL + service role key)

## Variables d'environnement

Crée un fichier `.env.local` à la racine :

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ton-projet>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon publique>
SUPABASE_SERVICE_ROLE_KEY=<clé service role — NE JAMAIS COMMITER>
```

> La clé `SUPABASE_SERVICE_ROLE_KEY` est utilisée côté serveur uniquement
> (Server Action `validateEmailsAction`) pour écrire dans les tables
> `email_validation_runs` et `email_validations` en contournant RLS.

## Installation

```bash
npm install
```

## Base de données

Applique la migration Supabase :

```bash
# via Supabase CLI
supabase db push

# ou copier le SQL dans l'éditeur Supabase :
# supabase/migrations/20260420000001_create_email_validations.sql
```

Tables créées :
- `email_validation_runs` — une ligne par lot validé, avec compteurs
- `email_validations` — une ligne par adresse, avec statut et raison
- enum `email_validation_status` (`valid`, `invalid_syntax`, `disposable`,
  `role_based`, `no_mx`, `duplicate`)

RLS activée sur les deux tables ; aucune policy anon par défaut — l'accès
passe par la service role.

## Commandes

```bash
npm run dev        # démarre Next.js en dev sur http://localhost:3000
npm run build      # build production
npm run start      # lance le build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
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
5. Exporte les adresses valides en `.txt` si besoin

Chaque run crée un enregistrement dans `email_validation_runs` et une ligne
par adresse dans `email_validations`.

## Structure

```
app/
  actions/validateEmails.ts   Server Action zod-validée
  admin/email-check/          UI (page serveur + client)
  layout.tsx, page.tsx
lib/
  email-validation.ts         Logique métier (regex, MX, disposable, role)
  supabase/
    admin.ts                  Client service role
    server.ts                 Client anon
supabase/migrations/          SQL (tables + enum + index + RLS)
```
