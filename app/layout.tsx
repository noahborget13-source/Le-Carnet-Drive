import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drive",
  description: "Dépose tes fichiers, retrouve-les, ouvre-les en aperçu ou télécharge-les.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
