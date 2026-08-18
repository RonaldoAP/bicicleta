import { NextResponse } from "next/server";
import { checkPassword, GATE_COOKIE, sessionToken } from "@/lib/gate";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  let senha = "";
  try {
    const body = await request.json();
    senha = typeof body?.senha === "string" ? body.senha : "";
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  if (!checkPassword(senha)) {
    // Atraso curto para desestimular tentativa automatizada em sequência.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_S,
  });
  return response;
}
