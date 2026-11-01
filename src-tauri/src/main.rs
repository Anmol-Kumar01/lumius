#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod files;
mod intelligence;
mod system;
#[cfg(test)]
mod tests;
#[cfg(target_os = "linux")]
mod x11;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{atomic::AtomicBool, Arc, Mutex},
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
const ISLAND_CLOSED: (f64, f64) = (290.0, 64.0);
const ISLAND_OPEN: (f64, f64) = (530.0, 250.0);
#[derive(Default)]
pub struct Shared {
    transfers: Mutex<HashMap<String, Value>>,
    cancel: Mutex<HashMap<String, Arc<AtomicBool>>>,
    settings_lock: Mutex<()>,
}
#[tauri::command]
async fn rpc(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<Shared>>,
    command: String,
    args: Value,
) -> Result<Value, String> {
    if command == "window_region" {
        #[cfg(target_os = "linux")]
        return x11::set_region(window.label(), &args);
        #[cfg(not(target_os = "linux"))]
        return Ok(Value::Null);
    }
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let diagnostics = std::env::var_os("LUMIUS_DIAGNOSTICS").is_some();
        if diagnostics {
            eprintln!("RPC begin: {command}");
        }
        let result = dispatch(app, shared, &command, args);
        if diagnostics {
            eprintln!("RPC end: {command}, success={}", result.is_ok());
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
fn field<'a>(v: &'a Value, k: &str) -> Result<&'a str, String> {
    v[k].as_str().ok_or(format!("Missing {k}"))
}
fn dispatch(app: tauri::AppHandle, state: Arc<Shared>, c: &str, a: Value) -> Result<Value, String> {
    match c {
        "home" => Ok(json!(dirs::home_dir().ok_or("Home directory unavailable")?)),
        "list" => files::list(field(&a, "path")?),
        "mkdir" => files::mkdir(field(&a, "path")?, field(&a, "name")?),
        "rename" => files::rename(field(&a, "path")?, field(&a, "name")?),
        "transfer" => files::transfer(
            state,
            field(&a, "source")?,
            field(&a, "destination")?,
            a["move"].as_bool().unwrap_or(false),
        ),
        "transfers" => Ok(json!(state
            .transfers
            .lock()
            .map_err(|e| e.to_string())?
            .values()
            .cloned()
            .collect::<Vec<_>>())),
        "cancel" => {
            if let Some(flag) = state
                .cancel
                .lock()
                .map_err(|e| e.to_string())?
                .get(field(&a, "id")?)
            {
                flag.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            Ok(Value::Null)
        }
        "trash" => {
            trash::delete(field(&a, "path")?).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "trash_list" => files::trash_list(),
        "restore" => files::restore(field(&a, "id")?),
        "extract" => files::extract(field(&a, "path")?),
        "preview" => files::preview(field(&a, "path")?),
        "index" => files::index(),
        "search" => files::search(field(&a, "query")?),
        "mounts" => files::mounts(),
        "settings_get" => system::settings_get(),
        "settings_set" => {
            let _guard = state.settings_lock.lock().map_err(|e| e.to_string())?;
            system::settings_set(a["settings"].clone())
        }
        "status" => system::status(),
        "control" => system::control(field(&a, "action")?, a["value"].as_u64()),
        "open" => system::open(field(&a, "path")?),
        "open_url" => system::open_url(field(&a, "url")?),
        "ask" => system::ask(field(&a, "query")?),
        "exa_key_status" => system::exa_key_status(),
        "exa_key_set" => system::exa_key_set(field(&a, "key")?),
        "intel_snapshot" => intelligence::snapshot_rpc(),
        "intel_status" => intelligence::status(),
        "intel_key_set" => intelligence::key_set(field(&a, "provider")?, field(&a, "key")?),
        "intel_advise" => intelligence::advise(),
        "intel_assist" => intelligence::assist(field(&a, "query")?),
        "launch" => {
            let id = field(&a, "id")?;
            if ["files", "settings", "ask"].contains(&id) {
                open_window(&app, id)?;
                Ok(Value::Null)
            } else {
                system::launch(id)
            }
        }
        "windows" => x11::windows(),
        "window_activate" => x11::activate(
            a["id"]
                .as_u64()
                .and_then(|id| u32::try_from(id).ok())
                .ok_or("Invalid window")?,
        ),
        "island_expand" => {
            // The window leaves room for the island's shadow; the island itself is
            // 230x38 closed and 470x196 open (style.css).
            let (width, height) = if a["expanded"].as_bool().unwrap_or(false) {
                ISLAND_OPEN
            } else {
                ISLAND_CLOSED
            };
            if let Some(w) = app.get_webview_window("island") {
                w.set_size(tauri::LogicalSize::new(width, height))
                    .map_err(|e| e.to_string())?;
                if let Some(m) = w.primary_monitor().map_err(|e| e.to_string())? {
                    w.set_position(tauri::LogicalPosition::new(
                        m.position().x as f64 / m.scale_factor()
                            + (m.size().width as f64 / m.scale_factor() - width) / 2.0,
                        m.position().y as f64 / m.scale_factor(),
                    ))
                    .map_err(|e| e.to_string())?;
                }
            }
            Ok(Value::Null)
        }
        _ => Err("Unknown command".into()),
    }
}
fn open_window(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(id) {
        w.unminimize().map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        id,
        WebviewUrl::App(format!("index.html?view={id}").into()),
    )
    .title(format!("Lumius {id}"))
    .inner_size(1120.0, 740.0)
    .min_inner_size(760.0, 500.0)
    .transparent(true)
    .disable_drag_drop_handler()
    .decorations(false)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            let _ = open_window(
                app,
                if args.iter().any(|a| a == "--settings") {
                    "settings"
                } else {
                    "files"
                },
            );
        }))
        .manage(Arc::new(Shared::default()))
        .invoke_handler(tauri::generate_handler![rpc])
        .setup(|app| {
            files::recover_transfers(app.state::<Arc<Shared>>().inner());
            if std::env::args().any(|a| a == "--shell") {
                let monitor = app
                    .get_webview_window("main")
                    .and_then(|w| w.primary_monitor().ok().flatten());
                if let Some(main) = app.get_webview_window("main") {
                    main.close()?;
                }
                for (id, width, height) in [
                    ("bar", 1920.0, x11::BAR),
                    ("island", ISLAND_CLOSED.0, ISLAND_CLOSED.1),
                    // Full width so the shelf can grow with window chips; tooltips and
                    // the hover lift need headroom above the 78px shelf.
                    ("dock", 1920.0, x11::SHELF + 56.0),
                ] {
                    let width = if id != "island" {
                        monitor
                            .as_ref()
                            .map(|m| m.size().width as f64 / m.scale_factor())
                            .unwrap_or(width)
                    } else {
                        width
                    };
                    let w = WebviewWindowBuilder::new(
                        app,
                        id,
                        WebviewUrl::App(format!("index.html?view={id}").into()),
                    )
                    .title(format!("Lumius {id}"))
                    .inner_size(width, height)
                    .min_inner_size(1.0, 1.0)
                    .transparent(true)
                    .decorations(false)
                    .resizable(true)
                    .disable_drag_drop_handler()
                    .shadow(false)
                    .skip_taskbar(true)
                    .always_on_top(true)
                    .closable(false)
                    .minimizable(false)
                    .maximizable(false)
                    .visible_on_all_workspaces(true)
                    .build()?;
                    if let Some(m) = w.primary_monitor()? {
                        let scale = m.scale_factor();
                        let width = if id != "island" {
                            m.size().width as f64 / scale
                        } else {
                            width
                        };
                        w.set_size(tauri::LogicalSize::new(width, height))?;
                        let x = m.position().x as f64 / scale
                            + (m.size().width as f64 / scale - width) / 2.0;
                        let y = m.position().y as f64 / scale
                            + if id == "dock" {
                                m.size().height as f64 / scale - height
                            } else {
                                0.0
                            };
                        w.set_position(tauri::LogicalPosition::new(x, y))?;
                    }
                }
            }
            if std::env::args().any(|a| a == "--settings") {
                if let Some(main) = app.get_webview_window("main") {
                    main.close()?;
                }
                open_window(app.handle(), "settings").map_err(std::io::Error::other)?;
            }
            #[cfg(target_os = "linux")]
            {
                let scale = app
                    .webview_windows()
                    .values()
                    .next()
                    .map(|w| w.scale_factor().unwrap_or(1.0))
                    .unwrap_or(1.0);
                x11::start(scale);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Lumius failed to start");
}
