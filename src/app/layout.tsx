import type { Metadata } from "next";
import { Unlock } from "@/components/unlock";
import { isUnlocked } from "@/lib/gate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Painel de Progresso — Ciclismo",
  description:
    "Análise de treinos de ciclismo a partir dos seus próprios arquivos GPX: zonas, subidas, eficiência e evolução.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // O portão fica aqui, e não em middleware, de propósito: foi middleware que
  // derrubou toda página em produção uma vez, e no layout a checagem é uma
  // leitura de cookie, sem rede e sem nada que possa falhar.
  const unlocked = await isUnlocked();

  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700;900&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="wrap">{unlocked ? children : <Unlock />}</div>
      </body>
    </html>
  );
}
