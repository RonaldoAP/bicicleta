import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const GATE_COOKIE = "bicicleta_acesso";

/**
 * Senha única de acesso. Serve para manter o endereço fora do alcance de quem
 * topar com ele, não como segurança de verdade: são todos os dados atrás de um
 * segredo curto e compartilhado. Quando a plataforma deixar de ser pessoal, o
 * caminho é voltar para contas individuais.
 */
function password(): string {
  return process.env.SITE_PASSWORD || "3107";
}

/** O cookie guarda o resumo da senha, nunca a senha em si. */
function token(): string {
  return createHash("sha256").update(`bicicleta:${password()}`).digest("hex");
}

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Comparar sem vazar tempo evita descobrir o segredo por tentativa medida.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(attempt: string): boolean {
  return equals(attempt.trim(), password());
}

export function sessionToken(): string {
  return token();
}

export async function isUnlocked(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(GATE_COOKIE)?.value;
  return typeof value === "string" && equals(value, token());
}
