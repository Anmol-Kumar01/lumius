use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
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
    // Look and feel options from Lumius 1.0; older settings files may not have them.
    let optional = |k: &str, ok: &dyn Fn(&Value) -> bool| v.get(k).is_none_or(ok);
    let one_of = |list: &'static [&'static str]| {
        move |x: &Value| x.as_str().is_some_and(|s| list.contains(&s))
    };
    if !optional("light", &one_of(&["day", "night", "auto"]))
        || !optional(
            "accent",
            &one_of(&["lumen", "violet", "rose", "amber", "mint", "graphite"]),
        )
        || !optional("iconFinish", &one_of(&["spectrum", "lumen"]))
        || !optional("leaving", &one_of(&["fold", "fade"]))
        || !optional("shelfLift", &|x| x.as_u64().is_some_and(|n| n <= 16))
        || !optional("aurora", &Value::is_boolean)
    {
        return Err("Invalid look and feel settings".into());
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
                        | "ask"
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
pub fn open_url(url: &str) -> Result<Value, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only web links can be opened".into());
    }
    spawn("xdg-open", &[url])
}
// Exa web answers. The key comes from EXA_API_KEY or a private file saved from Settings,
// and is passed to curl on stdin so it never appears in the process list.
fn exa_key_path() -> Result<std::path::PathBuf, String> {
    Ok(crate::files::config()?.join("exa-api-key"))
}
fn exa_key() -> Option<String> {
    std::env::var("EXA_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty())
        .or_else(|| fs::read_to_string(exa_key_path().ok()?).ok())
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
}
pub fn exa_key_status() -> Result<Value, String> {
    Ok(json!({ "configured": exa_key().is_some() }))
}
pub fn exa_key_set(key: &str) -> Result<Value, String> {
    let key = key.trim();
    if key.len() < 8
        || key.len() > 200
        || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("That doesn't look like an Exa API key.".into());
    }
    let path = exa_key_path()?;
    let temp = path.with_extension("tmp");
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options
        .open(&temp)
        .and_then(|mut f| f.write_all(key.as_bytes()))
        .map_err(|e| e.to_string())?;
    fs::rename(&temp, &path).map_err(|e| e.to_string())?;
    exa_key_status()
}
pub fn ask(query: &str) -> Result<Value, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("Type a question first.".into());
    }
    let key = exa_key().ok_or("Add your Exa API key in Settings → Web answers.")?;
    let body = json!({ "query": query }).to_string();
    let mut child = Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "60",
            "-X",
            "POST",
            "https://api.exa.ai/answer",
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
        .map_err(|_| "Web answers need curl, which is not installed.".to_string())?;
    child
        .stdin
        .take()
        .ok_or("curl stdin unavailable")?
        .write_all(format!("x-api-key: {key}\n").as_bytes())
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("Can't reach Exa. Check the internet connection.".into());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let (payload, code) = text.rsplit_once('\n').unwrap_or(("", text.as_ref()));
    match code.trim() {
        "200" => {}
        "401" | "403" => return Err("Exa rejected the API key. Update it in Settings → Web answers.".into()),
        "429" => return Err("Exa is busy right now. Try again in a moment.".into()),
        other => return Err(format!("Exa request failed (HTTP {other}).")),
    }
    let v: Value = serde_json::from_str(payload).map_err(|_| "Exa sent an unreadable reply.")?;
    let citations: Vec<Value> = v["citations"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|c| {
                    let url = c["url"].as_str()?;
                    Some(json!({
                        "url": url,
                        "title": c["title"].as_str().filter(|t| !t.is_empty()).unwrap_or(url),
                        "publishedDate": c["publishedDate"],
                    }))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(json!({ "answer": v["answer"].as_str().unwrap_or(""), "citations": citations }))
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
        // The island's power panel; logind lets the active local session do these.
        "poweroff" => spawn("systemctl", &["poweroff"]),
        "reboot" => spawn("systemctl", &["reboot"]),
        "logout" => spawn(
            "dbus-send",
            &[
                "--session",
                "--type=method_call",
                "--dest=org.kde.Shutdown",
                "/Shutdown",
                "org.kde.Shutdown.logout",
            ],
        ),
        // The bar's three workspace pills map to KWin virtual desktops 1-3.
        "workspace-1" | "workspace-2" | "workspace-3" => spawn(
            "dbus-send",
            &[
                "--session",
                "--type=method_call",
                "--dest=org.kde.KWin",
                "/KWin",
                "org.kde.KWin.setCurrentDesktop",
                &format!("int32:{}", &id[10..]),
            ],
        ),
        "installer" => {
            if !std::path::Path::new("/run/live/medium/live/filesystem.squashfs").exists() {
                return Err("The installer is available from the live USB session.".into());
            }
            spawn("calamares-install-debian", &[])
        }
        "network" => spawn("systemsettings", &["kcm_networkmanagement"]),
        "bluetooth" => spawn("systemsettings", &["kcm_bluetooth"]),
        "display" => spawn("systemsettings", &["kcm_kscreen"]),
        "energy" => spawn("systemsettings", &["kcm_powerdevilprofilesconfig"]),
        "users" => spawn("systemsettings", &["kcm_users"]),
        _ => Err("Unknown application".into()),
    }
}
