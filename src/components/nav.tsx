"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Painel" },
  { href: "/treinos", label: "Treinos" },
  { href: "/subidas", label: "Subidas" },
  { href: "/perfil", label: "Perfil" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <nav className="nav">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} data-active={pathname === link.href}>
          {link.label}
        </Link>
      ))}
      <span className="spacer" />
      <Link href="/upload" className="cta">
        + Subir GPX
      </Link>
      <button type="button" onClick={signOut} disabled={signingOut}>
        {signingOut ? "Saindo…" : "Sair"}
      </button>
    </nav>
  );
}
