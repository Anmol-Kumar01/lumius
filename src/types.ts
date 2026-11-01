export type Entry = {
  name: string;
  path: string;
  directory: boolean;
  size: number;
  modified: number;
  kind: string;
};
export type Listing = { path: string; entries: Entry[]; warning?: string };
export type Settings = {
  glass: number;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  wallpaper: string;
  pinned: string[];
  light: "day" | "night" | "auto";
  accent: "lumen" | "violet" | "rose" | "amber" | "mint" | "graphite";
  iconFinish: "spectrum" | "lumen";
  leaving: "fold" | "fade";
  shelfLift: number;
  aurora: boolean;
};
export type OpenWindow = {
  id: number;
  title: string;
  class: string;
  active: boolean;
  minimized: boolean;
};
export type Status = {
  live?: boolean;
  volume: number | null;
  brightness: number | null;
  title: string;
  artist: string;
  playing: boolean;
  battery: number | null;
  platform: string;
};
export type Transfer = {
  id: string;
  done: number;
  total: number;
  name: string;
  state: string;
  error?: string;
};
export type TrashItem = { id: string; name: string; original: string };
export type Citation = {
  url: string;
  title: string;
  publishedDate: string | null;
};
export type Answer = { answer: string; citations: Citation[] };

// System intelligence (src-tauri/src/intelligence.rs). Every telemetry field is
// null when the system doesn't expose it; values are never estimated.
export type PolicyId =
  | "balanced"
  | "performance"
  | "battery_saver"
  | "focus"
  | "media"
  | "development";
export type Pressure = "low" | "moderate" | "high" | "critical";
export type BatteryStatus =
  "charging" | "discharging" | "full" | "not_charging" | "unknown";
export type IntelSnapshot = {
  /** Present (true) only in the browser demo. */
  demo?: boolean;
  taken_at: number | null;
  mem_total_kb: number | null;
  mem_available_kb: number | null;
  mem_available_pct: number | null;
  swap_total_kb: number | null;
  swap_free_kb: number | null;
  cpu_busy_pct: number | null;
  cpu_cores: number | null;
  psi_cpu_some_avg10: number | null;
  psi_memory_some_avg10: number | null;
  psi_io_some_avg10: number | null;
  load_1: number | null;
  load_5: number | null;
  load_15: number | null;
  uptime_secs: number | null;
  process_count: number | null;
  disk_root_total_bytes: number | null;
  disk_root_available_bytes: number | null;
  disk_root_used_pct: number | null;
  battery_pct: number | null;
  battery_status: BatteryStatus | null;
};
export type IntelPolicy = {
  policy_id: PolicyId;
  label: string;
  pressure: Pressure;
  /** Human-readable, citing the measured numbers; the last entry is the decision. */
  reasons: string[];
};
export type IntelSnapshotResult = {
  snapshot: IntelSnapshot;
  policy: IntelPolicy;
};
export type ProviderId = "cerebras" | "openai" | "exa";
/** Outcome of a provider call. Status checks only report unconfigured/ready. */
export type ProviderState =
  | "unconfigured"
  | "ready"
  | "auth_failed"
  | "rate_limited"
  | "unavailable"
  | "invalid_response"
  | "error";
export type ProviderStatus = {
  id: ProviderId;
  label: string;
  model: string | null;
  configured: boolean;
  state: "unconfigured" | "ready";
};
export type IntelStatus = { providers: ProviderStatus[]; demo?: boolean };
export type IntelAdvice = { policy_id: PolicyId; reason: string };
export type IntelAdviseResult = {
  /** The local policy engine's decision; always the final authority. */
  local: IntelPolicy;
  advice: IntelAdvice | null;
  /** Whether the local engine allows the advised policy right now. */
  accepted: boolean;
  state: ProviderState;
  /** Why the advice was accepted or kept local (present with advice). */
  note?: string;
  error?: string;
};
export type IntelAssistResult = {
  answer: string | null;
  state: ProviderState;
  error?: string;
};
