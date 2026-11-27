import { DialogProvider } from "@/components/Dialogs";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Le Carnet — Drive",
  description: "Le Drive de Le Carnet : dépose tes fichiers, retrouve-les, ouvre-les en aperçu ou télécharge-les.",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "Le Carnet — Drive",
    description: "Tes fichiers, avec ton compte Le Carnet.",
    images: ["/icons/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1F4F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1420" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600;7..72,700&family=Figtree:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><DialogProvider>{children}</DialogProvider></body>
    </html>
  );
}
