"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);

export const COLORS = {
  ink: "#eaf2f8",
  muted: "#7e93a3",
  line: "#243140",
  bg: "#0a0e12",
  accent: "#ff5a1f",
  accent2: "#19d3a2",
  hot: "#ff4060",
  cool: "#38bdf8",
  gold: "#ffd23f",
};

ChartJS.defaults.font.family = "'Archivo', sans-serif";
ChartJS.defaults.color = COLORS.muted;

const grid = { color: COLORS.line, drawTicks: false } as const;

/** O Chart.js tipa valores do tooltip como possivelmente nulos (séries com furo). */
const value = (v: number | null | undefined): number => v ?? 0;

/** Rótulos com quebra de linha viram array — é assim que o Chart.js empilha texto. */
function splitLabels(labels: string[]): (string | string[])[] {
  return labels.map((label) => (label.includes("\n") ? label.split("\n") : label));
}

function padded(values: number[], pad: number) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return {};
  return {
    suggestedMin: Math.min(...clean) - pad,
    suggestedMax: Math.max(...clean) + pad,
  };
}

/* ------------------------------------------------------------------ */

interface TrendProps {
  labels: string[];
  values: number[];
  color?: string;
  fillColor?: string;
  tooltip: string;
  yTitle?: string;
  pad?: number;
  decimals?: number;
}

/** Linha única com área preenchida — usada no destaque e nas curvas de evolução. */
export function TrendLine({
  labels,
  values,
  color = COLORS.accent2,
  fillColor = "rgba(25,211,162,0.12)",
  tooltip,
  yTitle,
  pad = 8,
  decimals = 1,
}: TrendProps) {
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            `${value(ctx.parsed.y).toLocaleString("pt-BR", { maximumFractionDigits: decimals })} ${tooltip}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: COLORS.muted, font: { size: 10 } } },
      y: {
        grid,
        ticks: { color: COLORS.muted },
        title: yTitle ? { display: true, text: yTitle, color: COLORS.muted, font: { size: 10 } } : undefined,
        ...padded(values, pad),
      },
    },
  };

  return (
    <Line
      options={options}
      data={{
        labels: splitLabels(labels),
        datasets: [
          {
            data: values,
            borderColor: color,
            backgroundColor: fillColor,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: 6,
            pointBackgroundColor: color,
            pointBorderColor: COLORS.bg,
            pointBorderWidth: 2,
          },
        ],
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

/** FC média sobre FC máxima: duas barras por treino. */
export function HeartRateBars({
  labels,
  avg,
  max,
}: {
  labels: string[];
  avg: number[];
  max: number[];
}) {
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: COLORS.muted,
          font: { size: 11 },
          usePointStyle: true,
          pointStyle: "rectRounded",
        },
      },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} bpm` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: COLORS.muted, font: { size: 10 } } },
      y: { grid, ticks: { color: COLORS.muted }, suggestedMin: 100 },
    },
  };

  return (
    <Bar
      options={options}
      data={{
        labels: splitLabels(labels),
        datasets: [
          {
            label: "FC máxima",
            data: max,
            backgroundColor: "rgba(255,64,96,0.35)",
            borderColor: COLORS.hot,
            borderWidth: 1.5,
            borderRadius: 6,
          },
          { label: "FC média", data: avg, backgroundColor: COLORS.accent2, borderRadius: 6 },
        ],
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

const ZONE_COLORS: Record<string, string> = {
  Z1: COLORS.cool,
  Z2: COLORS.accent2,
  Z3: COLORS.gold,
  Z4: COLORS.accent,
  Z5: COLORS.hot,
  Z6: COLORS.hot,
};

/** Barras horizontais empilhadas: o tempo de cada treino repartido por zona. */
export function ZoneBars({
  labels,
  zones,
}: {
  labels: string[];
  zones: { zone: string; values: number[] }[];
}) {
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${value(ctx.parsed.x).toLocaleString("pt-BR")}%`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid,
        ticks: { color: COLORS.muted, callback: (v) => `${v}%` },
        max: 100,
      },
      y: { stacked: true, grid: { display: false }, ticks: { color: COLORS.muted, font: { size: 10 } } },
    },
  };

  return (
    <Bar
      options={options}
      data={{
        labels: splitLabels(labels),
        datasets: zones.map((z) => ({
          label: z.zone,
          data: z.values,
          backgroundColor: ZONE_COLORS[z.zone] ?? COLORS.muted,
          borderRadius: 4,
          stack: "zonas",
        })),
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

/**
 * Perfil do treino ao longo da distância: altimetria preenchida ao fundo e uma
 * segunda série (FC, velocidade ou potência) por cima, em eixo próprio.
 */
export function ProfileChart({
  distanceKm,
  elevation,
  overlay,
}: {
  distanceKm: number[];
  elevation: number[];
  overlay: { label: string; values: (number | null)[]; color: string; unit: string } | null;
}) {
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: {
          color: COLORS.muted,
          font: { size: 11 },
          usePointStyle: true,
          pointStyle: "rectRounded",
        },
      },
      tooltip: {
        callbacks: {
          title: (items) => `km ${Number(items[0].label).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`,
          label: (ctx) => {
            const unit = ctx.datasetIndex === 0 ? "m" : (overlay?.unit ?? "");
            return `${ctx.dataset.label}: ${Math.round(value(ctx.parsed.y)).toLocaleString("pt-BR")} ${unit}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: COLORS.muted,
          font: { size: 10 },
          maxTicksLimit: 10,
          callback(value) {
            return Number(this.getLabelForValue(value as number)).toLocaleString("pt-BR", {
              maximumFractionDigits: 0,
            });
          },
        },
        title: { display: true, text: "km", color: COLORS.muted, font: { size: 10 } },
      },
      y: {
        grid,
        ticks: { color: COLORS.muted },
        title: { display: true, text: "altitude (m)", color: COLORS.muted, font: { size: 10 } },
      },
      y2: {
        position: "right",
        display: overlay !== null,
        grid: { display: false },
        ticks: { color: COLORS.muted },
        title: overlay
          ? { display: true, text: overlay.unit, color: COLORS.muted, font: { size: 10 } }
          : undefined,
      },
    },
  };

  const datasets: any[] = [
    {
      label: "Altitude",
      data: elevation,
      borderColor: "rgba(126,147,163,0.7)",
      backgroundColor: "rgba(126,147,163,0.16)",
      borderWidth: 1.5,
      fill: true,
      pointRadius: 0,
      tension: 0.2,
      yAxisID: "y",
    },
  ];

  if (overlay) {
    datasets.push({
      label: overlay.label,
      data: overlay.values,
      borderColor: overlay.color,
      backgroundColor: "transparent",
      borderWidth: 2,
      fill: false,
      pointRadius: 0,
      tension: 0.25,
      spanGaps: true,
      yAxisID: "y2",
    });
  }

  return <Line options={options} data={{ labels: distanceKm, datasets }} />;
}

