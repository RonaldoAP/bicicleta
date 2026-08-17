# bicicleta

Plataforma pessoal de análise de treinos de ciclismo. Você sobe o GPX, ela calcula
tudo que o arquivo permite calcular e mostra a evolução ao longo do tempo — a
parte que o Strava não mostra: comparação da mesma subida entre treinos, deriva
cardíaca, queda de ritmo no final, eficiência cardíaca e potência estimada pela
física do percurso.

## O que ela calcula

A partir de cada GPX:

| Métrica | Como sai |
| --- | --- |
| Distância | Haversine ponto a ponto, com descarte de saltos de GPS acima de 120 km/h |
| Elevação | Altimetria suavizada em janela de 20 m e histerese de 1 m, para não inflar o ganho com ruído |
| Tempo em movimento | Desconta amostras abaixo de 1,5 km/h e intervalos de gravação acima de 30 s |
| Zonas de FC | 5 zonas em % da FC máxima (60 / 75 / 85 / 92 %), com tempo e percentual em cada |
| Potência | Do medidor, quando o arquivo traz; senão estimada por rolamento + arrasto + gravidade + aceleração |
| Potência normalizada | Média móvel de 30 s elevada à quarta potência |
| Carga | TSS quando há potência medida e FTP configurado; senão estimada pelo tempo em cada zona de FC |
| Eficiência | Velocidade média ÷ FC média × 100 |
| Deriva cardíaca | Queda da relação velocidade/FC entre a primeira e a segunda metade do treino |
| Queda no final | Velocidade do último quarto do percurso contra a do primeiro |
| Subidas | Detectadas por zigzag no perfil de elevação: mínimo de 200 m, 15 m de ganho e 2 % de inclinação |
| Parciais | Por quilômetro: tempo, velocidade, ganho de elevação, FC e potência |

E entre treinos:

- **Rotas repetidas** — treinos são pareados comparando 24 pontos ao longo do
  traçado, não só a largada, para não confundir dois percursos diferentes que
  saem do mesmo lugar.
- **Mesma subida em treinos diferentes** — pareada por proximidade da base
  (150 m) e extensão parecida, com evolução de tempo, VAM e custo cardíaco.

## Telas

- `/` — painel: o sinal de progresso mais forte que os dados sustentam, volume do
  período, FC média vs máxima, distribuição por zona, subida em destaque,
  velocidade, eficiência e leituras automáticas do período.
- `/treinos` — histórico completo com rotas repetidas identificadas.
- `/treino/[id]` — perfil de altimetria com FC sobreposta, traçado do percurso,
  zonas, subidas detectadas, comportamento por quarto do percurso e parciais.
- `/subidas` — todas as subidas agrupadas, com comparação entre treinos.
- `/perfil` — FC máxima, limiar, peso, FTP, CdA e Crr, mais o reprocessamento do
  histórico.
- `/upload` — importação de um ou vários GPX.

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do seu projeto Supabase
npm run dev
```

Variáveis (Supabase → Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Elas são opcionais: `src/lib/supabase/env.ts` traz os valores do projeto padrão
embutidos, e as variáveis de ambiente têm precedência sobre eles. Embutir é
seguro porque a chave *publishable* já é entregue ao navegador de todo visitante
— quem protege os dados é o RLS. Nenhuma chave `service_role` existe no código.
Para apontar a aplicação para outro projeto Supabase, defina as variáveis.

## Verificação

```bash
npm test        # motor de métricas contra um GPX sintético de geometria conhecida
npm run typecheck
npm run build
```

Os testes montam um percurso com distância, inclinação e paradas conhecidas e
conferem se o motor reproduz os valores esperados — inclusive se a subida de 1 km
a 6 % é detectada com a inclinação correta e se o tempo parado fica fora do tempo
em movimento.

## Banco

> **Modo pessoal, sem autenticação.** Não há login: todos os treinos pertencem a
> um dono único, identificado pelo UUID fixo em `src/lib/owner.ts`, e as
> políticas de acesso do banco estão abertas. Na prática, **quem tiver a URL vê e
> sobe treinos**. As colunas `user_id` continuam no schema de propósito: devolver
> o login é trocar essa constante pelo id da sessão, sem migrar dado nenhum.

Quatro tabelas no Supabase:

- `profiles` — parâmetros do atleta usados nos cálculos
- `activities` — resumo de cada treino, com zonas, parciais e traçado em `jsonb`
- `activity_streams` — séries temporais do treino (um registro por treino)
- `climbs` — subidas detectadas, com chave de rota para o pareamento

O GPX original vai para o bucket privado `gpx`, em uma pasta por usuário. É o que
permite o botão **recalcular** no perfil: mudar FC máxima, peso ou FTP — ou
adicionar uma métrica nova ao motor — e reprocessar o histórico inteiro a partir
dos arquivos de origem, sem precisar reenviar nada.

## Limites conhecidos

- A potência estimada não considera vento nem inclinação lateral. Serve para
  comparar treinos entre si, não como leitura absoluta — um dia de vento forte
  desvia o número.
- A altimetria é a do GPS. Arquivos de aparelhos com barômetro são bem mais
  precisos em ganho de elevação.
- O reprocessamento roda em lotes de 25 treinos por chamada, para não estourar o
  tempo limite da função.
