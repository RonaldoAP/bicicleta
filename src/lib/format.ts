/** Formatação em pt-BR, centralizada para os números não divergirem entre telas. */

export function km(meters: number | null | undefined, decimals = 1): string {
  if (meters === null || meters === undefined) return "—";
  return (meters / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function meters(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("pt-BR");
}

export function decimal(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function integer(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("pt-BR");
}

/** Duração como 1h42 ou 42min, o formato que se lê rápido num painel. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}min`;
}

/** Duração com segundos, para parciais de quilômetro. */
export function clock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function hours(seconds: number | null | undefined, decimals = 1): string {
  if (seconds === null || seconds === undefined) return "—";
  return (seconds / 3600).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Rótulo curto para eixos de gráfico: "24/mai (35 km)". */
export function chartLabel(iso: string, distanceM: number): string {
  return `${shortDate(iso).replace(".", "")} (${km(distanceM, 0)} km)`;
}

export function signed(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return "—";
  const formatted = Math.abs(value).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}
