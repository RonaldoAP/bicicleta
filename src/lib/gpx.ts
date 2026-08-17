import { XMLParser } from "fast-xml-parser";

/** Um ponto cru do arquivo, antes de qualquer cálculo. */
export interface RawPoint {
  lat: number;
  lon: number;
  ele: number | null;
  time: number | null; // epoch em ms
  hr: number | null;
  cadence: number | null;
  power: number | null;
  temp: number | null;
}

export interface ParsedGpx {
  name: string | null;
  sport: string | null;
  points: RawPoint[];
}

export class GpxError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: false,
  trimValues: true,
});

/**
 * Normaliza um campo do XML para lista de nós. O parser entrega um objeto quando
 * há uma ocorrência e um array quando há várias, e trilhas com um único segmento
 * são comuns.
 */
function nodes(value: unknown): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
  );
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** O texto de um nó, que o parser entrega como string, número ou `{ "#text": ... }`. */
function text(value: unknown): unknown {
  if (value && typeof value === "object" && "#text" in (value as object)) {
    return (value as Record<string, unknown>)["#text"];
  }
  return value;
}

/**
 * Procura uma chave em qualquer profundidade dentro de `<extensions>`. Cada
 * dispositivo aninha de um jeito diferente — Garmin usa
 * `TrackPointExtension > hr`, alguns exportadores põem `hr` na raiz, e potência
 * aparece como `power`, `PowerInWatts` ou `watts`.
 */
function findExt(node: unknown, keys: string[], depth = 0): number | null {
  if (!node || typeof node !== "object" || depth > 5) return null;
  const obj = node as Record<string, unknown>;
  for (const key of keys) {
    if (key in obj) {
      const v = num(text(obj[key]));
      if (v !== null) return v;
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findExt(value, keys, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function parseTime(value: unknown): number | null {
  const raw = text(value);
  if (raw === null || raw === undefined || raw === "") return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

function readPoint(node: Record<string, unknown>): RawPoint | null {
  const lat = num(node["@_lat"]);
  const lon = num(node["@_lon"]);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const ext = node.extensions;
  return {
    lat,
    lon,
    ele: num(text(node.ele)),
    time: parseTime(node.time),
    hr: findExt(ext, ["hr", "heartrate", "HeartRateBpm", "bpm"]),
    cadence: findExt(ext, ["cad", "cadence", "Cadence"]),
    power: findExt(ext, ["power", "PowerInWatts", "watts", "Watts"]),
    temp: findExt(ext, ["atemp", "temp", "Temperature"]),
  };
}

/** Lê um GPX e devolve os pontos na ordem em que foram gravados. */
export function parseGpx(xml: string): ParsedGpx {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    throw new GpxError(`Não foi possível ler o XML do arquivo: ${(err as Error).message}`);
  }

  const gpx = doc.gpx as Record<string, unknown> | undefined;
  if (!gpx) throw new GpxError("Arquivo sem elemento <gpx> — confirme que é um GPX válido.");

  const tracks = nodes(gpx.trk);
  const points: RawPoint[] = [];
  let name: string | null = null;
  let sport: string | null = null;

  for (const track of tracks) {
    if (!name) {
      const n = text(track.name);
      if (n) name = String(n);
    }
    if (!sport) {
      const t = text(track.type);
      if (t) sport = String(t);
    }
    for (const seg of nodes(track.trkseg)) {
      for (const node of nodes(seg.trkpt)) {
        const point = readPoint(node);
        if (point) points.push(point);
      }
    }
  }

  // Alguns aplicativos exportam o percurso como <rte> em vez de <trk>.
  if (points.length === 0) {
    for (const route of nodes(gpx.rte)) {
      if (!name) {
        const n = text(route.name);
        if (n) name = String(n);
      }
      for (const node of nodes(route.rtept)) {
        const point = readPoint(node);
        if (point) points.push(point);
      }
    }
  }

  if (points.length < 2) {
    throw new GpxError("O arquivo não contém pontos de trajeto suficientes para analisar.");
  }

  if (!name) {
    const meta = gpx.metadata as Record<string, unknown> | undefined;
    const metaName = meta ? text(meta.name) : null;
    if (metaName) name = String(metaName);
  }

  // Se houver horário, garante ordem cronológica: alguns arquivos concatenam
  // segmentos fora de ordem.
  const timed = points.filter((p) => p.time !== null);
  if (timed.length === points.length) {
    points.sort((a, b) => (a.time as number) - (b.time as number));
  }

  return { name, sport, points };
}
