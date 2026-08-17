"use client";

/**
 * Sem este limite de erro, qualquer exceção no servidor vira a tela genérica
 * "This page couldn't load" da Vercel, que não diz o que quebrou. Aqui a causa
 * mais comum — configuração do Supabase ausente no ambiente — aparece nomeada,
 * com o que fazer a respeito.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const missingConfig = /NEXT_PUBLIC_SUPABASE/.test(error.message);

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">Algo quebrou</div>
          <h1>
            Erro <span>no servidor</span>
          </h1>
        </div>
      </div>

      <div className="panel">
        {missingConfig ? (
          <>
            <h3>Falta a configuração do Supabase</h3>
            <p className="desc">
              A aplicação subiu, mas não recebeu o endereço e a chave do banco. Arquivos{" "}
              <code>.env</code> versionados no repositório não alimentam o ambiente das funções na
              Vercel — as variáveis precisam estar cadastradas no projeto.
            </p>
            <div className="alert">
              No painel da Vercel, em <b>Settings → Environment Variables</b>, cadastre para todos os
              ambientes:
              <ul>
                <li>
                  <code>NEXT_PUBLIC_SUPABASE_URL</code>
                </li>
                <li>
                  <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
                </li>
              </ul>
              Os valores estão no Supabase em <b>Settings → API</b>. Depois de salvar, refaça o
              deploy para o build reler as variáveis.
            </div>
          </>
        ) : (
          <>
            <h3>Não foi possível carregar esta página</h3>
            <p className="desc">
              O servidor encontrou um erro ao montar a resposta. Se o problema persistir, os detalhes
              completos ficam nos logs de execução do projeto na Vercel.
            </p>
            <div className="alert error">
              {error.message || "Erro sem mensagem."}
              {error.digest && (
                <>
                  <br />
                  <br />
                  Identificador do erro nos logs: <b>{error.digest}</b>
                </>
              )}
            </div>
          </>
        )}

        <div style={{ marginTop: 18 }}>
          <button className="btn" type="button" onClick={reset}>
            Tentar de novo
          </button>
        </div>
      </div>
    </>
  );
}
