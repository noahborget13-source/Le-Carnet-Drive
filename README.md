# Drive

Un petit drive personnel : dépose des fichiers, retrouve-les, ouvre-les en aperçu (images, PDF, vidéo, audio, texte) ou télécharge-les.

**Stack** : Next.js (App Router) · Supabase (auth, base Postgres, stockage) · Vercel

## Fonctionnement

- Connexion par email et mot de passe (Supabase Auth).
- Les fichiers sont dans un bucket Supabase **privé** (`drive`), rangés par dossier `{user_id}/…`.
- La table `public.files` garde le nom d'origine, la taille et le type.
- Des règles de sécurité (RLS) garantissent que chaque utilisateur ne voit que ses propres fichiers.
- Aperçu et téléchargement passent par des liens signés temporaires.

## Lancer en local

```bash
cp .env.example .env.local   # puis renseigner les deux variables
npm install
npm run dev
```

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publique (publishable) du projet |

## Base de données

Le schéma (table `files`, bucket `drive`, politiques RLS) est dans `supabase/migrations/`.

## Réglage Supabase à ne pas oublier

Dans *Authentication → URL Configuration*, définir **Site URL** sur l'adresse du site déployé, sinon le lien de confirmation par email pointera vers localhost.
