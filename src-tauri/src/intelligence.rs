//! System intelligence for Lumius.
//!
//! Three layers, each useful without the next:
//! 1. `snapshot()` reads live telemetry from /proc and /sys. Anything the kernel does
//!    not expose stays `None` (null in JSON); nothing is estimated or invented.
//! 2. `decide()` is a local, deterministic policy engine. It is always the final
//!    authority on which shipped policy fits the machine right now.
//! 3. Optional provider adapters (Cerebras advice, OpenAI assistant, Exa web answers)
//!    only ever see `reduced()`: rounded numbers and closed-vocabulary values, with no
//!    hostnames, usernames, paths or process names. Their output is validated locally
//!    and only displayed. Providers never run commands or change system settings.
//!
//! API keys are entered at runtime in Settings and stored 0600 under ~/.config/lumius/,
//! or read from the provider's environment variable. They reach curl on stdin
//! (`-H @-`) so they never appear in argv, and they are never logged or echoed in errors.
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fmt, fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const CEREBRAS_MODEL: &str = "llama-3.3-70b";
pub const OPENAI_MODEL: &str = "gpt-4.1-mini";
const CEREBRAS_URL: &str = "https://api.cerebras.ai/v1/chat/completions";
const OPENAI_URL: &str = "https://api.openai.com/v1/responses";
const MAX_QUERY_CHARS: usize = 2000;
const LOW_BATTERY_PCT: u8 = 25;

/// The shipped policies: (id, label, description). Providers may only choose from these.
const POLICIES: [(&str, &str, &str); 6] = [
    (
        "balanced",
        "Balanced",
        "Default. No battery or pressure constraint is active.",
    ),
    (
        "performance",
        "Performance",
        "Keep the desktop responsive while memory or CPU pressure is high.",
    ),
    (
        "battery_saver",
        "Battery Saver",
        "Reduce power use while the battery is low and discharging.",
    ),
    (
        "focus",
        "Focus",
        "Quiet notifications and background work for focused tasks.",
    ),
    (
        "media",
        "Media",
        "Smooth audio and video playback; keep the display awake.",
    ),
    (
        "development",
        "Development",
        "Favour builds and many processes; tolerate sustained CPU load.",
    ),
];

/// Returns the canonical static id when `id` is exactly a shipped policy id.
fn shipped(id: &str) -> Option<&'static str> {
    POLICIES.iter().find(|p| p.0 == id).map(|p| p.0)
}
fn label_of(id: &str) -> &'static str {
    POLICIES
        .iter()
        .find(|p| p.0 == id)
        .map(|p| p.1)
        .unwrap_or("Balanced")
}
fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}
fn gib_from_kb(kb: u64) -> f64 {
    round1(kb as f64 / 1_048_576.0)
}
fn gib_from_bytes(bytes: u64) -> f64 {
    round1(bytes as f64 / 1_073_741_824.0)
}
fn percent(part: u64, whole: u64) -> Option<f64> {
    (whole > 0).then(|| round1(part as f64 * 100.0 / whole as f64))
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BatteryStatus {
    Charging,
    Discharging,
    Full,
    NotCharging,
    Unknown,
}
impl BatteryStatus {
    fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "Charging" => Some(Self::Charging),
            "Discharging" => Some(Self::Discharging),
            "Full" => Some(Self::Full),
            "Not charging" => Some(Self::NotCharging),
            "Unknown" => Some(Self::Unknown),
            _ => None,
        }
    }
    fn describe(self) -> &'static str {
        match self {
            Self::Charging => "charging",
            Self::Discharging => "discharging",
            Self::Full => "full",
            Self::NotCharging => "not charging",
            Self::Unknown => "status unknown",
        }
    }
}

/// Live system telemetry. Every field is optional: missing data is null, never guessed.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Snapshot {
    pub taken_at: Option<u64>,
    pub mem_total_kb: Option<u64>,
    pub mem_available_kb: Option<u64>,
    pub mem_available_pct: Option<f64>,
    pub swap_total_kb: Option<u64>,
    pub swap_free_kb: Option<u64>,
    pub cpu_busy_pct: Option<f64>,
    pub cpu_cores: Option<u32>,
    pub psi_cpu_some_avg10: Option<f64>,
    pub psi_memory_some_avg10: Option<f64>,
    pub psi_io_some_avg10: Option<f64>,
    pub load_1: Option<f64>,
    pub load_5: Option<f64>,
    pub load_15: Option<f64>,
    pub uptime_secs: Option<u64>,
    pub process_count: Option<u32>,
    pub disk_root_total_bytes: Option<u64>,
    pub disk_root_available_bytes: Option<u64>,
    pub disk_root_used_pct: Option<f64>,
    pub battery_pct: Option<u8>,
    pub battery_status: Option<BatteryStatus>,
}

