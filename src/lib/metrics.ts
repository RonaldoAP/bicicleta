import type { RawPoint } from "./gpx";

/* ------------------------------------------------------------------ *
 * Constantes físicas e limites de filtragem
 * ------------------------------------------------------------------ */

const EARTH_RADIUS_M = 6371008.8; // raio médio da Terra (IUGG)
const GRAVITY = 9.80665;
const AIR_DENSITY = 1.225; // kg/m³ ao nível do mar, 15 °C
const DRIVETRAIN_EFFICIENCY = 0.97;

/** Acima disso o ponto é ruído de GPS, não deslocamento real. */
const MAX_PLAUSIBLE_SPEED_KMH = 120;
/** Abaixo disso a bike está parada (semáforo, foto, descanso). */
const MOVING_THRESHOLD_KMH = 1.5;
/** Intervalo maior que isso indica pausa na gravação, não tempo pedalando. */
const MAX_SAMPLE_GAP_S = 30;
/** Histerese do ganho de elevação: ignora oscilação menor que isso. */
const ELEVATION_HYSTERESIS_M = 1.0;
/** Janela (em metros) da média móvel que suaviza a altimetria do GPS. */
const ELEVATION_SMOOTH_M = 20;
/** Distância mínima para calcular inclinação sem estourar a divisão. */
const GRADE_WINDOW_M = 30;
const MAX_PLAUSIBLE_POWER_W = 1800;

/* ------------------------------------------------------------------ *
 * Tipos
 * ------------------------------------------------------------------ */

export interface Profile {
  weight_kg: number;
  bike_weight_kg: number;
  hr_max: number;
  hr_rest: number;
  hr_threshold: number;
  ftp_w: number | null;
  cda: number;
  crr: number;
}

export const DEFAULT_PROFILE: Profile = {
  weight_kg: 75,
  bike_weight_kg: 10,
  hr_max: 195,
  hr_rest: 55,
  hr_threshold: 166,
  ftp_w: null,
  cda: 0.32,
  crr: 0.005,
};

export interface Streams {
  time_s: number[];
  dist_m: number[];
  lat: number[];
  lon: number[];
  ele: number[];
  speed_kmh: number[];
  hr: (number | null)[];
  cadence: (number | null)[];
  power_w: number[];
  grade: number[];
}

export interface ZoneBucket {
  zone: string;
  name: string;
  min: number;
  max: number | null;
  seconds: number;
  pct: number;
}

export interface Split {
  km: number;
  distance_m: number;
  moving_s: number;
  speed_kmh: number;
  elev_gain_m: number;
  avg_hr: number | null;
  avg_power_w: number | null;
}

export interface Quarter {
  quarter: number;
  distance_m: number;
  moving_s: number;
  speed_kmh: number;
  avg_hr: number | null;
}

export interface Climb {
  ord: number;
  start_idx: number;
  end_idx: number;
  start_dist_m: number;
  distance_m: number;
  elev_gain_m: number;
  avg_grade: number;
  max_grade: number;
  duration_s: number;
  speed_kmh: number;
  vam: number;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power_w: number | null;
  category: string;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  route_key: string;
}

export interface ActivityMetrics {
  started_at: string;
  distance_m: number;
  elapsed_s: number;
  moving_s: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr: number | null;
  avg_cadence: number | null;
  avg_power_w: number | null;
  np_power_w: number | null;
  max_power_w: number | null;
  work_kj: number | null;
  tss: number | null;
  intensity_factor: number | null;
  efficiency_index: number | null;
  decoupling_pct: number | null;
  fade_pct: number | null;
  calories: number | null;
  hr_zones: ZoneBucket[];
  power_zones: ZoneBucket[];
  splits: Split[];
  quarters: Quarter[];
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  polyline: [number, number][];
  has_hr: boolean;
  has_power: boolean;
  has_cadence: boolean;
  power_is_estimated: boolean;
  load_method: "power" | "hr" | null;
}

export interface Analysis {
  metrics: ActivityMetrics;
  streams: Streams;
  climbs: Climb[];
}

