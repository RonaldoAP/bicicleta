import type { ActivityMetrics } from "./metrics";

/**
 * Mapeia as métricas para as colunas de `activities`. Importação e
 * reprocessamento passam por aqui, para os dois nunca gravarem coisas
 * diferentes a partir da mesma análise.
 */
export function activityFields(metrics: ActivityMetrics) {
  return {
    started_at: metrics.started_at,
    distance_m: metrics.distance_m,
    elapsed_s: metrics.elapsed_s,
    moving_s: metrics.moving_s,
    elevation_gain_m: metrics.elevation_gain_m,
    elevation_loss_m: metrics.elevation_loss_m,
    avg_speed_kmh: metrics.avg_speed_kmh,
    max_speed_kmh: metrics.max_speed_kmh,
    avg_hr: metrics.avg_hr,
    max_hr: metrics.max_hr,
    min_hr: metrics.min_hr,
    avg_cadence: metrics.avg_cadence,
    avg_power_w: metrics.avg_power_w,
    np_power_w: metrics.np_power_w,
    max_power_w: metrics.max_power_w,
    work_kj: metrics.work_kj,
    tss: metrics.tss,
    intensity_factor: metrics.intensity_factor,
    efficiency_index: metrics.efficiency_index,
    decoupling_pct: metrics.decoupling_pct,
    fade_pct: metrics.fade_pct,
    calories: metrics.calories,
    hr_zones: metrics.hr_zones,
    power_zones: metrics.power_zones,
    splits: metrics.splits,
    quarters: metrics.quarters,
    bounds: metrics.bounds,
    polyline: metrics.polyline,
    has_hr: metrics.has_hr,
    has_power: metrics.has_power,
    has_cadence: metrics.has_cadence,
  };
}

export function storagePathFor(userId: string, activityId: string): string {
  return `${userId}/${activityId}.gpx`;
}
