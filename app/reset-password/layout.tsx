import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