/* ------------------------------------------------------------------ *
 * Geometria e utilidades numéricas
 * ------------------------------------------------------------------ */

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function round(value: number | null, decimals = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Média móvel centrada, em número de amostras. */
function smoothByCount(values: number[], halfWindow: number): number[] {
  const n = values.length;
  if (halfWindow <= 0 || n === 0) return values.slice();
  const out = new Array<number>(n);
  const prefix = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[i];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(n - 1, i + halfWindow);
    out[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
  }
  return out;
}

/** Média móvel centrada usando a distância ao longo do trajeto como janela. */
function smoothByDistance(values: number[], dist: number[], halfWindowM: number): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  const prefix = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[i];

  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (lo < i && dist[i] - dist[lo] > halfWindowM) lo++;
    if (hi < i) hi = i;
    while (hi + 1 < n && dist[hi + 1] - dist[i] <= halfWindowM) hi++;
    out[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Zonas
 * ------------------------------------------------------------------ */

/**
 * Zonas de frequência cardíaca em % da FC máxima. O limite de 60/75/85/92 %
 * é o modelo clássico de 5 zonas usado em treino de resistência.
 */
const HR_ZONE_DEFS = [
  { zone: "Z1", name: "Recuperação", lo: 0.0, hi: 0.6, load: 0.35 },
  { zone: "Z2", name: "Base aeróbica", lo: 0.6, hi: 0.75, load: 0.55 },
  { zone: "Z3", name: "Tempo", lo: 0.75, hi: 0.85, load: 0.78 },
  { zone: "Z4", name: "Limiar", lo: 0.85, hi: 0.92, load: 1.0 },
  { zone: "Z5", name: "VO₂máx", lo: 0.92, hi: Infinity, load: 1.2 },
] as const;

/** Zonas de potência em % do FTP (modelo de 7 zonas de Coggan, condensado em 6). */
const POWER_ZONE_DEFS = [
  { zone: "Z1", name: "Recuperação", lo: 0.0, hi: 0.55 },
  { zone: "Z2", name: "Endurance", lo: 0.55, hi: 0.75 },
  { zone: "Z3", name: "Tempo", lo: 0.75, hi: 0.9 },
  { zone: "Z4", name: "Limiar", lo: 0.9, hi: 1.05 },
  { zone: "Z5", name: "VO₂máx", lo: 1.05, hi: 1.2 },
  { zone: "Z6", name: "Anaeróbico", lo: 1.2, hi: Infinity },
] as const;

export function hrZoneBounds(hrMax: number) {
  return HR_ZONE_DEFS.map((def) => ({
    zone: def.zone,
    name: def.name,
    min: Math.round(def.lo * hrMax),
    max: def.hi === Infinity ? null : Math.round(def.hi * hrMax),
  }));
}

function buildZones(
  defs: readonly { zone: string; name: string; lo: number; hi: number }[],
  reference: number,
  samples: { value: number; dt: number }[],
): ZoneBucket[] {
  const seconds = new Array<number>(defs.length).fill(0);
  let total = 0;
  for (const { value, dt } of samples) {
    const ratio = value / reference;
    let idx = defs.findIndex((d) => ratio >= d.lo && ratio < d.hi);
    if (idx === -1) idx = ratio >= defs[defs.length - 1].lo ? defs.length - 1 : 0;
    seconds[idx] += dt;
    total += dt;
  }
  return defs.map((def, i) => ({
    zone: def.zone,
    name: def.name,
    min: Math.round(def.lo * reference),
    max: def.hi === Infinity ? null : Math.round(def.hi * reference),
    seconds: Math.round(seconds[i]),
    pct: total > 0 ? round((seconds[i] / total) * 100, 1)! : 0,
  }));
}

/* ------------------------------------------------------------------ *
 * Potência
 * ------------------------------------------------------------------ */

/**
 * Estima a potência a partir da física do ciclismo: resistência de rolamento,
 * arrasto aerodinâmico, gravidade na subida e aceleração. Sem dados de vento,
 * então em dia de vento forte o número desvia — serve para comparar treinos
 * entre si, não como substituto de medidor de potência.
 */
function estimatePower(
  speedMs: number[],
  grade: number[],
  dt: number[],
  profile: Profile,
): number[] {
  const mass = profile.weight_kg + profile.bike_weight_kg;
  const out = new Array<number>(speedMs.length).fill(0);

  for (let i = 1; i < speedMs.length; i++) {
    const v = speedMs[i];
    if (v <= 0 || dt[i] <= 0) continue;

    const theta = Math.atan(grade[i]);
    const accel = (v - speedMs[i - 1]) / dt[i];

    const rolling = profile.crr * mass * GRAVITY * Math.cos(theta) * v;
    const aero = 0.5 * AIR_DENSITY * profile.cda * v ** 3;
    const climbing = mass * GRAVITY * Math.sin(theta) * v;
    const accelerating = mass * accel * v;

    const watts = (rolling + aero + climbing + accelerating) / DRIVETRAIN_EFFICIENCY;
    out[i] = Math.min(MAX_PLAUSIBLE_POWER_W, Math.max(0, watts));
  }
  return smoothByCount(out, 2);
}

/**
 * Potência normalizada: média móvel de 30 s elevada à quarta potência, que pesa
 * os picos de esforço mais do que a média simples faria.
 */
function normalizedPower(power: number[], time: number[]): number | null {
  if (power.length < 30) return null;

  const rolled: number[] = [];
  let lo = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < power.length; i++) {
    sum += power[i];
    count++;
    while (lo < i && time[i] - time[lo] > 30) {
      sum -= power[lo];
      count--;
      lo++;
    }
    if (time[i] - time[lo] >= 25) rolled.push(sum / count);
  }
  if (rolled.length === 0) return null;

  let quartic = 0;
  for (const p of rolled) quartic += p ** 4;
  return (quartic / rolled.length) ** 0.25;
}

/* ------------------------------------------------------------------ *
 * Detecção de subidas
 * ------------------------------------------------------------------ */

const CLIMB_REVERSAL_M = 8; // queda que encerra uma subida
const CLIMB_MIN_GAIN_M = 15;
const CLIMB_MIN_DIST_M = 200;
const CLIMB_MIN_GRADE = 0.02;
const CLIMB_MERGE_DIP_M = 12;
const CLIMB_MERGE_GAP_M = 400;

/**
 * Reduz o perfil de elevação a uma alternância de vales e cumes, ignorando
 * oscilações menores que `tau` (zigzag).
 *
 * Empates avançam o índice de propósito: num trecho plano antes da subida, o
 * vale precisa ser o último ponto do plano, não o primeiro. Ancorar no primeiro
 * faria a rampa herdar todo o plano e diluiria a inclinação média.
 */
function elevationPivots(ele: number[], tau: number): number[] {
  const n = ele.length;
  if (n < 2) return [0, n - 1];

  const pivots: number[] = [];
  let dir = 0; // 0 indefinido, 1 subindo, -1 descendo
  let minIdx = 0;
  let maxIdx = 0;

  for (let i = 1; i < n; i++) {
    const e = ele[i];

    if (dir === 0) {
      if (e <= ele[minIdx]) minIdx = i;
      if (e >= ele[maxIdx]) maxIdx = i;
      if (ele[maxIdx] - ele[minIdx] >= tau) {
        if (maxIdx > minIdx) {
          pivots.push(minIdx);
          dir = 1;
        } else {
          pivots.push(maxIdx);
          dir = -1;
        }
      }
      continue;
    }

    if (dir === 1) {
      if (e >= ele[maxIdx]) {
        maxIdx = i;
      } else if (ele[maxIdx] - e >= tau) {
        pivots.push(maxIdx);
        dir = -1;
        minIdx = i;
      }
      continue;
    }

    if (e <= ele[minIdx]) {
      minIdx = i;
    } else if (e - ele[minIdx] >= tau) {
      pivots.push(minIdx);
      dir = 1;
      maxIdx = i;
    }
  }

  pivots.push(dir === 1 ? maxIdx : dir === -1 ? minIdx : n - 1);

  // Mantém a sequência estritamente crescente, para os pares virarem trechos válidos.
  return pivots.filter((idx, i) => i === 0 || idx > pivots[i - 1]);
}

/**
 * Classificação no espírito das categorias de montanha: o índice
 * `distância × inclinação%` equivale a 100 × ganho em metros. Abaixo de 80 m de
 * ganho nenhuma escala oficial categoriza, então esses trechos recebem rótulos
 * descritivos em vez de uma categoria inventada.
 */
function categorize(gain: number): string {
  if (gain >= 1280) return "Fora de categoria";
  if (gain >= 640) return "1ª categoria";
  if (gain >= 320) return "2ª categoria";
  if (gain >= 160) return "3ª categoria";
  if (gain >= 80) return "4ª categoria";
  if (gain >= 40) return "subida curta";
  return "rampa";
}

export function routeKeyFor(lat: number, lon: number): string {
  // Célula de ~1,1 km, só para agrupar candidatos; a comparação fina é por distância.
  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
}

function detectClimbs(streams: Streams, smoothEle: number[]): Climb[] {
  const { dist_m, time_s, hr, power_w, lat, lon, grade } = streams;
  const pivots = elevationPivots(smoothEle, CLIMB_REVERSAL_M);

  type Range = { start: number; end: number };
  const ranges: Range[] = [];
  for (let i = 0; i < pivots.length - 1; i++) {
    const start = pivots[i];
    const end = pivots[i + 1];
    if (smoothEle[end] > smoothEle[start]) ranges.push({ start, end });
  }

  // Junta subidas separadas por um respiro curto — sobe, alivia, sobe de novo
  // é uma subida só na percepção de quem pedala.
  const merged: Range[] = [];
  for (const range of ranges) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const dip = smoothEle[prev.end] - smoothEle[range.start];
      const gap = dist_m[range.start] - dist_m[prev.end];
      if (dip <= CLIMB_MERGE_DIP_M && gap <= CLIMB_MERGE_GAP_M) {
        prev.end = range.end;
        continue;
      }
    }
    merged.push({ ...range });
  }

  const climbs: Climb[] = [];
  for (const { start, end } of merged) {
    const distance = dist_m[end] - dist_m[start];
    const gain = smoothEle[end] - smoothEle[start];
    if (distance < CLIMB_MIN_DIST_M || gain < CLIMB_MIN_GAIN_M) continue;

    const avgGrade = gain / distance;
    if (avgGrade < CLIMB_MIN_GRADE) continue;

    const duration = time_s[end] - time_s[start];
    const hrSlice = hr.slice(start, end + 1).filter((v): v is number => v !== null);
    const powerSlice = power_w.slice(start, end + 1).filter((v) => v > 0);
    const maxGrade = Math.max(...grade.slice(start, end + 1));

    climbs.push({
      ord: climbs.length,
      start_idx: start,
      end_idx: end,
      start_dist_m: round(dist_m[start], 1)!,
      distance_m: round(distance, 1)!,
      elev_gain_m: round(gain, 1)!,
      avg_grade: round(avgGrade * 100, 2)!,
      max_grade: round(maxGrade * 100, 2)!,
      duration_s: Math.round(duration),
      speed_kmh: duration > 0 ? round((distance / duration) * 3.6, 2)! : 0,
      vam: duration > 0 ? round((gain / duration) * 3600, 0)! : 0,
      avg_hr: hrSlice.length ? Math.round(mean(hrSlice)!) : null,
      max_hr: hrSlice.length ? Math.max(...hrSlice) : null,
      avg_power_w: powerSlice.length ? round(mean(powerSlice), 0) : null,
      category: categorize(gain),
      start_lat: lat[start],
      start_lon: lon[start],
      end_lat: lat[end],
      end_lon: lon[end],
      route_key: routeKeyFor(lat[start], lon[start]),
    });
  }
  return climbs;
}

