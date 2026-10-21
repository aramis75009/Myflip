"use client";

import { usePathname } from "next/navigation";

import { TabsLiens } from "@/components/ui/tabs";

/**
 * Studio sub-navigation, out of the AI banner (audit § 2.17). « Coloris »
 * covers the home page and every bag sheet (/studio/<cle>); « Réglages » is
 * the Studio tab of /parametres (plan § 5, question 10).
 */
export default function SousNavStudio() {
  const chemin = usePathname();
  const bilan = chemin === "/studio/bilan" || chemin.startsWith("/studio/bilan/");
  return (
    <TabsLiens
      label="Studio"
      className="px-3.5 min-[900px]:px-[18px]"
      liens={[
        { href: "/studio", libelle: "Coloris", actif: !bilan && (chemin === "/studio" || chemin.startsWith("/studio/")) },
        { href: "/studio/bilan", libelle: "Bilan", actif: bilan },
        { href: "/parametres?onglet=studio", libelle: "Réglages", actif: false },
      ]}
    />
  );
}
