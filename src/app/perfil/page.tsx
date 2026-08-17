import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { ProfileForm } from "@/components/profile-form";
import { hrZoneBounds } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profileData }, { count }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("activities").select("id", { count: "exact", head: true }),
  ]);

  const profile = profileData as ProfileRow | null;
  const zones = hrZoneBounds(profile?.hr_max ?? 195);

  return (
    <>
      <div className="head">
        <div className="title-block">
          <div className="kicker">Parâmetros do atleta</div>
          <h1>
            Seu <span>perfil</span>
          </h1>
        </div>
        <div className="rider">
          <b>{user.email}</b>
          {count ?? 0} {count === 1 ? "treino importado" : "treinos importados"}
        </div>
      </div>

      <Nav />

      <div className="grid2">
        <ProfileForm profile={profile} userId={user.id} activityCount={count ?? 0} />

        <div className="panel">
          <h3>Suas zonas de frequência cardíaca</h3>
          <p className="desc">
            Calculadas como percentual da FC máxima. Alterar a FC máxima muda todas as faixas — depois
            use “recalcular treinos” para reprocessar o histórico com os novos valores.
          </p>
          <table style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Zona</th>
                <th>Faixa (bpm)</th>
                <th>Para que serve</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.zone}>
                  <td>
                    <b>{zone.zone}</b> · {zone.name}
                  </td>
                  <td className="num">
                    {zone.min}
                    {zone.max ? `–${zone.max}` : "+"}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>
                    {
                      {
                        Z1: "Regeneração, aquecimento e volta à calma",
                        Z2: "Base aeróbica — onde a resistência se constrói",
                        Z3: "Ritmo forte sustentável, cansa mais do que rende",
                        Z4: "Limiar: o esforço que dá para manter cerca de uma hora",
                        Z5: "Máximo, em blocos curtos",
                      }[zone.zone]
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note">
        Peso, arrasto e resistência de rolamento só afetam treinos sem medidor de potência, em que os
        watts são estimados pela física do percurso
      </div>
    </>
  );
}