/* ------------------------------------------------------------------ *
 * Pipeline principal
 * ------------------------------------------------------------------ */

/** Descarta pontos que só podem ser erro de GPS. */
function cleanPoints(points: RawPoint[]): RawPoint[] {
  const out: RawPoint[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(point);
      continue;
    }
    if (prev.time !== null && point.time !== null) {
      const dt = (point.time - prev.time) / 1000;
      if (dt < 0) continue; // fora de ordem
      if (dt === 0) continue; // duplicado
      const speedKmh = (haversine(prev.lat, prev.lon, point.lat, point.lon) / dt) * 3.6;
      if (speedKmh > MAX_PLAUSIBLE_SPEED_KMH) continue; // salto impossível
    }
    out.push(point);
  }
  return out;
}

/**
 * Transforma os pontos crus em séries derivadas e no resumo do treino.
 * Todo o resto da plataforma consome a saída daqui.
 */
export function analyze(points: RawPoint[], profile: Profile): Analysis {
  const clean = cleanPoints(points);
  if (clean.length < 2) {
    throw new Error("Depois de descartar o ruído de GPS não sobraram pontos suficientes.");
  }

  const n = clean.length;
  const hasTime = clean.every((p) => p.time !== null);
  const startMs = hasTime ? (clean[0].time as number) : Date.now();

  // --- séries base ---
  const time_s = new Array<number>(n);
  const dist_m = new Array<number>(n);
  const lat = new Array<number>(n);
  const lon = new Array<number>(n);
  const rawEle = new Array<number>(n);
  const dt = new Array<number>(n).fill(0);
  const step = new Array<number>(n).fill(0);

  let lastEle = clean.find((p) => p.ele !== null)?.ele ?? 0;
  for (let i = 0; i < n; i++) {
    const p = clean[i];
    lat[i] = p.lat;
    lon[i] = p.lon;
    if (p.ele !== null) lastEle = p.ele;
    rawEle[i] = lastEle;

    if (i === 0) {
      time_s[i] = 0;
      dist_m[i] = 0;
    } else {
      const prev = clean[i - 1];
      const seconds = hasTime ? ((p.time as number) - (prev.time as number)) / 1000 : 1;
      dt[i] = seconds;
      time_s[i] = time_s[i - 1] + seconds;
      step[i] = haversine(prev.lat, prev.lon, p.lat, p.lon);
      dist_m[i] = dist_m[i - 1] + step[i];
    }
  }

  const smoothEle = smoothByDistance(rawEle, dist_m, ELEVATION_SMOOTH_M);

  // --- velocidade ---
  const rawSpeedMs = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    if (dt[i] > 0 && dt[i] <= MAX_SAMPLE_GAP_S) rawSpeedMs[i] = step[i] / dt[i];
  }
  const speedMs = smoothByCount(rawSpeedMs, 2);
  const speed_kmh = speedMs.map((v) => round(v * 3.6, 2)!);

  // --- inclinação, em janela de distância mínima ---
  const grade = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let lo = i;
    let hi = i;
    while (lo > 0 && dist_m[i] - dist_m[lo] < GRADE_WINDOW_M / 2) lo--;
    while (hi < n - 1 && dist_m[hi] - dist_m[i] < GRADE_WINDOW_M / 2) hi++;
    const run = dist_m[hi] - dist_m[lo];
    grade[i] = run >= 5 ? (smoothEle[hi] - smoothEle[lo]) / run : 0;
  }

  // --- elevação acumulada, com histerese contra a oscilação do GPS ---
  let gain = 0;
  let loss = 0;
  let reference = smoothEle[0];
  for (let i = 1; i < n; i++) {
    const delta = smoothEle[i] - reference;
    if (delta >= ELEVATION_HYSTERESIS_M) {
      gain += delta;
      reference = smoothEle[i];
    } else if (delta <= -ELEVATION_HYSTERESIS_M) {
      loss += -delta;
      reference = smoothEle[i];
    }
  }

  // --- tempo em movimento ---
  const moving = new Array<boolean>(n).fill(false);
  let movingSeconds = 0;
  let elapsedSeconds = 0;
  for (let i = 1; i < n; i++) {
    const gapOk = dt[i] > 0 && dt[i] <= MAX_SAMPLE_GAP_S;
    elapsedSeconds += dt[i];
    if (gapOk && speed_kmh[i] >= MOVING_THRESHOLD_KMH) {
      moving[i] = true;
      movingSeconds += dt[i];
    }
  }

  // --- sensores ---
  const hr = clean.map((p) => p.hr);
  const cadence = clean.map((p) => p.cadence);
  const hasHr = hr.some((v) => v !== null && v > 0);
  const hasCadence = cadence.some((v) => v !== null && v > 0);
  const recordedPower = clean.map((p) => p.power);
  const hasRecordedPower = recordedPower.some((v) => v !== null && v > 0);

  const power_w = hasRecordedPower
    ? recordedPower.map((v) => (v === null ? 0 : Math.max(0, Math.min(MAX_PLAUSIBLE_POWER_W, v))))
    : estimatePower(speedMs, grade, dt, profile);

  const streams: Streams = {
    time_s: time_s.map((v) => round(v, 0)!),
    dist_m: dist_m.map((v) => round(v, 1)!),
    lat,
    lon,
    ele: smoothEle.map((v) => round(v, 1)!),
    speed_kmh,
    hr,
    cadence,
    power_w: power_w.map((v) => round(v, 0)!),
    grade: grade.map((v) => round(v * 100, 2)!),
  };

  // --- médias ponderadas por tempo, só do que estava em movimento ---
  const movingIdx: number[] = [];
  for (let i = 1; i < n; i++) if (moving[i]) movingIdx.push(i);

  const hrSamples = movingIdx
    .filter((i) => hr[i] !== null && (hr[i] as number) > 0)
    .map((i) => ({ value: hr[i] as number, dt: dt[i] }));
  const powerSamples = movingIdx.map((i) => ({ value: power_w[i], dt: dt[i] }));

  const weightedMean = (samples: { value: number; dt: number }[]): number | null => {
    let num = 0;
    let den = 0;
    for (const s of samples) {
      num += s.value * s.dt;
      den += s.dt;
    }
    return den > 0 ? num / den : null;
  };

  const avgHr = weightedMean(hrSamples);
  const hrValues = hrSamples.map((s) => s.value);
  const cadenceValues = movingIdx
    .filter((i) => cadence[i] !== null && (cadence[i] as number) > 0)
    .map((i) => cadence[i] as number);

  const distanceTotal = dist_m[n - 1];
  const avgSpeed = movingSeconds > 0 ? (distanceTotal / movingSeconds) * 3.6 : null;
  const maxSpeed = Math.max(...speed_kmh);

  const avgPower = hasHr || hasRecordedPower ? weightedMean(powerSamples) : weightedMean(powerSamples);
  const np = hasTime ? normalizedPower(streams.power_w, streams.time_s) : null;
  let workKj = 0;
  for (const i of movingIdx) workKj += (power_w[i] * dt[i]) / 1000;

  // --- zonas ---
  const hrZones = hasHr ? buildZones(HR_ZONE_DEFS, profile.hr_max, hrSamples) : [];
  const powerZones =
    profile.ftp_w && profile.ftp_w > 0 ? buildZones(POWER_ZONE_DEFS, profile.ftp_w, powerSamples) : [];

  // --- carga de treino ---
  let tss: number | null = null;
  let intensityFactor: number | null = null;
  let loadMethod: "power" | "hr" | null = null;

  if (hasRecordedPower && profile.ftp_w && profile.ftp_w > 0 && np) {
    intensityFactor = np / profile.ftp_w;
    tss = ((movingSeconds * np * intensityFactor) / (profile.ftp_w * 3600)) * 100;
    loadMethod = "power";
  } else if (hasHr && hrZones.length) {
    // Uma hora em Z4 (limiar) equivale a 100 de carga; as outras zonas entram
    // com peso proporcional ao esforço relativo.
    let load = 0;
    hrZones.forEach((bucket, i) => {
      load += (bucket.seconds / 60) * HR_ZONE_DEFS[i].load;
    });
    tss = load * (100 / 60);
    intensityFactor = avgHr ? avgHr / profile.hr_threshold : null;
    loadMethod = "hr";
  }

  // --- eficiência e deriva cardíaca ---
  const efficiencyIndex = avgSpeed && avgHr ? (avgSpeed / avgHr) * 100 : null;

  let decoupling: number | null = null;
  if (hrSamples.length > 20 && movingIdx.length > 20) {
    const half = movingSeconds / 2;
    const firstHalf: number[] = [];
    const secondHalf: number[] = [];
    const firstHr: { value: number; dt: number }[] = [];
    const secondHr: { value: number; dt: number }[] = [];
    let acc = 0;
    for (const i of movingIdx) {
      acc += dt[i];
      const target = acc <= half ? firstHalf : secondHalf;
      target.push(i);
      if (hr[i] !== null && (hr[i] as number) > 0) {
        (acc <= half ? firstHr : secondHr).push({ value: hr[i] as number, dt: dt[i] });
      }
    }
    const segmentEf = (idx: number[], hrs: { value: number; dt: number }[]) => {
      if (idx.length === 0 || hrs.length === 0) return null;
      let distance = 0;
      let seconds = 0;
      for (const i of idx) {
        distance += step[i];
        seconds += dt[i];
      }
      const h = weightedMean(hrs);
      if (!h || seconds === 0) return null;
      return ((distance / seconds) * 3.6) / h;
    };
    const ef1 = segmentEf(firstHalf, firstHr);
    const ef2 = segmentEf(secondHalf, secondHr);
    if (ef1 && ef2) decoupling = ((ef1 - ef2) / ef1) * 100;
  }

  // --- quartos do percurso, para medir a queda no final ---
  const quarters: Quarter[] = [];
  for (let q = 0; q < 4; q++) {
    const lo = (distanceTotal * q) / 4;
    const hi = (distanceTotal * (q + 1)) / 4;
    const idx = movingIdx.filter((i) => dist_m[i] > lo && dist_m[i] <= hi);
    let distance = 0;
    let seconds = 0;
    const hrs: { value: number; dt: number }[] = [];
    for (const i of idx) {
      distance += step[i];
      seconds += dt[i];
      if (hr[i] !== null && (hr[i] as number) > 0) hrs.push({ value: hr[i] as number, dt: dt[i] });
    }
    const h = weightedMean(hrs);
    quarters.push({
      quarter: q + 1,
      distance_m: round(distance, 0)!,
      moving_s: Math.round(seconds),
      speed_kmh: seconds > 0 ? round((distance / seconds) * 3.6, 2)! : 0,
      avg_hr: h ? Math.round(h) : null,
    });
  }
  const fade =
    quarters[0].speed_kmh > 0
      ? ((quarters[0].speed_kmh - quarters[3].speed_kmh) / quarters[0].speed_kmh) * 100
      : null;

  // --- parciais por quilômetro ---
  const splits: Split[] = [];
  const kmCount = Math.max(1, Math.ceil(distanceTotal / 1000));
  for (let km = 0; km < kmCount; km++) {
    const lo = km * 1000;
    const hi = (km + 1) * 1000;
    const idx: number[] = [];
    for (let i = 1; i < n; i++) if (dist_m[i] > lo && dist_m[i] <= hi) idx.push(i);
    if (idx.length === 0) continue;

    let distance = 0;
    let seconds = 0;
    const hrs: { value: number; dt: number }[] = [];
    const powers: { value: number; dt: number }[] = [];
    for (const i of idx) {
      if (!moving[i]) continue;
      distance += step[i];
      seconds += dt[i];
      if (hr[i] !== null && (hr[i] as number) > 0) hrs.push({ value: hr[i] as number, dt: dt[i] });
      powers.push({ value: power_w[i], dt: dt[i] });
    }
    const first = idx[0];
    const last = idx[idx.length - 1];
    let splitGain = 0;
    let ref = smoothEle[first];
    for (let i = first; i <= last; i++) {
      const delta = smoothEle[i] - ref;
      if (delta >= ELEVATION_HYSTERESIS_M) {
        splitGain += delta;
        ref = smoothEle[i];
      } else if (delta <= -ELEVATION_HYSTERESIS_M) {
        ref = smoothEle[i];
      }
    }
    const h = weightedMean(hrs);
    const p = weightedMean(powers);
    splits.push({
      km: km + 1,
      distance_m: round(distance, 0)!,
      moving_s: Math.round(seconds),
      speed_kmh: seconds > 0 ? round((distance / seconds) * 3.6, 2)! : 0,
      elev_gain_m: round(splitGain, 0)!,
      avg_hr: h ? Math.round(h) : null,
      avg_power_w: p ? Math.round(p) : null,
    });
  }

  // --- traçado enxuto para o mapa ---
  const polyline: [number, number][] = [];
  const stride = Math.max(1, Math.floor(n / 500));
  for (let i = 0; i < n; i += stride) polyline.push([round(lat[i], 5)!, round(lon[i], 5)!]);
  if (polyline.length && (polyline[polyline.length - 1][0] !== round(lat[n - 1], 5))) {
    polyline.push([round(lat[n - 1], 5)!, round(lon[n - 1], 5)!]);
  }

  const climbs = detectClimbs(streams, smoothEle);

  // Gasto energético: o trabalho mecânico dividido pela eficiência metabólica
  // (~22 %, o valor consagrado para ciclismo) dá a energia gasta em kJ, que
  // convertida para kcal cai perto de 1 kcal por kJ de trabalho — é daí que vem
  // o atalho conhecido de ler kJ como se fosse caloria.
  const METABOLIC_EFFICIENCY = 0.22;
  const KJ_PER_KCAL = 4.184;
  const calories =
    workKj > 0 ? Math.round(workKj / METABOLIC_EFFICIENCY / KJ_PER_KCAL) : null;

  const metrics: ActivityMetrics = {
    started_at: new Date(startMs).toISOString(),
    distance_m: round(distanceTotal, 1)!,
    elapsed_s: Math.round(elapsedSeconds),
    moving_s: Math.round(movingSeconds),
    elevation_gain_m: round(gain, 1)!,
    elevation_loss_m: round(loss, 1)!,
    avg_speed_kmh: round(avgSpeed, 2),
    max_speed_kmh: round(maxSpeed, 2),
    avg_hr: avgHr ? Math.round(avgHr) : null,
    max_hr: hrValues.length ? Math.max(...hrValues) : null,
    min_hr: hrValues.length ? Math.min(...hrValues) : null,
    avg_cadence: cadenceValues.length ? Math.round(mean(cadenceValues)!) : null,
    avg_power_w: round(avgPower, 0),
    np_power_w: round(np, 0),
    max_power_w: round(Math.max(...power_w), 0),
    work_kj: round(workKj, 0),
    tss: round(tss, 1),
    intensity_factor: round(intensityFactor, 3),
    efficiency_index: round(efficiencyIndex, 2),
    decoupling_pct: round(decoupling, 1),
    fade_pct: round(fade, 1),
    calories,
    hr_zones: hrZones,
    power_zones: powerZones,
    splits,
    quarters,
    bounds: {
      minLat: Math.min(...lat),
      maxLat: Math.max(...lat),
      minLon: Math.min(...lon),
      maxLon: Math.max(...lon),
    },
    polyline,
    has_hr: hasHr,
    has_power: hasRecordedPower,
    has_cadence: hasCadence,
    power_is_estimated: !hasRecordedPower,
    load_method: loadMethod,
  };

  return { metrics, streams, climbs };
}