/* ------------------------------------------------------------------ */

/** Parciais por quilômetro: barra de velocidade com a FC sobreposta. */
export function SplitsChart({
  labels,
  speed,
  heartRate,
}: {
  labels: string[];
  speed: number[];
  heartRate: (number | null)[];
}) {
  const hasHr = heartRate.some((v) => v !== null);

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: {
          color: COLORS.muted,
          font: { size: 11 },
          usePointStyle: true,
          pointStyle: "rectRounded",
        },
      },
      tooltip: {
        callbacks: {
          title: (items) => `km ${items[0].label}`,
          label: (ctx) =>
            ctx.dataset.yAxisID === "y2"
              ? `FC: ${Math.round(value(ctx.parsed.y))} bpm`
              : `Velocidade: ${value(ctx.parsed.y).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/h`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: COLORS.muted, font: { size: 10 }, maxTicksLimit: 20 } },
      y: {
        grid,
        ticks: { color: COLORS.muted },
        title: { display: true, text: "km/h", color: COLORS.muted, font: { size: 10 } },
      },
      y2: {
        position: "right",
        display: hasHr,
        grid: { display: false },
        ticks: { color: COLORS.muted },
        title: { display: true, text: "bpm", color: COLORS.muted, font: { size: 10 } },
      },
    },
  };

  const datasets: any[] = [
    {
      type: "bar" as const,
      label: "Velocidade",
      data: speed,
      backgroundColor: "rgba(56,189,248,0.55)",
      borderRadius: 4,
      yAxisID: "y",
      order: 2,
    },
  ];

  if (hasHr) {
    datasets.push({
      type: "line" as const,
      label: "FC média",
      data: heartRate,
      borderColor: COLORS.hot,
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      spanGaps: true,
      yAxisID: "y2",
      order: 1,
    });
  }

  return <Bar options={options} data={{ labels, datasets }} />;
}
