import { NextResponse } from "next/server";
import { parseGpx } from "@/lib/gpx";
import { analyze, DEFAULT_PROFILE, type Profile } from "@/lib/metrics";
import { OWNER_ID } from "@/lib/owner";
import { activityFields } from "@/lib/persist";
import { isUnlocked } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Quantos treinos por chamada, para a função não estourar o tempo limite. */
const BATCH = 25;

/**
 * Reprocessa os treinos a partir do GPX original guardado no upload. É o que
 * permite mudar FC máxima, peso ou FTP — ou adicionar uma métrica nova ao motor
 * de análise — e ver o histórico inteiro atualizado.
 */
export async function POST() {
  if (!(await isUnlocked())) {
    return NextResponse.json({ error: "Acesso bloqueado. Informe a senha." }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("weight_kg, bike_weight_kg, hr_max, hr_rest, hr_threshold, ftp_w, cda, crr")
    .eq("id", OWNER_ID)
    .maybeSingle();

  const profile: Profile = profileRow
    ? {
        weight_kg: Number(profileRow.weight_kg),
        bike_weight_kg: Number(profileRow.bike_weight_kg),
        hr_max: Number(profileRow.hr_max),
        hr_rest: Number(profileRow.hr_rest),
        hr_threshold: Number(profileRow.hr_threshold),
        ftp_w: profileRow.ftp_w === null ? null : Number(profileRow.ftp_w),
        cda: Number(profileRow.cda),
        crr: Number(profileRow.crr),
      }
    : DEFAULT_PROFILE;

  const { data: activities, error: listError } = await supabase
    .from("activities")
    .select("id, name, storage_path")
    .order("started_at", { ascending: false });

  if (listError) {
    return NextResponse.json({ error: `Não foi possível listar os treinos: ${listError.message}` }, { status: 500 });
  }

  const all = activities ?? [];
  const reprocessable = all.filter((a) => a.storage_path);
  const batch = reprocessable.slice(0, BATCH);

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const activity of batch) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from("gpx")
        .download(activity.storage_path as string);

      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? "arquivo não encontrado no armazenamento");
      }

      const parsed = parseGpx(await blob.text());
      const { metrics, streams, climbs } = analyze(parsed.points, profile);

      const { error: updateError } = await supabase
        .from("activities")
        .update(activityFields(metrics))
        .eq("id", activity.id);
      if (updateError) throw new Error(updateError.message);

      const { error: streamError } = await supabase
        .from("activity_streams")
        .upsert({ activity_id: activity.id, n: streams.time_s.length, ...streams });
      if (streamError) throw new Error(streamError.message);

      // As subidas são recalculadas do zero: os limites de detecção podem ter
      // mudado, então manter as antigas misturaria dois critérios.
      await supabase.from("climbs").delete().eq("activity_id", activity.id);
      if (climbs.length > 0) {
        const { error: climbError } = await supabase
          .from("climbs")
          .insert(climbs.map((climb) => ({ ...climb, activity_id: activity.id, user_id: OWNER_ID })));
        if (climbError) throw new Error(climbError.message);
      }

      updated++;
    } catch (err) {
      failed++;
      errors.push(`${activity.name}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    total: all.length,
    updated,
    failed,
    skipped: all.length - reprocessable.length,
    remaining: Math.max(0, reprocessable.length - batch.length),
    errors: errors.slice(0, 5),
  });
}