#[derive(Debug, Default, PartialEq)]
struct MemInfo {
    total_kb: Option<u64>,
    available_kb: Option<u64>,
    swap_total_kb: Option<u64>,
    swap_free_kb: Option<u64>,
}
fn parse_meminfo(text: &str) -> MemInfo {
    let mut m = MemInfo::default();
    for line in text.lines() {
        let Some((key, rest)) = line.split_once(':') else {
            continue;
        };
        let value = rest
            .split_whitespace()
            .next()
            .and_then(|v| v.parse::<u64>().ok());
        match key.trim() {
            "MemTotal" => m.total_kb = value,
            "MemAvailable" => m.available_kb = value,
            "SwapTotal" => m.swap_total_kb = value,
            "SwapFree" => m.swap_free_kb = value,
            _ => {}
        }
    }
    m
}
/// `some avg10` from a /proc/pressure/* file.
fn parse_psi_some_avg10(text: &str) -> Option<f64> {
    text.lines()
        .find(|l| l.starts_with("some "))?
        .split_whitespace()
        .find_map(|f| f.strip_prefix("avg10="))?
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v >= 0.0)
}
/// (idle, total) jiffies from the aggregate `cpu` line of /proc/stat.
fn parse_cpu_times(stat: &str) -> Option<(u64, u64)> {
    let line = stat.lines().find(|l| l.starts_with("cpu "))?;
    let v: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .map(|n| n.parse().ok())
        .collect::<Option<_>>()?;
    if v.len() < 4 {
        return None;
    }
    // user nice system idle iowait irq softirq steal. Guest time is already in user/nice.
    let total = v.iter().take(8).sum();
    let idle = v[3] + v.get(4).copied().unwrap_or(0);
    Some((idle, total))
}
fn cpu_busy_between(a: (u64, u64), b: (u64, u64)) -> Option<f64> {
    let total = b.1.checked_sub(a.1)?;
    let idle = b.0.checked_sub(a.0)?;
    if total == 0 || idle > total {
        return None;
    }
    percent(total - idle, total)
}
fn parse_cpu_cores(stat: &str) -> Option<u32> {
    let n = stat
        .lines()
        .filter(|l| {
            l.strip_prefix("cpu")
                .is_some_and(|r| r.starts_with(|c: char| c.is_ascii_digit()))
        })
        .count();
    (n > 0).then_some(n as u32)
}
fn parse_loadavg(text: &str) -> [Option<f64>; 3] {
    let mut it = text
        .split_whitespace()
        .map(|f| f.parse::<f64>().ok().filter(|v| v.is_finite() && *v >= 0.0));
    [
        it.next().flatten(),
        it.next().flatten(),
        it.next().flatten(),
    ]
}
fn parse_uptime(text: &str) -> Option<u64> {
    text.split_whitespace()
        .next()?
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v >= 0.0)
        .map(|v| v as u64)
}
fn read_trimmed(path: impl AsRef<Path>) -> Option<String> {
    fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}
/// First system battery (BAT*, or any non-peripheral supply of type Battery).
fn read_battery(root: &Path) -> (Option<u8>, Option<BatteryStatus>) {
    let Ok(entries) = fs::read_dir(root) else {
        return (None, None);
    };
    let mut supplies: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
    supplies.sort();
    for p in supplies {
        let named_bat = p
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with("BAT"));
        let typed_battery = read_trimmed(p.join("type")).as_deref() == Some("Battery")
            && read_trimmed(p.join("scope")).as_deref() != Some("Device");
        if !(named_bat || typed_battery) {
            continue;
        }
        let pct = read_trimmed(p.join("capacity"))
            .and_then(|s| s.parse::<u8>().ok())
            .filter(|v| *v <= 100);
        let status = read_trimmed(p.join("status")).and_then(|s| BatteryStatus::parse(&s));
        if pct.is_some() || status.is_some() {
            return (pct, status);
        }
    }
    (None, None)
}
/// (total, available-to-users, used %) the way `df` reports them.
fn disk_usage(total: u64, free: u64, avail: u64) -> (Option<u64>, Option<u64>, Option<f64>) {
    if total == 0 {
        return (None, None, None);
    }
    let used = total.saturating_sub(free);
    (
        Some(total),
        Some(avail),
        percent(used, used.saturating_add(avail)),
    )
}
#[cfg(target_os = "linux")]
fn root_disk() -> (Option<u64>, Option<u64>, Option<f64>) {
    // SAFETY: statvfs is plain data, so all-zero is a valid value, and the path is a
    // NUL-terminated C string literal.
    let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c"/".as_ptr(), &mut st) } != 0 {
        return (None, None, None);
    }
    let frsize = u64::from(st.f_frsize);
    disk_usage(
        u64::from(st.f_blocks).saturating_mul(frsize),
        u64::from(st.f_bfree).saturating_mul(frsize),
        u64::from(st.f_bavail).saturating_mul(frsize),
    )
}
#[cfg(not(target_os = "linux"))]
fn root_disk() -> (Option<u64>, Option<u64>, Option<f64>) {
    (None, None, None)
}
fn process_count() -> Option<u32> {
    let n = fs::read_dir("/proc")
        .ok()?
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_name()
                .to_str()
                .is_some_and(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
        })
        .count();
    (n > 0).then_some(n as u32)
}

/// Reads live telemetry. Takes about 200 ms because CPU usage needs two samples.
pub fn snapshot() -> Snapshot {
    let stat_a = fs::read_to_string("/proc/stat").ok();
    let cpu_a = stat_a.as_deref().and_then(parse_cpu_times);
    let cpu_busy_pct = cpu_a.and_then(|a| {
        std::thread::sleep(Duration::from_millis(200));
        let b = fs::read_to_string("/proc/stat")
            .ok()
            .as_deref()
            .and_then(parse_cpu_times)?;
        cpu_busy_between(a, b)
    });
    let mem = fs::read_to_string("/proc/meminfo")
        .map(|t| parse_meminfo(&t))
        .unwrap_or_default();
    let psi = |name: &str| {
        fs::read_to_string(format!("/proc/pressure/{name}"))
            .ok()
            .as_deref()
            .and_then(parse_psi_some_avg10)
    };
    let [load_1, load_5, load_15] = fs::read_to_string("/proc/loadavg")
        .map(|t| parse_loadavg(&t))
        .unwrap_or_default();
    let (disk_root_total_bytes, disk_root_available_bytes, disk_root_used_pct) = root_disk();
    let (battery_pct, battery_status) = read_battery(Path::new("/sys/class/power_supply"));
    Snapshot {
        taken_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .map(|d| d.as_secs()),
        mem_available_pct: match (mem.available_kb, mem.total_kb) {
            (Some(a), Some(t)) => percent(a, t),
            _ => None,
        },
        mem_total_kb: mem.total_kb,
        mem_available_kb: mem.available_kb,
        swap_total_kb: mem.swap_total_kb,
        swap_free_kb: mem.swap_free_kb,
        cpu_busy_pct,
        cpu_cores: stat_a.as_deref().and_then(parse_cpu_cores),
        psi_cpu_some_avg10: psi("cpu"),
        psi_memory_some_avg10: psi("memory"),
        psi_io_some_avg10: psi("io"),
        load_1,
        load_5,
        load_15,
        uptime_secs: fs::read_to_string("/proc/uptime")
            .ok()
            .as_deref()
            .and_then(parse_uptime),
        process_count: process_count(),
        disk_root_total_bytes,
        disk_root_available_bytes,
        disk_root_used_pct,
        battery_pct,
        battery_status,
    }
}

