"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Painel" },
  { href: "/treinos", label: "Treinos" },
  { href: "/subidas", label: "Subidas" },
  { href: "/perfil", label: "Perfil" },
];

export function Nav() {
  const pathname = usePathname();

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
    </nav>
  );
}
