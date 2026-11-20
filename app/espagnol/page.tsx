import type { Metadata } from "next";
import EsApp from "@/components/espagnol/EsApp";

export const metadata: Metadata = {
  title: "Cours d'espagnol — Le Carnet",
  description: "Cours, ressources et devoirs d'espagnol : espace professeur et espace élèves.",
};

export default function Page() {
  return <EsApp />;
}
