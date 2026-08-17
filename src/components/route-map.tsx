/**
 * Traçado do percurso em SVG puro, a partir da polilinha guardada no treino.
 * Sem mapa de fundo e sem dependência externa: mostra a forma da rota, que é o
 * suficiente para reconhecer qual percurso foi feito.
 */
export function RouteMap({
  polyline,
  height = 220,
  color = "#ff5a1f",
}: {
  polyline: [number, number][];
  height?: number;
  color?: string;
}) {
  if (!polyline || polyline.length < 2) return null;

  const lats = polyline.map((p) => p[0]);
  const lons = polyline.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Corrige a compressão dos meridianos: um grau de longitude encurta com a
  // latitude, e sem isso a rota sai esticada na horizontal.
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const spanX = Math.max(1e-6, (maxLon - minLon) * Math.cos(midLat));
  const spanY = Math.max(1e-6, maxLat - minLat);

  const pad = 12;
  const width = Math.round((height - pad * 2) * (spanX / spanY)) + pad * 2;
  const boxWidth = Math.min(Math.max(width, 160), 1000);
  const innerW = boxWidth - pad * 2;
  const innerH = height - pad * 2;

  const points = polyline.map(([lat, lon]) => {
    const x = pad + (((lon - minLon) * Math.cos(midLat)) / spanX) * innerW;
    const y = pad + (1 - (lat - minLat) / spanY) * innerH; // norte para cima
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const start = points[0].split(",");
  const end = points[points.length - 1].split(",");

  return (
    <svg
      className="route-map"
      viewBox={`0 0 ${boxWidth} ${height}`}
      role="img"
      aria-label="Traçado do percurso"
      preserveAspectRatio="xMidYMid meet"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx={start[0]} cy={start[1]} r="4.5" fill="#19d3a2" stroke="#0a0e12" strokeWidth="2" />
      <circle cx={end[0]} cy={end[1]} r="4.5" fill="#ff4060" stroke="#0a0e12" strokeWidth="2" />
    </svg>
  );
}
