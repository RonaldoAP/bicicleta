import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { GpxError, parseGpx } from "@/lib/gpx";
import { analyze, DEFAULT_PROFILE, type Profile } from "@/lib/metrics";
import { OWNER_ID } from "@/lib/owner";
import { activityFields, storagePathFor } from "@/lib/persist";
import { isUnlocked } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_FILE_BYTES = 12 * 1024 * 1024;

/** Nome no espírito do Strava, quando o arquivo não traz um. */
function defaultName(startedAt: string): string {
  const hour = Number(
    new Date(startedAt).toLocaleString("pt-BR", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }),
  );
  if (hour < 12) return "Pedalada matinal";
  if (hour < 18) return "Pedalada da tarde";
  return "Pedalada noturna";
}

export async function POST(request: Request) {
  if (!(await isUnlocked())) {
    return NextResponse.json({ error: "Acesso bloqueado. Informe a senha." }, { status: 401 });
  }

  const supabase = await createClient();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o envio." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo recebido." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Arquivo acima de 12 MB. Exporte o GPX sem dados extras ou divida o treino." },
      { status: 413 },
    );
  }

  const customName = formData.get("name");

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

  let raw: string;
  try {
    raw = await file.text();
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o conteúdo do arquivo." }, { status: 400 });
  }

  const fileHash = createHash("sha256").update(raw).digest("hex");

  const { data: existing } = await supabase
    .from("activities")
    .select("id, name")
    .eq("user_id", OWNER_ID)
    .eq("file_hash", fileHash)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: `Esse arquivo já foi importado como “${existing.name}”.`,
        activityId: existing.id,
        duplicate: true,
      },
      { status: 409 },
    );
  }

  let analysis;
  try {
    const parsed = parseGpx(raw);
    analysis = { ...analyze(parsed.points, profile), gpxName: parsed.name, sport: parsed.sport };
  } catch (err) {
    const message =
      err instanceof GpxError || err instanceof Error
        ? err.message
        : "Não foi possível analisar o arquivo.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const { metrics, streams, climbs, gpxName, sport } = analysis;

  const name =
    (typeof customName === "string" && customName.trim()) ||
    gpxName?.trim() ||
    defaultName(metrics.started_at);

  const { data: activity, error: insertError } = await supabase
    .from("activities")
    .insert({
      user_id: OWNER_ID,
      name,
      sport: sport?.toLowerCase().includes("run") ? "running" : "cycling",
      file_name: file.name,
      file_hash: fileHash,
      ...activityFields(metrics),
    })
    .select("id")
    .single();

  if (insertError || !activity) {
    return NextResponse.json(
      { error: `Falha ao gravar o treino: ${insertError?.message ?? "erro desconhecido"}` },
      { status: 500 },
    );
  }

  const { error: streamError } = await supabase.from("activity_streams").insert({
    activity_id: activity.id,
    n: streams.time_s.length,
    ...streams,
  });

  if (streamError) {
    // Sem as séries o treino fica pela metade; melhor desfazer do que guardar torto.
    await supabase.from("activities").delete().eq("id", activity.id);
    return NextResponse.json(
      { error: `Falha ao gravar as séries do treino: ${streamError.message}` },
      { status: 500 },
    );
  }

  if (climbs.length > 0) {
    const { error: climbError } = await supabase.from("climbs").insert(
      climbs.map((climb) => ({ ...climb, activity_id: activity.id, user_id: OWNER_ID })),
    );
    if (climbError) {
      // As subidas são derivadas: o treino segue válido sem elas.
      console.error("Falha ao gravar subidas:", climbError.message);
    }
  }

  // Guarda o arquivo original para permitir reprocessar depois. Se falhar, o
  // treino continua válido — só perde a chance de ser recalculado.
  const storagePath = storagePathFor(OWNER_ID, activity.id);
  const { error: storageError } = await supabase.storage
    .from("gpx")
    .upload(storagePath, raw, { contentType: "application/gpx+xml", upsert: true });

  if (storageError) {
    console.error("Falha ao guardar o GPX original:", storageError.message);
  } else {
    await supabase.from("activities").update({ storage_path: storagePath }).eq("id", activity.id);
  }

  return NextResponse.json({
    activityId: activity.id,
    name,
    distanceKm: metrics.distance_m / 1000,
    movingS: metrics.moving_s,
    elevationGainM: metrics.elevation_gain_m,
    avgHr: metrics.avg_hr,
    climbs: climbs.length,
    hasHr: metrics.has_hr,
    hasPower: metrics.has_power,
    powerIsEstimated: metrics.power_is_estimated,
  });
}
