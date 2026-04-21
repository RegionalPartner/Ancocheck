# Ancocheck

Outil interne de validation d'adresses email avant envoi de campagnes.
Vérifie syntaxe, domaines jetables, adresses génériques et présence
d'enregistrements MX. Optionnellement, une passe de confirmation SMTP
via l'API ZeroBounce permet de distinguer les boîtes réellement
délivrables des adresses à risque.

Stack : **Next.js 16** (App Router) · **React 19** · **TypeScript** ·
**Tailwind v4** · **shadcn/ui** (tokens prêts) · **sonner**.

## Prérequis

- Node.js ≥ 20

## Variables d'environnement

| Clé                  | Portée  | Requis                                          | Description                                                                    |
| -------------------- | ------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `ZEROBOUNCE_API_KEY` | serveur | non (active la passe 2 "vérification SMTP") | Clé API ZeroBounce. Sans elle, seule la passe 1 (rapide, gratuite) est active. |

La clé `ZEROBOUNCE_API_KEY` n'est jamais exposée côté client (pas de
préfixe `NEXT_PUBLIC_`). Sur Vercel, ajoutez-la dans *Project Settings
→ Environment Variables* et redéployez.

Si elle n'est pas présente, le bouton **Vérifier + confirmation SMTP
(ZeroBounce)** est désactivé et affiche au survol : « Configurez
ZEROBOUNCE_API_KEY sur Vercel pour activer la vérification SMTP ».

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
2. Colle la liste d'emails (une par ligne ou séparés par `,` / `;`) ou
   importe un fichier CSV
3. Choisis le mode de vérification :
   - **Vérifier (rapide, gratuit)** — passe 1 locale : syntaxe, doublons,
     domaines jetables, préfixes génériques, MX. Classes renvoyées :
     - `valid` — syntaxe OK, domaine avec MX, non jetable, non générique
     - `invalid_syntax` — format invalide
     - `disposable` — domaine jetable connu
     - `role_based` — préfixe générique (`info@`, `contact@`, …)
     - `no_mx` — domaine sans enregistrement MX ni A
     - `duplicate` — déjà présent plus haut dans la liste
   - **Vérifier + confirmation SMTP (ZeroBounce)** — passe 1 + appel
     ZeroBounce `/v2/validate` pour chaque email `valid`. Classes
     supplémentaires :
     - `verified_deliverable` — ZeroBounce confirme la boîte délivrable
     - `risky` — catch-all, do_not_mail, unknown, ou appel en erreur
     - `undeliverable_smtp` — invalid, spamtrap, abuse
4. Exporte les adresses fiables en `.txt` ou `.csv` (UTF-8 avec BOM,
   compatible Excel). Le CSV inclut une colonne `suggestion` remplie
   avec le `did_you_mean` ZeroBounce quand présent.

Après une passe 2, le nombre de crédits ZeroBounce consommés et
restants est affiché au-dessus de la table.

## Structure

```
app/
  actions/validateEmails.ts   Server Actions (passe 1 + passe 2)
  admin/email-check/          UI (page serveur + client)
  layout.tsx, page.tsx
lib/
  email-validation.ts         Passe 1 locale (regex, MX, disposable, role)
  zerobounce.ts               Client ZeroBounce + mapping des statuts
```