/// The privacy-reduced view sent to providers: rounded numbers and closed enums only.
/// No timestamps, hostnames, usernames, paths or process names.
fn reduced(s: &Snapshot) -> Value {
    let swap_used_pct = match (s.swap_total_kb, s.swap_free_kb) {
        (Some(t), Some(f)) => percent(t.saturating_sub(f), t),
        _ => None,
    };
    json!({
        "mem_total_gib": s.mem_total_kb.map(gib_from_kb),
        "mem_available_pct": s.mem_available_pct,
        "swap_total_gib": s.swap_total_kb.map(gib_from_kb),
        "swap_used_pct": swap_used_pct,
        "cpu_busy_pct": s.cpu_busy_pct,
        "cpu_cores": s.cpu_cores,
        "psi_cpu_some_avg10": s.psi_cpu_some_avg10,
        "psi_memory_some_avg10": s.psi_memory_some_avg10,
        "psi_io_some_avg10": s.psi_io_some_avg10,
        "load_1": s.load_1,
        "load_5": s.load_5,
        "load_15": s.load_15,
        "uptime_hours": s.uptime_secs.map(|u| u / 3600),
        "process_count": s.process_count,
        "disk_root_used_pct": s.disk_root_used_pct,
        "disk_root_available_gib": s.disk_root_available_bytes.map(gib_from_bytes),
        "battery_pct": s.battery_pct,
        "battery_status": s.battery_status,
    })
}

// ---------------------------------------------------------------------------
// Local policy engine
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Pressure {
    Low,
    Moderate,
    High,
    Critical,
}
impl fmt::Display for Pressure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Low => "low",
            Self::Moderate => "moderate",
            Self::High => "high",
            Self::Critical => "critical",
        })
    }
}
/// Thresholds as (moderate, high, critical).
type Thresholds = (f64, f64, f64);
/// Memory available %, where lower is worse.
const MEM_AVAILABLE_PCT: Thresholds = (20.0, 10.0, 5.0);
/// PSI `some avg10` %, where higher is worse.
const PSI_MEMORY: Thresholds = (5.0, 20.0, 50.0);
const PSI_CPU: Thresholds = (20.0, 50.0, 80.0);
/// CPU busy % alone never reaches critical; saturation without stalls is just a busy CPU.
const CPU_BUSY: Thresholds = (75.0, 95.0, f64::INFINITY);

