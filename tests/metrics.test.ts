import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGpx } from "../src/lib/gpx.ts";
import { analyze, DEFAULT_PROFILE } from "../src/lib/metrics.ts";

/** Metros por grau de longitude na latitude usada nos testes (Gravataí, RS). */
const START_LAT = -29.944;
const START_LON = -50.992;
const M_PER_DEG_LON = 111_320 * Math.cos((START_LAT * Math.PI) / 180);

interface Leg {
  distanceM: number;
  speedMs: number;
  gradient: number; // fração: 0.06 = 6%
  hr: number;
}

/**
 * Monta um GPX sintético com geometria conhecida, deslocando só a longitude.
 * Assim distância, ganho de elevação e inclinação têm valor esperado exato e dá
 * para conferir se o motor reproduz a física do percurso.
 */
function buildGpx(legs: Leg[], options: { pauseAfterLeg?: number; pauseS?: number } = {}): string {
  const points: string[] = [];
  const start = Date.UTC(2026, 4, 24, 12, 0, 0);

  let lon = START_LON;
  let elevation = 20;
  let seconds = 0;

  points.push(pointXml(START_LAT, lon, elevation, start, legs[0].hr));

  legs.forEach((leg, legIndex) => {
    const steps = Math.round(leg.distanceM / leg.speedMs); // uma amostra por segundo
    const metersPerStep = leg.distanceM / steps;
    for (let i = 0; i < steps; i++) {
      lon += metersPerStep / M_PER_DEG_LON;
      elevation += metersPerStep * leg.gradient;
      seconds += 1;
      points.push(pointXml(START_LAT, lon, elevation, start + seconds * 1000, leg.hr));
    }
    if (options.pauseAfterLeg === legIndex && options.pauseS) {
      // Parada: o tempo corre sem que a posição mude.
      seconds += options.pauseS;
      points.push(pointXml(START_LAT, lon, elevation, start + seconds * 1000, leg.hr - 30));
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="teste" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Treino sintético</name><type>cycling</type><trkseg>
${points.join("\n")}
  </trkseg></trk>
</gpx>`;
}

function pointXml(lat: number, lon: number, ele: number, timeMs: number, hr: number): string {
  return `    <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">
      <ele>${ele.toFixed(2)}</ele>
      <time>${new Date(timeMs).toISOString()}</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr><gpxtpx:cad>82</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>
    </trkpt>`;
}

const COURSE: Leg[] = [
  { distanceM: 5000, speedMs: 6.944, gradient: 0, hr: 130 }, // 25 km/h no plano
  { distanceM: 1000, speedMs: 2.778, gradient: 0.06, hr: 165 }, // subida de 1 km a 6%
  { distanceM: 1000, speedMs: 11.111, gradient: -0.06, hr: 120 }, // descida
];

test("lê os pontos e as extensões de frequência cardíaca do GPX", () => {
  const parsed = parseGpx(buildGpx(COURSE));
  assert.equal(parsed.name, "Treino sintético");
  assert.equal(parsed.sport, "cycling");
  assert.ok(parsed.points.length > 1000, `esperava muitos pontos, veio ${parsed.points.length}`);
  assert.equal(parsed.points[0].hr, 130);
  assert.equal(parsed.points[0].cadence, 82);
  assert.ok(parsed.points[0].ele !== null);
  assert.ok(parsed.points[0].time !== null);
});

test("reproduz distância, elevação e velocidade do percurso conhecido", () => {
  const { points } = parseGpx(buildGpx(COURSE));
  const { metrics } = analyze(points, DEFAULT_PROFILE);

  // 7 km de percurso, com tolerância para a projeção esférica.
  assert.ok(
    Math.abs(metrics.distance_m - 7000) < 50,
    `distância ${metrics.distance_m} fora do esperado (7000 m)`,
  );

  // Ganho real de 60 m; a suavização e a histerese podem comer alguns metros.
  assert.ok(
    Math.abs(metrics.elevation_gain_m - 60) < 8,
    `ganho ${metrics.elevation_gain_m} fora do esperado (60 m)`,
  );
  assert.ok(
    Math.abs(metrics.elevation_loss_m - 60) < 8,
    `perda ${metrics.elevation_loss_m} fora do esperado (60 m)`,
  );

  // 720 s + 360 s + 90 s = 1170 s de movimento.
  assert.ok(
    Math.abs(metrics.moving_s - 1170) < 20,
    `tempo em movimento ${metrics.moving_s} fora do esperado (1170 s)`,
  );

  const expectedAvg = (7000 / 1170) * 3.6;
  assert.ok(
    Math.abs((metrics.avg_speed_kmh ?? 0) - expectedAvg) < 0.5,
    `velocidade média ${metrics.avg_speed_kmh} fora do esperado (${expectedAvg.toFixed(1)})`,
  );
});

test("detecta a subida com extensão e inclinação corretas", () => {
  const { points } = parseGpx(buildGpx(COURSE));
  const { climbs } = analyze(points, DEFAULT_PROFILE);

  assert.equal(climbs.length, 1, `esperava 1 subida, achou ${climbs.length}`);
  const climb = climbs[0];

  assert.ok(
    Math.abs(climb.distance_m - 1000) < 150,
    `extensão da subida ${climb.distance_m} fora do esperado (1000 m)`,
  );
  assert.ok(
    Math.abs(climb.avg_grade - 6) < 1,
    `inclinação média ${climb.avg_grade}% fora do esperado (6%)`,
  );
  assert.ok(
    Math.abs(climb.start_dist_m - 5000) < 200,
    `início da subida em ${climb.start_dist_m} m, esperado ~5000 m`,
  );
  // A rampa é constante em 6%: a inclinação máxima não pode fugir disso. Já
  // saiu como 294% por dupla conversão de fração para porcentagem.
  assert.ok(
    climb.max_grade > 4 && climb.max_grade < 9,
    `inclinação máxima ${climb.max_grade}% fora do esperado numa rampa de 6%`,
  );
  // 165 bpm na rampa; o limite do trecho pode pegar um ou dois pontos do plano.
  assert.ok(
    Math.abs((climb.avg_hr ?? 0) - 165) <= 2,
    `FC média na subida ${climb.avg_hr}, esperado ~165`,
  );
  assert.ok(climb.vam > 500, `VAM ${climb.vam} baixa demais para 6% a 10 km/h`);
});

test("distribui o tempo nas zonas de frequência cardíaca", () => {
  const { points } = parseGpx(buildGpx(COURSE));
  const { metrics } = analyze(points, DEFAULT_PROFILE);

  assert.equal(metrics.has_hr, true);
  assert.equal(metrics.avg_hr !== null, true);

  const total = metrics.hr_zones.reduce((sum, z) => sum + z.pct, 0);
  assert.ok(Math.abs(total - 100) < 1, `as zonas somam ${total}%, esperado 100%`);

  // FC máxima 195: 130 bpm cai em Z2 (117–146) e 165 bpm em Z3 (146–166).
  const z2 = metrics.hr_zones.find((z) => z.zone === "Z2");
  const z3 = metrics.hr_zones.find((z) => z.zone === "Z3");
  assert.ok((z2?.pct ?? 0) > 50, `Z2 ficou em ${z2?.pct}%, esperado maior que 50%`);
  assert.ok((z3?.pct ?? 0) > 20, `Z3 ficou em ${z3?.pct}%, esperado maior que 20%`);
});

test("estima potência coerente com a física da subida", () => {
  const { points } = parseGpx(buildGpx(COURSE));
  const { metrics, streams, climbs } = analyze(points, DEFAULT_PROFILE);

  assert.equal(metrics.has_power, false, "o arquivo não tem medidor de potência");
  assert.equal(metrics.power_is_estimated, true);

  // 85 kg subindo a 6% a 10 km/h: m·g·sen(θ)·v ≈ 85 × 9,81 × 0,06 × 2,78 ≈ 139 W
  // só de gravidade, mais rolamento e arrasto — a faixa de 130 a 220 W cobre isso.
  const climbPower = climbs[0].avg_power_w ?? 0;
  assert.ok(
    climbPower > 130 && climbPower < 220,
    `potência na subida ${climbPower} W fora da faixa plausível (130–220 W)`,
  );

  // No plano a 25 km/h o arrasto domina: 0,5 × 1,225 × 0,32 × 6,94³ ≈ 66 W.
  const flatPower = streams.power_w.slice(100, 600);
  const flatAvg = flatPower.reduce((s, p) => s + p, 0) / flatPower.length;
  assert.ok(flatAvg > 50 && flatAvg < 130, `potência no plano ${flatAvg} W fora da faixa (50–130 W)`);
});

test("não conta o tempo parado como tempo pedalando", () => {
  const moving = parseGpx(buildGpx(COURSE));
  const paused = parseGpx(buildGpx(COURSE, { pauseAfterLeg: 0, pauseS: 300 }));

  const a = analyze(moving.points, DEFAULT_PROFILE).metrics;
  const b = analyze(paused.points, DEFAULT_PROFILE).metrics;

  assert.ok(
    b.elapsed_s > a.elapsed_s + 250,
    `o tempo total deveria crescer com a parada (${a.elapsed_s} → ${b.elapsed_s})`,
  );
  assert.ok(
    Math.abs(b.moving_s - a.moving_s) < 25,
    `o tempo em movimento não deveria mudar (${a.moving_s} → ${b.moving_s})`,
  );
});

test("mede a queda de ritmo no último quarto do percurso", () => {
  // Sai forte e termina devagar: a queda tem que aparecer como fade positivo.
  const fading: Leg[] = [
    { distanceM: 2000, speedMs: 8.33, gradient: 0, hr: 140 }, // 30 km/h
    { distanceM: 2000, speedMs: 7.0, gradient: 0, hr: 145 },
    { distanceM: 2000, speedMs: 5.5, gradient: 0, hr: 150 },
    { distanceM: 2000, speedMs: 4.16, gradient: 0, hr: 152 }, // 15 km/h
  ];
  const { points } = parseGpx(buildGpx(fading));
  const { metrics } = analyze(points, DEFAULT_PROFILE);

  assert.ok((metrics.fade_pct ?? 0) > 40, `esperava queda acentuada, veio ${metrics.fade_pct}%`);
  assert.equal(metrics.quarters.length, 4);
  assert.ok(
    metrics.quarters[0].speed_kmh > metrics.quarters[3].speed_kmh,
    "o primeiro quarto deveria ser mais rápido que o último",
  );
  // Velocidade caindo com FC subindo é exatamente o que a deriva cardíaca mede.
  assert.ok((metrics.decoupling_pct ?? 0) > 10, `deriva ${metrics.decoupling_pct}% baixa demais`);
});

test("recusa arquivo que não é um GPX de trajeto", () => {
  assert.throws(() => parseGpx("<html><body>nada aqui</body></html>"), /gpx/i);
  assert.throws(
    () => parseGpx('<?xml version="1.0"?><gpx version="1.1"><trk><trkseg></trkseg></trk></gpx>'),
    /pontos de trajeto/i,
  );
});

test("descarta salto impossível de GPS", () => {
  const clean = parseGpx(buildGpx(COURSE));
  const withGlitch = parseGpx(buildGpx(COURSE));
  // Empurra um ponto 50 km para o lado no meio do treino.
  withGlitch.points[500] = { ...withGlitch.points[500], lon: withGlitch.points[500].lon + 0.5 };

  const a = analyze(clean.points, DEFAULT_PROFILE).metrics;
  const b = analyze(withGlitch.points, DEFAULT_PROFILE).metrics;

  assert.ok(
    Math.abs(b.distance_m - a.distance_m) < 60,
    `o salto de GPS inflou a distância (${a.distance_m} → ${b.distance_m})`,
  );
});
