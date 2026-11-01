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
static REGIONS: OnceLock<Mutex<HashMap<String, Region>>> = OnceLock::new();
#[derive(Default)]
struct Applied {
    dock: bool,
    normal_blur: bool,
    region: Option<[u32; 4]>,
    strut: Option<[u32; 12]>,
}
static APPLIED: OnceLock<Mutex<HashMap<Window, Applied>>> = OnceLock::new();
pub fn set_region(label: &str, a: &Value) -> Result<Value, String> {
    if !["bar", "dock", "island"].contains(&label) {
        return Err("Only shell windows have custom input regions".into());
    }
    let n = |k: &str| {
        a[k].as_f64()
            .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 8192.0)
            .ok_or(format!("Invalid region {k}"))
    };
    let rect = Region {
        x: n("x")?,
        y: n("y")?,
        width: n("width")?,
        height: n("height")?,
    };
    REGIONS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|e| e.to_string())?
        .insert(label.to_owned(), rect);
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
        if !cached.normal_blur {
            if let Some(a) = atom(c, "_KDE_NET_WM_BLUR_BEHIND_REGION") {
                let _ = c.change_property32(PropMode::REPLACE, w, a, AtomEnum::CARDINAL, &[]);
            }
            cached.normal_blur = true;
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
    let fallback = Region {
        x: 0.0,
        y: if top {
            0.0
        } else {
            (geo.height as f64 / scale - 82.0).max(0.0)
        },
        width: geo.width as f64 / scale,
        height: if label == "bar" {
            36.0
        } else if label == "island" {
            46.0
        } else {
            82.0
        },
    };
    let logical = REGIONS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()
        .and_then(|r| r.get(label).copied())
        .unwrap_or(fallback);
    let x = (logical.x * scale)
        .round()
        .clamp(0.0, geo.width as f64 - 1.0) as i16;
    let y = (logical.y * scale)
        .round()
        .clamp(0.0, geo.height as f64 - 1.0) as i16;
    let width = (logical.width * scale)
        .round()
        .clamp(1.0, (geo.width as i32 - x as i32).max(1) as f64) as u16;
    let height = (logical.height * scale)
        .round()
        .clamp(1.0, (geo.height as i32 - y as i32).max(1) as f64) as u16;
    let rect = Rectangle {
        x,
        y,
        width,
        height,
    };
    if !cached.dock {
        if let (Some(a), Some(t)) = (
            atom(c, "_NET_WM_WINDOW_TYPE"),
            atom(c, "_NET_WM_WINDOW_TYPE_DOCK"),
        ) {
            let _ = c.change_property32(PropMode::REPLACE, w, a, AtomEnum::ATOM, &[t]);
        }
        cached.dock = true;
    }
    let region = [x as u32, y as u32, width as u32, height as u32];
    if cached.region != Some(region) {
        let _ = c.shape_rectangles(SO::SET, SK::INPUT, ClipOrdering::UNSORTED, w, 0, 0, &[rect]);
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
        strut[2] = (46.0 * scale) as u32;
        strut[9] = root_geo.width.saturating_sub(1) as u32;
    } else {
        strut[3] = (82.0 * scale) as u32;
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