fn rising(v: f64, t: Thresholds) -> Pressure {
    if v >= t.2 {
        Pressure::Critical
    } else if v >= t.1 {
        Pressure::High
    } else if v >= t.0 {
        Pressure::Moderate
    } else {
        Pressure::Low
    }
}
fn falling(v: f64, t: Thresholds) -> Pressure {
    if v <= t.2 {
        Pressure::Critical
    } else if v <= t.1 {
        Pressure::High
    } else if v <= t.0 {
        Pressure::Moderate
    } else {
        Pressure::Low
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Policy {
    pub policy_id: &'static str,
    pub label: &'static str,
    pub pressure: Pressure,
    pub reasons: Vec<String>,
}

/// Deterministic policy choice from measured pressure and battery state.
/// Rules, in order: low battery while discharging → battery_saver; high or critical
/// memory pressure → performance; high or critical CPU pressure → performance;
/// otherwise balanced.
pub fn decide(s: &Snapshot) -> Policy {
    let mut reasons = Vec::new();
    let mut memory = Pressure::Low;
    let mut cpu = Pressure::Low;
    if let Some(pct) = s.mem_available_pct {
        let level = falling(pct, MEM_AVAILABLE_PCT);
        memory = memory.max(level);
        reasons.push(match (s.mem_available_kb, s.mem_total_kb) {
            (Some(a), Some(t)) => format!(
                "{pct:.1}% of memory available ({} of {} GiB): {level}",
                gib_from_kb(a),
                gib_from_kb(t)
            ),
            _ => format!("{pct:.1}% of memory available: {level}"),
        });
    }
    if let Some(v) = s.psi_memory_some_avg10 {
        let level = rising(v, PSI_MEMORY);
        memory = memory.max(level);
        reasons.push(format!(
            "Memory stalls (PSI some avg10) at {v:.2}%: {level}"
        ));
    }
    if let Some(v) = s.cpu_busy_pct {
        let level = rising(v, CPU_BUSY);
        cpu = cpu.max(level);
        reasons.push(format!("CPU {v:.1}% busy: {level}"));
    }
    if let Some(v) = s.psi_cpu_some_avg10 {
        let level = rising(v, PSI_CPU);
        cpu = cpu.max(level);
        reasons.push(format!("CPU stalls (PSI some avg10) at {v:.2}%: {level}"));
    }
    if reasons.is_empty() {
        reasons.push("No memory or CPU pressure data is available on this system.".into());
    }
    if let Some(pct) = s.battery_pct {
        reasons.push(match s.battery_status {
            Some(st) => format!("Battery at {pct}%, {}", st.describe()),
            None => format!("Battery at {pct}%"),
        });
    }
    let pressure = memory.max(cpu);
    let low_battery = s.battery_status == Some(BatteryStatus::Discharging)
        && s.battery_pct.is_some_and(|p| p < LOW_BATTERY_PCT);
    let (policy_id, why) = if low_battery {
        (
            "battery_saver",
            format!(
                "Battery is below {LOW_BATTERY_PCT}% and discharging, so Battery Saver takes priority."
            ),
        )
    } else if memory >= Pressure::High {
        (
            "performance",
            format!("Memory pressure is {memory}, so Performance keeps the desktop responsive."),
        )
    } else if cpu >= Pressure::High {
        (
            "performance",
            format!("CPU pressure is {cpu}, so Performance keeps the desktop responsive."),
        )
    } else {
        (
            "balanced",
            format!("Pressure is {pressure} with no battery constraint, so Balanced fits."),
        )
    };
    reasons.push(why);
    Policy {
        policy_id,
        label: label_of(policy_id),
        pressure,
        reasons,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Advice {
    pub policy_id: &'static str,
    pub reason: String,
}

/// Whether the local engine accepts a (shipped) provider suggestion, with an explanation.
/// The engine only overrides when it has a constraint: low battery or high pressure.
fn review(local: &Policy, advice: &Advice) -> (bool, String) {
    if advice.policy_id == local.policy_id {
        (true, "Matches the local policy.".into())
    } else if local.policy_id == "balanced" {
        (
            true,
            format!(
                "No local constraint is active, so {} is allowed.",
                label_of(advice.policy_id)
            ),
        )
    } else {
        (
            false,
            format!(
                "Local policy keeps {}: {}",
                local.label,
                local.reasons.last().map(String::as_str).unwrap_or("")
            ),
        )
    }
}

/// Strips control characters, collapses whitespace and caps length.
fn clean_text(s: &str, max_chars: usize) -> String {
    let collapsed = s
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if collapsed.chars().count() <= max_chars {
        collapsed
    } else {
        let mut cut: String = collapsed.chars().take(max_chars).collect();
        cut.push('…');
        cut
    }
}

/// Parses `{"policy_id": ..., "reason": ...}` from model output. Unknown ids are rejected.
fn parse_advice(content: &str) -> Result<Advice, &'static str> {
    let (start, end) = (content.find('{'), content.rfind('}'));
    let object = match (start, end) {
        (Some(s), Some(e)) if s < e => &content[s..=e],
        _ => return Err("no JSON object"),
    };
    let v: Value = serde_json::from_str(object).map_err(|_| "invalid JSON")?;
    let id = v["policy_id"].as_str().ok_or("missing policy_id")?;
    let policy_id = shipped(id.trim()).ok_or("unknown policy id")?;
    let reason = clean_text(v["reason"].as_str().unwrap_or(""), 300);
    Ok(Advice {
        policy_id,
        reason: if reason.is_empty() {
            "No reason given.".into()
        } else {
            reason
        },
    })
}

/// Concatenates `output[].content[].text` where the content type is `output_text`.
fn extract_output_text(v: &Value) -> Option<String> {
    let text = v["output"]
        .as_array()?
        .iter()
        .filter_map(|item| item["content"].as_array())
        .flatten()
        .filter(|c| c["type"] == "output_text")
        .filter_map(|c| c["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Provider {
    Cerebras,
    OpenAi,
    Exa,
}
impl Provider {
    const ALL: [Provider; 3] = [Provider::Cerebras, Provider::OpenAi, Provider::Exa];
    fn parse(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|p| p.id() == id)
    }
    fn id(self) -> &'static str {
        match self {
            Self::Cerebras => "cerebras",
            Self::OpenAi => "openai",
            Self::Exa => "exa",
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::Cerebras => "Cerebras",
            Self::OpenAi => "OpenAI",
            Self::Exa => "Exa",
        }
    }
    fn model(self) -> Option<&'static str> {
        match self {
            Self::Cerebras => Some(CEREBRAS_MODEL),
            Self::OpenAi => Some(OPENAI_MODEL),
            Self::Exa => None,
        }
    }
    fn env(self) -> &'static str {
        match self {
            Self::Cerebras => "CEREBRAS_API_KEY",
            Self::OpenAi => "OPENAI_API_KEY",
            Self::Exa => "EXA_API_KEY",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum ProviderError {
    Unconfigured,
    AuthFailed,
    RateLimited,
    Unavailable,
    /// A fixed internal description. Never provider text, never key material.
    InvalidResponse(&'static str),
    Http(u16),
}
impl ProviderError {
    fn state(&self) -> &'static str {
        match self {
            Self::Unconfigured => "unconfigured",
            Self::AuthFailed => "auth_failed",
            Self::RateLimited => "rate_limited",
            Self::Unavailable => "unavailable",
            Self::InvalidResponse(_) => "invalid_response",
            Self::Http(_) => "error",
        }
    }
    fn message(&self, p: Provider) -> String {
        let name = p.label();
        match self {
            Self::Unconfigured => format!("Add your {name} API key in Settings."),
            Self::AuthFailed => {
                format!("{name} rejected the API key. Update it in Settings.")
            }
            Self::RateLimited => format!("{name} is rate limiting requests. Try again in a moment."),
            Self::Unavailable => {
                format!("Can't reach {name} right now. Check the internet connection.")
            }
            Self::InvalidResponse(why) => {
                format!("{name} sent a reply Lumius couldn't use ({why}).")
            }
            Self::Http(code) => format!("{name} request failed (HTTP {code})."),
        }
    }
}

fn valid_key(key: &str) -> bool {
    (8..=200).contains(&key.len())
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
fn key_path(p: Provider) -> Result<PathBuf, String> {
    Ok(crate::files::config()?.join(format!("{}-api-key", p.id())))
}
/// Environment variable first (if set and well formed), then the private key file.
fn provider_key(p: Provider) -> Option<String> {
    std::env::var(p.env())
        .ok()
        .map(|k| k.trim().to_string())
        .filter(|k| valid_key(k))
        .or_else(|| {
            fs::read_to_string(key_path(p).ok()?)
                .ok()
                .map(|k| k.trim().to_string())
                .filter(|k| valid_key(k))
        })
}
/// Atomic write of a private file: a fresh 0600 temp file, synced, then renamed over.
fn write_private(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    let _ = fs::remove_file(&temp);
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let written = options
        .open(&temp)
        .and_then(|mut f| f.write_all(contents).and_then(|_| f.sync_all()))
        .and_then(|_| fs::rename(&temp, path));
    written.map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Couldn't save the key: {e}")
    })
}
fn exa_configured() -> bool {
    crate::system::exa_key_status()
        .ok()
        .and_then(|v| v["configured"].as_bool())
        .unwrap_or(false)
}

fn http_error(code: u16) -> Option<ProviderError> {
    match code {
        200..=299 => None,
        401 | 403 => Some(ProviderError::AuthFailed),
        429 => Some(ProviderError::RateLimited),
        500..=599 => Some(ProviderError::Unavailable),
        other => Some(ProviderError::Http(other)),
    }
}
/// Splits curl output produced with `-w "\n%{http_code}"` into (body, status).
fn split_reply(text: &str) -> (&str, u16) {
    let (body, code) = text.rsplit_once('\n').unwrap_or(("", text));
    (body, code.trim().parse().unwrap_or(0))
}
/// POSTs JSON with curl. The auth header goes to curl on stdin (`-H @-`), never argv.
/// `-q` must stay first so a user's ~/.curlrc can't add tracing that would log headers.
fn post_json(url: &str, auth_header: &str, body: &Value, max_secs: u32) -> Result<Value, ProviderError> {
    let body = body.to_string();
    let max = max_secs.to_string();
    let mut child = Command::new("curl")
        .args([
            "-q",
            "-sS",
            "--proto",
            "=https",
            "--connect-timeout",
            "10",
            "--max-time",
            &max,
            "-X",
            "POST",
            url,
            "-H",
            "Content-Type: application/json",
            "-H",
            "@-",
            "--data-binary",
            &body,
            "-w",
            "\n%{http_code}",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| ProviderError::Unavailable)?;
    let sent = child
        .stdin
        .take()
        .is_some_and(|mut stdin| stdin.write_all(format!("{auth_header}\n").as_bytes()).is_ok());
    if !sent {
        let _ = child.kill();
        let _ = child.wait();
        return Err(ProviderError::Unavailable);
    }
    let out = child
        .wait_with_output()
        .map_err(|_| ProviderError::Unavailable)?;
    if !out.status.success() {
        return Err(ProviderError::Unavailable);
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let (payload, code) = split_reply(&text);
    if let Some(e) = http_error(code) {
        return Err(e);
    }
    serde_json::from_str(payload).map_err(|_| ProviderError::InvalidResponse("unreadable reply"))
}

fn policy_catalog() -> Value {
    Value::Array(
        POLICIES
            .iter()
            .map(|(id, _, description)| json!({ "policy_id": id, "description": description }))
            .collect(),
    )
}

const ADVISOR_PROMPT: &str = "You advise Lumius, a Debian desktop, on which of its shipped \
system policies fits the machine right now. Choose exactly one policy_id from the provided \
list and never invent another. Base the choice only on the provided numbers; null means the \
value is unknown. Lumius's local policy engine has the final say. Reply with only a JSON \
object of the form {\"policy_id\": \"<one of the listed ids>\", \"reason\": \"<one short \
sentence citing the numbers>\"}.";

fn cerebras_request(reduced: &Value, local: &Policy) -> Value {
    let context = json!({
        "policies": policy_catalog(),
        "snapshot": reduced,
        "local_policy": { "policy_id": local.policy_id, "pressure": local.pressure },
    });
    json!({
        "model": CEREBRAS_MODEL,
        "messages": [
            { "role": "system", "content": ADVISOR_PROMPT },
            { "role": "user", "content": context.to_string() },
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0,
        "max_completion_tokens": 200,
    })
}

const ASSISTANT_INSTRUCTIONS: &str = "You are the Lumius assistant, built into Lumius, a \
desktop operating system based on Debian 13. Answer the user's question using the attached \
Lumius system context: a privacy-reduced snapshot of live telemetry and the decision of \
Lumius's local policy engine, which is the final authority on the active policy. Ground every \
statement about this computer in that context. Never invent metrics, processes, hardware \
details or values that are not in it; a null value means Lumius could not measure it, so say \
it is unavailable. You cannot run commands, change settings or take any action on the \
computer, and you must never claim or imply that you have done so. When something should \
change, explain what the user can do themselves. The shipped policies are balanced, \
performance, battery_saver, focus, media and development. Be concise and practical.";

fn openai_request(query: &str, reduced: &Value, local: &Policy) -> Value {
    let context = json!({
        "snapshot": reduced,
        "local_policy": local,
        "policies": policy_catalog(),
    });
    json!({
        "model": OPENAI_MODEL,
        "instructions": ASSISTANT_INSTRUCTIONS,
        "input": format!("User question:\n{query}\n\nLumius system context (JSON):\n{context}"),
        "max_output_tokens": 700,
        "store": false,
    })
}

fn validate_query(query: &str) -> Result<&str, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Type a question first.".into());
    }
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err(format!(
            "Questions can be up to {MAX_QUERY_CHARS} characters."
        ));
    }
    Ok(query)
}

// ---------------------------------------------------------------------------
// RPC entry points
// ---------------------------------------------------------------------------

/// `intel_snapshot` → { snapshot, policy }
pub fn snapshot_rpc() -> Result<Value, String> {
    let snap = snapshot();
    let policy = decide(&snap);
    Ok(json!({ "snapshot": snap, "policy": policy }))
}

/// `intel_status` → { providers: [{ id, label, model, configured, state }] }
pub fn status() -> Result<Value, String> {
    let providers: Vec<Value> = Provider::ALL
        .into_iter()
        .map(|p| {
            let configured = match p {
                Provider::Exa => exa_configured(),
                _ => provider_key(p).is_some(),
            };
            json!({
                "id": p.id(),
                "label": p.label(),
                "model": p.model(),
                "configured": configured,
                "state": if configured { "ready" } else { "unconfigured" },
            })
        })
        .collect();
    Ok(json!({ "providers": providers }))
}

/// `intel_key_set` { provider, key } → same shape as `intel_status`.
pub fn key_set(provider: &str, key: &str) -> Result<Value, String> {
    let p = Provider::parse(provider).ok_or("Unknown provider")?;
    if p == Provider::Exa {
        crate::system::exa_key_set(key)?;
    } else {
        let key = key.trim();
        if !valid_key(key) {
            return Err(format!(
                "That doesn't look like a valid {} API key.",
                p.label()
            ));
        }
        write_private(&key_path(p)?, key.as_bytes())?;
    }
    status()
}

/// `intel_advise` → { local, advice, accepted, state, note?, error? }
pub fn advise() -> Result<Value, String> {
    let snap = snapshot();
    let local = decide(&snap);
    let result = provider_key(Provider::Cerebras)
        .ok_or(ProviderError::Unconfigured)
        .and_then(|key| {
            let body = cerebras_request(&reduced(&snap), &local);
            let reply = post_json(CEREBRAS_URL, &format!("Authorization: Bearer {key}"), &body, 30)?;
            let content = reply["choices"][0]["message"]["content"]
                .as_str()
                .ok_or(ProviderError::InvalidResponse("no advice in the reply"))?;
            parse_advice(content).map_err(ProviderError::InvalidResponse)
        });
    Ok(match result {
        Ok(advice) => {
            let (accepted, note) = review(&local, &advice);
            json!({ "local": local, "advice": advice, "accepted": accepted, "state": "ready", "note": note })
        }
        Err(e) => json!({
            "local": local,
            "advice": null,
            "accepted": false,
            "state": e.state(),
            "error": e.message(Provider::Cerebras),
        }),
    })
}

/// `intel_assist` { query } → { answer, state, error? }
pub fn assist(query: &str) -> Result<Value, String> {
    let query = validate_query(query)?;
    let result = provider_key(Provider::OpenAi)
        .ok_or(ProviderError::Unconfigured)
        .and_then(|key| {
            let snap = snapshot();
            let body = openai_request(query, &reduced(&snap), &decide(&snap));
            let reply = post_json(OPENAI_URL, &format!("Authorization: Bearer {key}"), &body, 60)?;
            extract_output_text(&reply).ok_or(ProviderError::InvalidResponse("no answer text"))
        });
    Ok(match result {
        Ok(answer) => json!({ "answer": answer, "state": "ready" }),
        Err(e) => json!({
            "answer": null,
            "state": e.state(),
            "error": e.message(Provider::OpenAi),
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const MEMINFO: &str = "MemTotal:       16264060 kB\n\
MemFree:         1203448 kB\n\
MemAvailable:    8132030 kB\n\
Buffers:          204812 kB\n\
SwapCached:            0 kB\n\
SwapTotal:       2097148 kB\n\
SwapFree:        1048574 kB\n";

    fn snap() -> Snapshot {
        Snapshot {
            mem_total_kb: Some(16_000_000),
            mem_available_kb: Some(8_000_000),
            mem_available_pct: Some(50.0),
            cpu_busy_pct: Some(12.0),
            psi_cpu_some_avg10: Some(1.5),
            psi_memory_some_avg10: Some(0.0),
            ..Snapshot::default()
        }
    }

    #[test]
    fn parses_meminfo() {
        let m = parse_meminfo(MEMINFO);
        assert_eq!(m.total_kb, Some(16_264_060));
        assert_eq!(m.available_kb, Some(8_132_030));
        assert_eq!(m.swap_total_kb, Some(2_097_148));
        assert_eq!(m.swap_free_kb, Some(1_048_574));
        // Missing keys stay None rather than defaulting to zero.
        let partial = parse_meminfo("MemTotal: 1000 kB\nMemAvailable: garbage kB\n");
        assert_eq!(partial.total_kb, Some(1000));
        assert_eq!(partial.available_kb, None);
        assert_eq!(partial.swap_total_kb, None);
        assert_eq!(parse_meminfo(""), MemInfo::default());
    }

    #[test]
    fn parses_psi() {
        let cpu = "some avg10=12.34 avg60=5.00 avg300=1.00 total=123456\n\
full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n";
        assert_eq!(parse_psi_some_avg10(cpu), Some(12.34));
        let full_only = "full avg10=9.00 avg60=0.00 avg300=0.00 total=0\n";
        assert_eq!(parse_psi_some_avg10(full_only), None);
        assert_eq!(parse_psi_some_avg10(""), None);
        assert_eq!(parse_psi_some_avg10("some avg10=nan total=1"), None);
    }

    #[test]
    fn parses_cpu_load_and_uptime() {
        let a = "cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 50 0 50 350 50 0 0 0 0 0\ncpu1 50 0 50 350 50 0 0 0 0 0\nintr 1\n";
        let b = "cpu  150 0 150 750 150 0 0 0 0 0\n";
        let (ta, tb) = (parse_cpu_times(a).unwrap(), parse_cpu_times(b).unwrap());
        assert_eq!(ta, (800, 1000));
        // 200 jiffies elapsed, 100 of them idle or iowait → 50% busy.
        assert_eq!(cpu_busy_between(ta, tb), Some(50.0));
        assert_eq!(cpu_busy_between(ta, ta), None);
        assert_eq!(cpu_busy_between(tb, ta), None);
        assert_eq!(parse_cpu_cores(a), Some(2));
        assert_eq!(parse_cpu_times("cpu  1 2\n"), None);
        assert_eq!(
            parse_loadavg("0.52 1.25 2.00 1/1234 5678\n"),
            [Some(0.52), Some(1.25), Some(2.0)]
        );
        assert_eq!(parse_loadavg(""), [None, None, None]);
        assert_eq!(parse_uptime("12345.67 54321.00\n"), Some(12345));
        assert_eq!(parse_uptime(""), None);
    }

    #[test]
    fn reads_battery_from_sysfs_layout() {
        let root = std::env::temp_dir().join(format!(
            "lumius-intel-bat-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let mouse = root.join("hidpp_battery_0");
        let bat = root.join("BAT0");
        fs::create_dir_all(&mouse).unwrap();
        fs::create_dir_all(&bat).unwrap();
        fs::write(mouse.join("type"), "Battery\n").unwrap();
        fs::write(mouse.join("scope"), "Device\n").unwrap();
        fs::write(mouse.join("capacity"), "5\n").unwrap();
        fs::write(bat.join("capacity"), "18\n").unwrap();
        fs::write(bat.join("status"), "Discharging\n").unwrap();
        assert_eq!(
            read_battery(&root),
            (Some(18), Some(BatteryStatus::Discharging))
        );
        assert_eq!(read_battery(&root.join("missing")), (None, None));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn disk_usage_matches_df() {
        // 100 blocks, 40 free, 30 available to users: used 60 / (60 + 30) = 66.7%.
        assert_eq!(disk_usage(100, 40, 30), (Some(100), Some(30), Some(66.7)));
        assert_eq!(disk_usage(0, 0, 0), (None, None, None));
    }

    #[test]
    fn idle_machine_is_balanced() {
        let p = decide(&snap());
        assert_eq!(p.policy_id, "balanced");
        assert_eq!(p.label, "Balanced");
        assert_eq!(p.pressure, Pressure::Low);
        assert!(p.reasons.iter().any(|r| r.contains("50.0% of memory available")));
        assert!(p.reasons.iter().any(|r| r.contains("CPU 12.0% busy")));
    }

    #[test]
    fn low_battery_discharging_is_battery_saver_even_under_pressure() {
        let s = Snapshot {
            battery_pct: Some(18),
            battery_status: Some(BatteryStatus::Discharging),
            mem_available_pct: Some(4.0),
            ..snap()
        };
        let p = decide(&s);
        assert_eq!(p.policy_id, "battery_saver");
        assert_eq!(p.pressure, Pressure::Critical);
        assert!(p.reasons.iter().any(|r| r.contains("Battery at 18%, discharging")));
        // Charging at the same level is not a constraint.
        let charging = Snapshot {
            battery_status: Some(BatteryStatus::Charging),
            ..s
        };
        assert_eq!(decide(&charging).policy_id, "performance");
    }

    #[test]
    fn memory_and_cpu_pressure_select_performance() {
        let mem = decide(&Snapshot {
            psi_memory_some_avg10: Some(25.0),
            ..snap()
        });
        assert_eq!(mem.policy_id, "performance");
        assert_eq!(mem.pressure, Pressure::High);
        assert!(mem.reasons.iter().any(|r| r.contains("25.00%")));
        let cpu = decide(&Snapshot {
            cpu_busy_pct: Some(97.0),
            ..snap()
        });
        assert_eq!(cpu.policy_id, "performance");
        // Moderate pressure alone keeps balanced.
        let moderate = decide(&Snapshot {
            mem_available_pct: Some(15.0),
            ..snap()
        });
        assert_eq!(moderate.policy_id, "balanced");
        assert_eq!(moderate.pressure, Pressure::Moderate);
    }

    #[test]
    fn missing_telemetry_is_reported_not_invented() {
        let p = decide(&Snapshot::default());
        assert_eq!(p.policy_id, "balanced");
        assert!(p.reasons[0].contains("No memory or CPU pressure data"));
        assert!(p.reasons.iter().all(|r| !r.contains("Battery at")));
    }

    #[test]
    fn thresholds() {
        assert_eq!(falling(4.9, MEM_AVAILABLE_PCT), Pressure::Critical);
        assert_eq!(falling(9.0, MEM_AVAILABLE_PCT), Pressure::High);
        assert_eq!(falling(19.0, MEM_AVAILABLE_PCT), Pressure::Moderate);
        assert_eq!(falling(60.0, MEM_AVAILABLE_PCT), Pressure::Low);
        assert_eq!(rising(100.0, CPU_BUSY), Pressure::High);
        assert_eq!(rising(80.0, PSI_CPU), Pressure::Critical);
    }

    #[test]
    fn advice_accepts_only_shipped_ids() {
        let ok = parse_advice(r#"{"policy_id":"development","reason":"Load is steady at 3.1."}"#)
            .unwrap();
        assert_eq!(ok.policy_id, "development");
        assert_eq!(ok.reason, "Load is steady at 3.1.");
        let fenced =
            parse_advice("```json\n{\"policy_id\": \"media\", \"reason\": \"x\"}\n```").unwrap();
        assert_eq!(fenced.policy_id, "media");
        for bad in [
            r#"{"policy_id":"turbo","reason":"faster"}"#,
            r#"{"policy_id":"Balanced"}"#,
            r#"{"policy_id":"balanced; rm -rf /"}"#,
            r#"{"policy_id":7}"#,
            r#"{"reason":"no id"}"#,
            "balanced",
            "",
        ] {
            assert!(parse_advice(bad).is_err(), "accepted {bad}");
        }
        // JSON-escaped control characters survive parsing and must be stripped.
        let long = format!(r#"{{"policy_id":"focus","reason":"{}"}}"#, r"a\u0007".repeat(400));
        let clipped = parse_advice(&long).unwrap();
        assert!(clipped.reason.chars().count() <= 301);
        assert!(!clipped.reason.contains('\u{7}'));
    }

    #[test]
    fn local_policy_is_final_authority() {
        let saver = decide(&Snapshot {
            battery_pct: Some(10),
            battery_status: Some(BatteryStatus::Discharging),
            ..snap()
        });
        let perf = Advice {
            policy_id: "performance",
            reason: String::new(),
        };
        assert!(!review(&saver, &perf).0);
        let same = Advice {
            policy_id: "battery_saver",
            reason: String::new(),
        };
        assert!(review(&saver, &same).0);
        let balanced = decide(&snap());
        let dev = Advice {
            policy_id: "development",
            reason: String::new(),
        };
        assert!(review(&balanced, &dev).0);
    }

    #[test]
    fn extracts_responses_api_text() {
        let reply = json!({
            "id": "resp_1",
            "output": [
                { "type": "reasoning", "summary": [] },
                { "type": "message", "role": "assistant", "content": [
                    { "type": "output_text", "text": "Memory is fine.", "annotations": [] },
                    { "type": "refusal", "refusal": "ignored" },
                    { "type": "output_text", "text": "CPU is 12% busy." }
                ]}
            ]
        });
        assert_eq!(
            extract_output_text(&reply).as_deref(),
            Some("Memory is fine.\nCPU is 12% busy.")
        );
        assert_eq!(extract_output_text(&json!({ "output": [] })), None);
        assert_eq!(extract_output_text(&json!({ "error": "x" })), None);
    }

    #[test]
    fn http_status_mapping() {
        assert_eq!(http_error(200), None);
        assert_eq!(http_error(401), Some(ProviderError::AuthFailed));
        assert_eq!(http_error(403), Some(ProviderError::AuthFailed));
        assert_eq!(http_error(429), Some(ProviderError::RateLimited));
        assert_eq!(http_error(503), Some(ProviderError::Unavailable));
        assert_eq!(http_error(400), Some(ProviderError::Http(400)));
        assert_eq!(split_reply("{\"a\":1}\n200"), ("{\"a\":1}", 200));
        assert_eq!(split_reply("000"), ("", 0));
        assert_eq!(ProviderError::AuthFailed.state(), "auth_failed");
        assert_eq!(ProviderError::RateLimited.state(), "rate_limited");
        assert_eq!(ProviderError::Unavailable.state(), "unavailable");
    }

    #[test]
    fn reduced_snapshot_is_numbers_and_enums_only() {
        let s = Snapshot {
            taken_at: Some(1_700_000_000),
            uptime_secs: Some(7300),
            swap_total_kb: Some(2_097_152),
            swap_free_kb: Some(1_048_576),
            disk_root_available_bytes: Some(10 * 1_073_741_824),
            battery_pct: Some(80),
            battery_status: Some(BatteryStatus::NotCharging),
            ..snap()
        };
        let r = reduced(&s);
        let map = r.as_object().unwrap();
        assert!(!map.contains_key("taken_at"));
        assert_eq!(r["uptime_hours"], 2);
        assert_eq!(r["swap_used_pct"], 50.0);
        assert_eq!(r["disk_root_available_gib"], 10.0);
        for (k, v) in map {
            assert!(
                v.is_number() || v.is_null() || (k == "battery_status" && v == "not_charging"),
                "{k} = {v}"
            );
        }
        let body = openai_request("How is memory?", &r, &decide(&s));
        assert_eq!(body["model"], OPENAI_MODEL);
        assert_eq!(body["store"], false);
        let advice = cerebras_request(&r, &decide(&s));
        assert_eq!(advice["model"], CEREBRAS_MODEL);
    }

    #[test]
    fn keys_and_queries_are_validated() {
        assert!(valid_key("csk-abcDEF123_xyz"));
        assert!(!valid_key("short"));
        assert!(!valid_key("has space in it"));
        assert!(!valid_key("sk-abc\nX-Injected: 1"));
        assert!(!valid_key(&"a".repeat(201)));
        let err = key_set("openai", "not a key!!").unwrap_err();
        assert!(!err.contains("not a key"));
        assert!(key_set("anthropic", "abcdefgh12").is_err());
        assert_eq!(Provider::parse("exa"), Some(Provider::Exa));
        assert!(validate_query("   ").is_err());
        assert!(validate_query(&"q".repeat(2001)).is_err());
        assert_eq!(validate_query("  hi  "), Ok("hi"));
        assert!(assist("").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn key_file_is_private_and_atomic() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!(
            "lumius-intel-key-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cerebras-api-key");
        // A stale world-readable temp file must not be reused.
        fs::write(path.with_extension("tmp"), "stale").unwrap();
        fs::set_permissions(path.with_extension("tmp"), fs::Permissions::from_mode(0o644)).unwrap();
        write_private(&path, b"first-key-123").unwrap();
        write_private(&path, b"second-key-456").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second-key-456");
        assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        assert!(!path.with_extension("tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn live_snapshot_reads_proc() {
        let s = snapshot();
        assert!(s.mem_total_kb.is_some());
        assert!(s.process_count.is_some());
        assert!(s.mem_available_pct.is_some_and(|p| (0.0..=100.0).contains(&p)));
        assert!(shipped(decide(&s).policy_id).is_some());
    }
}
