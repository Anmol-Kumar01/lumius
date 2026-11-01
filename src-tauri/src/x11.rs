// X11 integration for owned Lumius windows: blur, reserved space and click-through.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};
use x11rb::{
    connection::Connection,
    protocol::{
        shape::{ConnectionExt as _, SK, SO},
        xproto::{
            AtomEnum, ClientMessageEvent, ClipOrdering, ConfigureWindowAux, ConnectionExt,
            EventMask, PropMode, Rectangle, Window,
        },
    },
    wrapper::ConnectionExt as _,
};
#[derive(Clone, Copy)]
struct Region {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
// Reserved screen edges: the top capsules (8 + 44 + 8) and the attached shelf.
pub const BAR: f64 = 60.0;
pub const SHELF: f64 = 78.0;
static REGIONS: OnceLock<Mutex<HashMap<String, Vec<Region>>>> = OnceLock::new();
#[derive(Default)]
struct Applied {
    dock: bool,
    normal_blur: bool,
    region: Option<Vec<u32>>,
    strut: Option<[u32; 12]>,
}
static APPLIED: OnceLock<Mutex<HashMap<Window, Applied>>> = OnceLock::new();
pub fn set_region(label: &str, a: &Value) -> Result<Value, String> {
    if !["bar", "dock", "island", "files", "settings", "ask"].contains(&label) {
        return Err("Only Lumius windows have custom regions".into());
    }
    let n = |r: &Value, k: &str| {
        r[k].as_f64()
            .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 8192.0)
            .ok_or(format!("Invalid region {k}"))
    };
    let parse = |r: &Value| -> Result<Region, String> {
        Ok(Region {
            x: n(r, "x")?,
            y: n(r, "y")?,
            width: n(r, "width")?,
            height: n(r, "height")?,
        })
    };
    // The bar is two separate capsules, so a region may be several rectangles.
    let rects = match a["rects"].as_array() {
        Some(list) if !list.is_empty() && list.len() <= 64 => {
            list.iter().map(parse).collect::<Result<Vec<_>, _>>()?
        }
        Some(_) => return Err("Invalid region list".into()),
        None => vec![parse(a)?],
    };
    REGIONS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|e| e.to_string())?
        .insert(label.to_owned(), rects);
    Ok(json!(null))
}
fn atom(c: &impl Connection, name: &str) -> Option<u32> {
    static ATOMS: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
    let mut map = ATOMS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()?;
    if let Some(a) = map.get(name) {
        return Some(*a);
    }
    let a = c
        .intern_atom(false, name.as_bytes())
        .ok()?
        .reply()
        .ok()?
        .atom;
    map.insert(name.to_owned(), a);
    Some(a)
}
fn text(c: &impl Connection, w: Window, name: &str) -> String {
    let Some(a) = atom(c, name) else {
        return String::new();
    };
    c.get_property(false, w, a, AtomEnum::ANY, 0, 256)
        .ok()
        .and_then(|r| r.reply().ok())
        .map(|r| String::from_utf8_lossy(&r.value).to_string())
        .unwrap_or_default()
}
fn fullscreen(c: &impl Connection, root: Window) -> bool {
    let (Some(active), Some(state), Some(full)) = (
        atom(c, "_NET_ACTIVE_WINDOW"),
        atom(c, "_NET_WM_STATE"),
        atom(c, "_NET_WM_STATE_FULLSCREEN"),
    ) else {
        return false;
    };
    let active = c
        .get_property(false, root, active, AtomEnum::WINDOW, 0, 1)
        .ok()
        .and_then(|r| r.reply().ok())
        .and_then(|r| r.value32().and_then(|mut i| i.next()));
    active.is_some_and(|w| {
        c.get_property(false, w, state, AtomEnum::ATOM, 0, 64)
            .ok()
            .and_then(|r| r.reply().ok())
            .is_some_and(|r| r.value32().is_some_and(|mut i| i.any(|v| v == full)))
    })
}
fn clients(c: &impl Connection, root: Window) -> Vec<Window> {
    // Reparenting window managers can nest clients below frame/wrapper windows.
    // EWMH provides the actual client IDs regardless of that tree structure.
    if let Some(a) = atom(c, "_NET_CLIENT_LIST") {
        if let Ok(cookie) = c.get_property(false, root, a, AtomEnum::WINDOW, 0, 16384) {
            if let Ok(reply) = cookie.reply() {
                let ids = reply
                    .value32()
                    .map(|i| i.collect::<Vec<_>>())
                    .unwrap_or_default();
                if !ids.is_empty() {
                    return ids;
                }
            }
        }
    }
    // Xvfb and bare X servers have no EWMH window manager.
    c.query_tree(root)
        .ok()
        .and_then(|r| r.reply().ok())
        .map(|r| r.children)
        .unwrap_or_default()
}
pub fn start(scale: f64) {
    std::thread::spawn(move || {
        let (c, screen) = match x11rb::connect(None) {
            Ok(value) => value,
            Err(error) => {
                eprintln!("Lumius X11 connection failed: {error}");
                return;
            }
        };
        eprintln!(
            "Lumius X11 integration connected; process {}",
            std::process::id()
        );
        let root = c.setup().roots[screen].root;
        loop {
            let full = fullscreen(&c, root);
            let windows = clients(&c, root);
            for &w in &windows {
                apply(&c, root, w, full, scale);
            }
            if let Ok(mut map) = APPLIED.get_or_init(|| Mutex::new(HashMap::new())).lock() {
                map.retain(|id, _| windows.contains(id));
            }
            let _ = c.flush();
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
    });
}
fn apply(c: &impl Connection, root: Window, w: Window, full: bool, scale: f64) {
    let title = text(c, w, "_NET_WM_NAME");
    let Some(label) = title.strip_prefix("Lumius ") else {
        return;
    };
    if let Some(pid_atom) = atom(c, "_NET_WM_PID") {
        let pid = c
            .get_property(false, w, pid_atom, AtomEnum::CARDINAL, 0, 1)
            .ok()
            .and_then(|r| r.reply().ok())
            .and_then(|r| r.value32().and_then(|mut i| i.next()));
        if pid.is_some_and(|p| p != std::process::id()) {
            return;
        }
    }
    let shell = ["island", "dock", "bar"].contains(&label);
    let Ok(mut applied) = APPLIED.get_or_init(|| Mutex::new(HashMap::new())).lock() else {
        return;
    };
    let cached = applied.entry(w).or_default();
    if !shell {
        // App windows blur only behind their rounded glass, not the shadow margin.
        let region: Vec<u32> = REGIONS
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .ok()
            .and_then(|r| r.get(label).cloned())
            .unwrap_or_default()
            .iter()
            .flat_map(|r| {
                [r.x, r.y, r.width, r.height].map(|v| (v * scale).round().max(0.0) as u32)
            })
            .collect();
        if !cached.normal_blur || cached.region.as_ref() != Some(&region) {
            if let Some(a) = atom(c, "_KDE_NET_WM_BLUR_BEHIND_REGION") {
                let _ = c.change_property32(PropMode::REPLACE, w, a, AtomEnum::CARDINAL, &region);
            }
            cached.normal_blur = true;
            cached.region = Some(region);
        }
        return;
    }
    let Ok(cookie) = c.get_geometry(root) else {
        return;
    };
    let Ok(root_geo) = cookie.reply() else { return };
    let Ok(cookie) = c.get_geometry(w) else {
        return;
    };
    let Ok(geo) = cookie.reply() else { return };
    let top = label != "dock";
    // Heights match the shell in style.css: capsule bar, closed island, attached shelf.
    let fallback = Region {
        x: 0.0,
        y: if top {
            0.0
        } else {
            (geo.height as f64 / scale - SHELF).max(0.0)
        },
        width: geo.width as f64 / scale,
        height: if label == "bar" {
            BAR
        } else if label == "island" {
            38.0
        } else {
            SHELF
        },
    };
    let logical = REGIONS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()
        .and_then(|r| r.get(label).cloned())
        .unwrap_or_else(|| vec![fallback]);
    let rects: Vec<Rectangle> = logical
        .iter()
        .map(|r| {
            let x = (r.x * scale).round().clamp(0.0, geo.width as f64 - 1.0) as i16;
            let y = (r.y * scale).round().clamp(0.0, geo.height as f64 - 1.0) as i16;
            Rectangle {
                x,
                y,
                width: (r.width * scale)
                    .round()
                    .clamp(1.0, (geo.width as i32 - x as i32).max(1) as f64)
                    as u16,
                height: (r.height * scale)
                    .round()
                    .clamp(1.0, (geo.height as i32 - y as i32).max(1) as f64)
                    as u16,
            }
        })
        .collect();
    // Auto-hide over fullscreen apps uses the bounding box of every rectangle.
    let x = rects.iter().map(|r| r.x).min().unwrap_or(0);
    let y = rects.iter().map(|r| r.y).min().unwrap_or(0);
    let width = rects
        .iter()
        .map(|r| r.x as i32 + r.width as i32)
        .max()
        .unwrap_or(1)
        .saturating_sub(x as i32)
        .max(1) as u16;
    let height = rects
        .iter()
        .map(|r| r.y as i32 + r.height as i32)
        .max()
        .unwrap_or(1)
        .saturating_sub(y as i32)
        .max(1) as u16;
    if !cached.dock {
        if let (Some(a), Some(t)) = (
            atom(c, "_NET_WM_WINDOW_TYPE"),
            atom(c, "_NET_WM_WINDOW_TYPE_DOCK"),
        ) {
            let _ = c.change_property32(PropMode::REPLACE, w, a, AtomEnum::ATOM, &[t]);
        }
        cached.dock = true;
    }
    let region: Vec<u32> = rects
        .iter()
        .flat_map(|r| [r.x as u32, r.y as u32, r.width as u32, r.height as u32])
        .collect();
    if cached.region.as_ref() != Some(&region) {
        let _ = c.shape_rectangles(SO::SET, SK::INPUT, ClipOrdering::UNSORTED, w, 0, 0, &rects);
        if let Some(a) = atom(c, "_KDE_NET_WM_BLUR_BEHIND_REGION") {
            let _ = c.change_property32(PropMode::REPLACE, w, a, AtomEnum::CARDINAL, &region);
        }
        cached.region = Some(region);
    }
    if label == "island" {
        keep_above_bar(c, root, w);
    }
    let mut strut = [0u32; 12];
    if top {
        strut[2] = (BAR * scale) as u32;
        strut[9] = root_geo.width.saturating_sub(1) as u32;
    } else {
        strut[3] = (SHELF * scale) as u32;
        strut[11] = root_geo.width.saturating_sub(1) as u32;
    }
    if cached.strut != Some(strut) {
        if let Some(a) = atom(c, "_NET_WM_STRUT_PARTIAL") {
            let _ = c.change_property32(PropMode::REPLACE, w, a, AtomEnum::CARDINAL, &strut);
        }
        cached.strut = Some(strut);
    }
    let Ok(cookie) = c.query_pointer(root) else {
        return;
    };
    let Ok(p) = cookie.reply() else { return };
    let Ok(cookie) = c.translate_coordinates(w, root, 0, 0) else {
        return;
    };
    let Ok(position) = cookie.reply() else { return };
    let inside_x = p.root_x as i32 >= position.dst_x as i32 + x as i32
        && (p.root_x as i32) < position.dst_x as i32 + x as i32 + width as i32;
    let normal_y = if top {
        0
    } else {
        root_geo.height as i32 - geo.height as i32
    };
    let hidden_y = if top {
        3 - y as i32 - height as i32
    } else {
        root_geo.height as i32 - y as i32 - 3
    };
    let hidden = if top {
        position.dst_y < 0
    } else {
        position.dst_y as i32 >= hidden_y
    };
    let reveal = inside_x
        && if top {
            p.root_y < (if hidden { 4 } else { y as i32 + height as i32 }) as i16
        } else {
            p.root_y
                > (if hidden {
                    root_geo.height as i32 - 4
                } else {
                    normal_y + y as i32
                }) as i16
        };
    let target_y = if full && !reveal { hidden_y } else { normal_y };
    if position.dst_y as i32 != target_y {
        let _ = c.configure_window(w, &ConfigureWindowAux::new().y(target_y));
    }
}
// The full-width bar and the island are both keep-above docks; KWin may stack the bar
// over the island. Ask the window manager to restack the island above the bar.
fn keep_above_bar(c: &impl Connection, root: Window, island: Window) {
    let (Some(list), Some(restack)) = (
        atom(c, "_NET_CLIENT_LIST_STACKING"),
        atom(c, "_NET_RESTACK_WINDOW"),
    ) else {
        return;
    };
    let Some(stack): Option<Vec<u32>> = c
        .get_property(false, root, list, AtomEnum::WINDOW, 0, 1024)
        .ok()
        .and_then(|r| r.reply().ok())
        .and_then(|r| r.value32().map(|i| i.collect()))
    else {
        return;
    };
    let Some(island_at) = stack.iter().position(|&w| w == island) else {
        return;
    };
    let Some(bar_at) = stack
        .iter()
        .position(|&w| text(c, w, "_NET_WM_NAME") == "Lumius bar")
    else {
        return;
    };
    if bar_at > island_at {
        let event = ClientMessageEvent::new(32, island, restack, [2, stack[bar_at], 0, 0, 0]);
        let _ = c.send_event(
            false,
            root,
            EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
            event,
        );
        let _ = c.flush();
    }
}
fn atoms(c: &impl Connection, w: Window, name: &str) -> Vec<u32> {
    atom(c, name)
        .and_then(|a| c.get_property(false, w, a, AtomEnum::ATOM, 0, 64).ok())
        .and_then(|r| r.reply().ok())
        .and_then(|r| r.value32().map(|i| i.collect()))
        .unwrap_or_default()
}
// Open application windows for the shelf chips, plus the current workspace.
pub fn windows() -> Result<Value, String> {
    let (c, screen) = x11rb::connect(None).map_err(|e| e.to_string())?;
    let root = c.setup().roots[screen].root;
    let active = atom(&c, "_NET_ACTIVE_WINDOW")
        .and_then(|a| c.get_property(false, root, a, AtomEnum::WINDOW, 0, 1).ok())
        .and_then(|r| r.reply().ok())
        .and_then(|r| r.value32().and_then(|mut i| i.next()));
    let normal = atom(&c, "_NET_WM_WINDOW_TYPE_NORMAL");
    let skip = atom(&c, "_NET_WM_STATE_SKIP_TASKBAR");
    let hidden = atom(&c, "_NET_WM_STATE_HIDDEN");
    let mut list = Vec::new();
    for w in clients(&c, root) {
        let title = text(&c, w, "_NET_WM_NAME");
        let types = atoms(&c, w, "_NET_WM_WINDOW_TYPE");
        let state = atoms(&c, w, "_NET_WM_STATE");
        if title.is_empty()
            || normal.is_some_and(|n| !types.is_empty() && !types.contains(&n))
            || skip.is_some_and(|s| state.contains(&s))
        {
            continue;
        }
        let class = c
            .get_property(false, w, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 256)
            .ok()
            .and_then(|r| r.reply().ok())
            .map(|r| {
                let parts: Vec<String> = r
                    .value
                    .split(|b| *b == 0)
                    .map(|p| String::from_utf8_lossy(p).to_lowercase())
                    .collect();
                parts.get(1).or(parts.first()).cloned().unwrap_or_default()
            })
            .unwrap_or_default();
        list.push(json!({
            "id": w,
            "title": title,
            "class": class,
            "active": active == Some(w),
            "minimized": hidden.is_some_and(|h| state.contains(&h)),
        }));
    }
    let desktop = atom(&c, "_NET_CURRENT_DESKTOP")
        .and_then(|a| c.get_property(false, root, a, AtomEnum::CARDINAL, 0, 1).ok())
        .and_then(|r| r.reply().ok())
        .and_then(|r| r.value32().and_then(|mut i| i.next()));
    Ok(json!({ "windows": list, "desktop": desktop }))
}
// Raise a window chosen on the shelf; a second click on the active window minimizes it.
pub fn activate(id: u32) -> Result<Value, String> {
    let (c, screen) = x11rb::connect(None).map_err(|e| e.to_string())?;
    let root = c.setup().roots[screen].root;
    if !clients(&c, root).contains(&id) {
        return Err("That window has closed".into());
    }
    let active = atom(&c, "_NET_ACTIVE_WINDOW").ok_or("No window manager is running")?;
    let current = c
        .get_property(false, root, active, AtomEnum::WINDOW, 0, 1)
        .ok()
        .and_then(|r| r.reply().ok())
        .and_then(|r| r.value32().and_then(|mut i| i.next()));
    let hidden = atom(&c, "_NET_WM_STATE_HIDDEN")
        .is_some_and(|h| atoms(&c, id, "_NET_WM_STATE").contains(&h));
    let event = if current == Some(id) && !hidden {
        let change = atom(&c, "WM_CHANGE_STATE").ok_or("No window manager is running")?;
        ClientMessageEvent::new(32, id, change, [3, 0, 0, 0, 0])
    } else {
        ClientMessageEvent::new(32, id, active, [2, 0, 0, 0, 0])
    };
    c.send_event(
        false,
        root,
        EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
        event,
    )
    .map_err(|e| e.to_string())?;
    c.flush().map_err(|e| e.to_string())?;
    Ok(Value::Null)
}
