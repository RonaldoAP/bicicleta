import Link from "next/link";
import { GoalForm } from "@/components/goal-form";
import { Nav } from "@/components/nav";
import { buildGoalPlan } from "@/lib/goal";
import { clock, decimal, duration, integer } from "@/lib/format";
import { OWNER_ID } from "@/lib/owner";
import { loadState, nextSession, personalRecords } from "@/lib/planning";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow, ClimbRow, ProfileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  descanso: "pill",
  leve: "pill",
  ideal: "pill best",
  atencao: "pill warn",
  risco: "pill hot",
};

const STATUS_LABEL: Record<string, string> = {
  descanso: "parado há dias",
  leve: "abaixo da média",
  ideal: "em equilíbrio",
  atencao: "acima da média",
  risco: "subindo rápido demais",
};

export default async function PlanoPage({
  searchParams,
}: {
  searchParams: Promise<{ km?: string }>;
}) {
  const { km } = await searchParams;
  const targetKm = Math.min(600, Math.max(5, Number(km) || 100));

  const supabase = await createClient();
  const [{ data: activityData }, { data: climbData }, { data: profileData }] = await Promise.all([
    supabase.from("activities").select("*").order("started_at", { ascending: false }),
    supabase.from("climbs").select("*"),
    supabase.from("profiles").select("*").eq("id", OWNER_ID).maybeSingle(),
  ]);

  const activities = (activityData ?? []) as ActivityRow[];
  const climbs = (climbData ?? []) as ClimbRow[];
  const profile = profileData as ProfileRow | null;

  if (activities.length === 0) {
    return (
      <>
        <div className="head">
          <div className="title-block">
            <div className="kicker">Onde você quer chegar</div>
            <h1>
              Seu <span>plano</span>
            </h1>
          </div>
        </div>
        <Nav />
        <div className="empty">
          <div className="ico">🎯</div>
          <h2>Sem treinos, sem plano</h2>
          <p>
            O planejamento parte do que você já faz hoje: distância mais longa, ritmo e carga das
            últimas semanas. Suba pelo menos um GPX e esta página monta o caminho até a meta.
          </p>
          <Link href="/upload" className="btn" style={{ display: "inline-block" }}>
            Subir GPX
          </Link>
        </div>
      </>
    );
  }

  const load = loadState(activities);
  const next = nextSession(activities, profile, load);
  const plan = buildGoalPlan(targetKm, activities, profile);
  const records = personalRecords(activities, climbs);

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">Onde você quer chegar</div>
          <h1>
            Seu <span>plano</span>
          </h1>
        </div>
        <div className="rider">
          <b>Meta de {targetKm} km</b>
          maior treino até aqui: {decimal(plan?.longestKm, 1)} km
          <br />
          {decimal(load.weeklyKm, 0)} km nos últimos 7 dias
        </div>
      </div>

      <Nav />

      {/* ---------------- Próximo treino ---------------- */}
      {next && (
        <div className="hero">
          <div>
            <h2>O que fazer no próximo treino</h2>
            <div className="big" data-tone={load.status === "risco" ? "warn" : "good"}>
              {decimal(next.distanceKm, 1)} <small>km</small>
            </div>
            <p>
              <b>{next.kind}.</b> {next.why}
            </p>
            <p style={{ marginTop: 8 }}>{next.howTo}</p>
          </div>
          <div className="viz">
            <div className="stat-row">
              <div className="stat">
                <div className="k">Duração prevista</div>
                <div className="v">{duration(next.durationS)}</div>
              </div>
              <div className="stat">
                <div className="k">No seu ritmo</div>
                <div className="v">
                  {decimal(next.speedKmh, 1)} <small>km/h</small>
                </div>
              </div>
              <div className="stat">
                <div className="k">FC alvo</div>
                <div className="v">
                  {next.hrLow}–{next.hrHigh} <small>bpm</small>
                </div>
              </div>
              <div className="stat">
                <div className="k">Carga da semana</div>
                <div className="v">
                  {integer(load.acute)}{" "}
                  <small>{load.ratio ? `(${decimal(load.ratio, 2)}×)` : ""}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>
          Leitura da carga{" "}
          <span className={STATUS_PILL[load.status]} style={{ marginLeft: 8 }}>
            {STATUS_LABEL[load.status]}
          </span>
        </h3>
        <p className="desc" style={{ marginBottom: 0 }}>
          {load.reading} A comparação é entre o volume dos últimos 7 dias ({integer(load.acute)}) e a
          média semanal das últimas 4 semanas ({integer(load.chronic)}).
        </p>
      </div>

      {/* ---------------- Meta ---------------- */}
      <div className="panel">
        <h3>Escolha a meta</h3>
        <p className="desc">
          O plano parte do seu treino mais longo e sobe 10% por semana, com uma semana de alívio a
          cada quatro. É a progressão que o corpo acompanha sem cobrar depois.
        </p>
        <GoalForm current={targetKm} />
      </div>

      {plan && (
        <>
          {plan.warnings.length > 0 && (
            <div className="panel">
              {plan.warnings.map((warning) => (
                <div className="alert" key={warning} style={{ marginBottom: 10 }}>
                  {warning}
                </div>
              ))}
            </div>
          )}

          <div className="cards">
            <div className="card">
              <div className="label">Semanas até a meta</div>
              <div className="val">{plan.alreadyDone ? "—" : plan.weeksNeeded}</div>
              <div className="sub">
                {plan.alreadyDone ? "distância já alcançada" : "com 3 treinos por semana"}
              </div>
              <div className="bar" />
            </div>
            <div className="card">
              <div className="label">Tempo estimado no dia</div>
              <div className="val">{duration(plan.estimate.durationS)}</div>
              <div className="sub">a {decimal(plan.estimate.speedKmh, 1)} km/h de média</div>
              <div className="bar" />
            </div>
            <div className="card">
              <div className="label">Elevação provável</div>
              <div className="val">
                {integer(plan.estimate.elevationM)} <small>m</small>
              </div>
              <div className="sub">no seu terreno de sempre</div>
              <div className="bar" />
            </div>
            <div className="card">
              <div className="label">Gasto estimado</div>
              <div className="val">
                {integer(plan.nutrition.calories)} <small>kcal</small>
              </div>
              <div className="sub">{integer(plan.nutrition.totalCarbs)} g de carboidrato na estrada</div>
              <div className="bar" />
            </div>
          </div>

          <div className="table-panel">
            <h3 style={{ marginBottom: 6 }}>Semana a semana até {plan.targetKm} km</h3>
            <p className="desc">
              O volume da semana assume o treino longo valendo perto de 45% do total — o resto sai em
              dois treinos mais curtos.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Treino longo</th>
                  <th>Volume total</th>
                  <th>Sessões</th>
                  <th>Foco</th>
                </tr>
              </thead>
              <tbody>
                {plan.weeks.map((week) => (
                  <tr key={week.week}>
                    <td className="num">
                      {week.week}
                      {week.reachesGoal && (
                        <>
                          {" "}
                          <span className="pill best">meta</span>
                        </>
                      )}
                      {week.recovery && (
                        <>
                          {" "}
                          <span className="pill warn">alívio</span>
                        </>
                      )}
                    </td>
                    <td className="num">{decimal(week.longRideKm, 1)} km</td>
                    <td className="num">{week.weeklyKm} km</td>
                    <td style={{ fontSize: 12 }}>{week.sessions}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{week.focus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------------- Nutrição ---------------- */}
          <div className="climb">
            <h3>🍌 Alimentação no dia da meta</h3>
            <p className="desc">
              Para {plan.targetKm} km em torno de {duration(plan.estimate.durationS)}. O carboidrato é o
              combustível que acaba primeiro: o corpo guarda entre 90 e 120 minutos de esforço forte, e
              tudo depois disso precisa vir de fora.
            </p>

            <div className="climb-row">
              <div className="climb-item">
                <div className="d">POR HORA</div>
                <div className="s">
                  {plan.nutrition.carbsPerHour} <span className="unit">g de carbo</span>
                </div>
                <div className="meta">{integer(plan.nutrition.totalCarbs)} g no total</div>
              </div>
              <div className="climb-item">
                <div className="d">LÍQUIDO</div>
                <div className="s">
                  {decimal(plan.nutrition.fluidMl / 1000, 1)} <span className="unit">litros</span>
                </div>
                <div className="meta">~700 ml por hora</div>
              </div>
              <div className="climb-item">
                <div className="d">SÓDIO</div>
                <div className="s">
                  {integer(plan.nutrition.sodiumMg)} <span className="unit">mg</span>
                </div>
                <div className="meta">pitada de sal na garrafa</div>
              </div>
              <div className="climb-item">
                <div className="d">GASTO</div>
                <div className="s">
                  {integer(plan.nutrition.calories)} <span className="unit">kcal</span>
                </div>
                <div className="meta">estimado pela potência</div>
              </div>
            </div>

            <div className="grid2" style={{ marginTop: 18 }}>
              <div>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Antes</h4>
                <p className="desc">{plan.nutrition.preRide}</p>
                <h4 style={{ fontSize: 13, marginBottom: 8, marginTop: 16 }}>Durante</h4>
                <p className="desc">{plan.nutrition.duringRide}</p>
                <h4 style={{ fontSize: 13, marginBottom: 8, marginTop: 16 }}>Depois</h4>
                <p className="desc" style={{ marginBottom: 0 }}>
                  {plan.nutrition.postRide}
                </p>
              </div>

              {plan.nutrition.schedule.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 13, marginBottom: 8 }}>Cronograma na estrada</h4>
                  <table style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>O quê</th>
                        <th>Carbo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.nutrition.schedule.map((feed) => (
                        <tr key={feed.atMinute}>
                          <td className="num">{clock(feed.atMinute * 60)}</td>
                          <td style={{ fontSize: 12 }}>{feed.what}</td>
                          <td className="num">{feed.carbs} g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ---------------- Recordes ---------------- */}
      {records.length > 0 && (
        <div className="panel">
          <h3>Seus recordes</h3>
          <p className="desc">
            Melhores marcas em cada distância, varridas dentro dos treinos — não precisam ter sido o
            treino inteiro, apenas o melhor trecho contínuo.
          </p>
          <div className="climb-row">
            {records.map((record) => (
              <div className="climb-item" key={record.label}>
                <div className="d">{record.label.toUpperCase()}</div>
                <div className="s good">{record.value}</div>
                <div className="meta">
                  {record.activityId ? (
                    <Link href={`/treino/${record.activityId}`}>{record.detail}</Link>
                  ) : (
                    record.detail
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="note">
        Plano montado a partir do seu histórico, não de tabela pronta · As quantidades de carboidrato
        seguem a faixa usual em esporte de resistência (30 a 90 g por hora conforme a duração) e
        valem como ponto de partida — quem tem condição de saúde que afete alimentação ou esforço
        deve ajustar com profissional
      </div>
    </>
  );
}
