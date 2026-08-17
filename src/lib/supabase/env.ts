/**
 * Configuração do Supabase.
 *
 * A ordem é: variável de ambiente primeiro, valor embutido depois. O embutido
 * existe porque arquivos `.env` versionados não alimentam o ambiente das
 * funções na Vercel — sem ele, o app sobe e só quebra na primeira requisição.
 *
 * Embutir estes dois valores é seguro: a chave `publishable` é entregue ao
 * navegador de todo visitante, é assim que ela foi desenhada. Quem protege os
 * dados é o Row Level Security, ativo em todas as tabelas e no bucket de
 * arquivos. Nenhuma chave secreta (`service_role`) aparece aqui — essa nunca
 * pode sair do servidor.
 *
 * Para apontar a aplicação para outro projeto Supabase, basta definir as
 * variáveis de ambiente: elas têm precedência sobre o que está escrito abaixo.
 */
const FALLBACK_URL = "https://owpunymhlnywlspeadfw.supabase.co";
const FALLBACK_ANON_KEY = "sb_publishable_tglH_S0IzqKFF6yqsTAPZA_tgEaRisD";

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no ambiente. " +
        "Na Vercel, cadastre-as em Settings → Environment Variables; localmente, em .env.local " +
        "(veja .env.example).",
    );
  }

  return { url, key };
}
