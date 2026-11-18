# Drive

Un petit drive personnel : dépose des fichiers, retrouve-les, ouvre-les en aperçu (images, PDF, vidéo, audio, texte) ou télécharge-les.

**Stack** : Next.js (App Router) · Supabase (auth, base Postgres, stockage) · Vercel

## Fonctionnement

- Connexion avec un compte **Le Carnet** (même projet Supabase : email/mot de passe ou Google). Les comptes se créent sur Le Carnet.
- Les fichiers sont dans un bucket Supabase **privé** (`drive`), rangés par dossier `{user_id}/…`.
- La table `public.drive_files` garde le nom d'origine, la taille et le type.
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

Le schéma (table `drive_files`, bucket `drive`, politiques RLS, ajoutés au projet Supabase de Le Carnet) est dans `supabase/migrations/`.

## Maintenance

Le propriétaire de Le Carnet pilote les maintenances depuis son panel (`/panel/`). Pour chaque maintenance, une case « Appliquer aussi au Drive » décide si le Drive est concerné (décochée par défaut). Le Drive lit la vue `drive_maintenance_active` (colonne `system_alerts.applies_to_drive`, migration 36 du dépôt Le Carnet) : pendant une maintenance, il affiche « Nous revenons très vite ! » puis revient tout seul à l'heure de fin. Un bandeau prévient à l'avance si la maintenance a un message.

## Réglage Supabase à ne pas oublier

Dans *Authentication → URL Configuration*, ajouter `https://le-carnet-drive.vercel.app/**` aux **Redirect URLs** (sinon la connexion Google renvoie vers Le Carnet).
