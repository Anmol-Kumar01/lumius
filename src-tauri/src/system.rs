use serde_json::{json, Value};
use std::{
    fs,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
pub fn run(bin: &str, args: &[&str]) -> Result<String, String> {
    let mut c = Command::new(bin)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{bin}: {e}"))?;
    let start = Instant::now();
    loop {
        match c.try_wait() {
            Ok(Some(_)) => {
                let o = c.wait_with_output().map_err(|e| e.to_string())?;
                return if o.status.success() {
                    Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    Err(format!(
                        "{bin}: {}",
                        String::from_utf8_lossy(&o.stderr).trim()
                    ))
                };
            }
            Ok(None) => {}
            Err(e) => return Err(e.to_string()),
        }
        if start.elapsed() > Duration::from_secs(3) {
            let _ = c.kill();
            let _ = c.wait();
            return Err(format!("{bin} timed out"));
        }
        std::thread::sleep(Duration::from_millis(15));
    }
}
fn spawn(bin: &str, args: &[&str]) -> Result<Value, String> {
    let mut child = Command::new(bin)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(Value::Null)
}
pub fn settings_get() -> Result<Value, String> {
    let p = crate::files::config()?.join("settings.json");
    if !p.exists() {
        let mut pinned = vec!["files", "browser", "music", "terminal", "settings"];
        if std::path::Path::new("/run/live/medium/live/filesystem.squashfs").exists() {
            pinned.push("installer");
        }
        return Ok(
            json!({"glass":65,"reducedMotion":false,"reducedTransparency":false,"wallpaper":"aurora","pinned":pinned}),
        );
    }
    let value: Value = serde_json::from_slice(&fs::read(p).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Settings file is invalid: {e}"))?;
    validate_settings(&value)?;
    Ok(value)
}
fn validate_settings(v: &Value) -> Result<(), String> {
    if !v["glass"].as_u64().is_some_and(|n| n <= 100)
        || !v["reducedMotion"].is_boolean()
        || !v["reducedTransparency"].is_boolean()
        || !matches!(v["wallpaper"].as_str(), Some("aurora" | "dusk" | "ocean"))
    {
        return Err("Invalid settings".into());
    }
    let pins = v["pinned"].as_array().ok_or("Invalid pinned apps")?;
    let unique: std::collections::HashSet<_> = pins.iter().filter_map(Value::as_str).collect();
    if pins.len() > 6
        || unique.len() != pins.len()
        || pins.iter().any(|s| {
            !matches!(
                s.as_str(),
                Some(
                    "files"
                        | "settings"
                        | "music"
                        | "browser"
                        | "terminal"
                        | "store"
                        | "installer"
                )
            )
        })
    {
        return Err("Invalid app identifiers".into());
    }
    Ok(())
}
pub fn settings_set(v: Value) -> Result<Value, String> {
    validate_settings(&v)?;
    let previous = settings_get().ok();
    let p = crate::files::config()?;
    let temp = p.join("settings.json.tmp");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temp, p.join("settings.json")).map_err(|e| e.to_string())?;
    if previous.as_ref().map(|p| &p["wallpaper"]) != Some(&v["wallpaper"]) {
        apply_wallpaper(v["wallpaper"].as_str().unwrap_or("aurora"))
            .map_err(|e| format!("Settings saved; desktop wallpaper could not be applied: {e}"))?;
    }
    Ok(v)
}
fn apply_wallpaper(theme: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let path = format!("/usr/share/wallpapers/lumius/{theme}.svg");
        if std::path::Path::new(&path).exists() {
            let script=format!("var ds=desktops(); for(var i=0;i<ds.length;i++){{ds[i].wallpaperPlugin='org.kde.image';ds[i].currentConfigGroup=['Wallpaper','org.kde.image','General'];ds[i].writeConfig('Image','file://{path}');}}");
            run(
                "qdbus6",
                &[
                    "org.kde.plasmashell",
                    "/PlasmaShell",
                    "org.kde.PlasmaShell.evaluateScript",
                    &script,
                ],
            )?;
        } else {
            return Err("Lumius wallpaper assets are unavailable in this session".into());
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = theme;
    Ok(())
}
pub fn status() -> Result<Value, String> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<Option<(Instant, Value)>>> =
        std::sync::OnceLock::new();
    let mut cache = CACHE
        .get_or_init(|| std::sync::Mutex::new(None))
        .lock()
        .map_err(|e| e.to_string())?;
    if let Some((when, value)) = cache.as_ref() {
        if when.elapsed() < Duration::from_millis(900) {
            return Ok(value.clone());
        }
    }
    let volume = run("wpctl", &["get-volume", "@DEFAULT_AUDIO_SINK@"])
        .ok()
        .and_then(|s| {
            s.split_whitespace()
                .nth(1)
                .and_then(|n| n.parse::<f64>().ok())
        })
        .map(|v| (v * 100.0).round() as u64);
    let brightness = run("brightnessctl", &["-c", "backlight", "-m"])
        .ok()
        .and_then(|s| {
            s.split(',')
                .nth(3)
                .map(|s| s.trim_end_matches('%').parse::<u64>().ok())
                .flatten()
        });
    let title = run("playerctl", &["metadata", "--format", "{{title}}"])
        .unwrap_or_else(|_| "No music playing".into());
    let artist = run("playerctl", &["metadata", "--format", "{{artist}}"]).unwrap_or_default();
    let playing = run("playerctl", &["status"]).is_ok_and(|s| s == "Playing");
    let battery = fs::read_dir("/sys/class/power_supply")
        .ok()
        .and_then(|mut it| {
            it.find_map(|e| {
                let p = e.ok()?.path();
                if fs::read_to_string(p.join("type")).ok()?.trim() != "Battery" {
                    return None;
                }
                fs::read_to_string(p.join("capacity"))
                    .ok()?
                    .trim()
                    .parse::<u64>()
                    .ok()
            })
        });
    let value = json!({"volume":volume,"brightness":brightness,"title":title,"artist":artist,"playing":playing,"battery":battery,"platform":std::env::consts::OS,"live":std::path::Path::new("/run/live/medium/live/filesystem.squashfs").exists()});
    *cache = Some((Instant::now(), value.clone()));
    Ok(value)
}
pub fn control(action: &str, value: Option<u64>) -> Result<Value, String> {
    match action {
        "play-pause" | "next" | "previous" => {
            run("playerctl", &[action])?;
        }
        "volume" => {
            let n = value.ok_or("Missing volume")?.min(100);
            run(
                "wpctl",
                &["set-volume", "@DEFAULT_AUDIO_SINK@", &format!("{n}%")],
            )?;
        }
        "brightness" => {
            let n = value.ok_or("Missing brightness")?.clamp(5, 100);
            run(
                "brightnessctl",
                &["-c", "backlight", "set", &format!("{n}%")],
            )?;
        }
        _ => return Err("Unsupported control".into()),
    }
    Ok(Value::Null)
}
pub fn open(path: &str) -> Result<Value, String> {
    let p = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    return spawn("xdg-open", &[p.to_str().ok_or("Unsupported filename")?]);
    #[cfg(not(target_os = "linux"))]
    {
        let _ = p;
        Err("File opening is supported in the Linux session".into())
    }
}
pub fn launch(id: &str) -> Result<Value, String> {
    match id {
        // Chromium supports Chrome Web Store extensions; Firefox remains as a fallback.
        "browser" => spawn("chromium", &[]).or_else(|_| spawn("firefox-esr", &[])),
        "music" => spawn("vlc", &[]),
        "terminal" => spawn("konsole", &[]),
        "store" => spawn("plasma-discover", &[]),
        "launcher" => spawn(
            "dbus-send",
            &[
                "--session",
                "--type=method_call",
                "--dest=org.kde.krunner",
                "/App",
                "org.kde.krunner.App.display",
            ],
        ),
        // KDE's prompt offers shut down, restart and log out.
        "power" => spawn(
            "dbus-send",
            &[
                "--session",
                "--type=method_call",
                "--dest=org.kde.LogoutPrompt",
                "/LogoutPrompt",
                "org.kde.LogoutPrompt.promptAll",
            ],
        ),
        "lock" => spawn("loginctl", &["lock-session"]),
        "installer" => {
            if !std::path::Path::new("/run/live/medium/live/filesystem.squashfs").exists() {
                return Err("The installer is available from the live USB session.".into());
            }
            spawn("calamares-install-debian", &[])
        }
        "network" => spawn("systemsettings", &["kcm_networkmanagement"]),
        "bluetooth" => spawn("systemsettings", &["kcm_bluetooth"]),
        "display" => spawn("systemsettings", &["kcm_kscreen"]),
        _ => Err("Unknown application".into()),
    }
}
