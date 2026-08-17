import type { Climb, Profile, Quarter, Split, Streams, ZoneBucket } from "./metrics";

export interface ActivityRow {
  id: string;
  user_id: string;
  name: string;
  sport: string;
  started_at: string;
  file_name: string | null;
  file_hash: string;
  storage_path: string | null;

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
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
  polyline: [number, number][];

  has_hr: boolean;
  has_power: boolean;
  has_cadence: boolean;

  notes: string | null;
  created_at: string;
}

export interface StreamRow extends Streams {
  activity_id: string;
  n: number;
}

export interface ClimbRow extends Omit<Climb, "start_idx" | "end_idx"> {
  id: string;
  activity_id: string;
  user_id: string;
  start_idx: number;
  end_idx: number;
  created_at: string;
}

export interface ProfileRow extends Profile {
  id: string;
  display_name: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}
