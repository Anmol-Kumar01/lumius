import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { call, native } from "./bridge";
import { GlassIcon } from "./GlassIcon";
import type { OpenWindow, Settings, Status, Transfer } from "./types";

// Lumius 1.0 shell: capsule bar, Dynamic Island, shelf and window frame.

export const appNames: Record<string, string> = {
  files: "Files",
  settings: "Settings",
  music: "Music",
  browser: "Browser",
  terminal: "Terminal",
  store: "Software",
  ask: "Ask",
  installer: "Install Lumius",
};
export const appIcon: Record<string, string> = {
  files: "files",
  settings: "settings",
  music: "music",
  browser: "browser",
  terminal: "terminal",
  store: "software",
  ask: "ask",
  installer: "installer",
  launcher: "lumius",
  trash: "trash",
  apps: "apps",
};
export const appGlow: Record<string, string> = {
  launcher: "#5A6BFF",
  files: "#2563FF",
  browser: "#1F7BFF",
  music: "#FF2D63",
  ask: "#7B3FF2",
  terminal: "#56607A",
  settings: "#4E5B76",
  store: "#0EA5E9",
  installer: "#1F4BFF",
  trash: "#5E6B85",
  apps: "#5865F2",
};
export const accents: Record<Settings["accent"], string> = {
  lumen: "#1F4BFF",
  violet: "#7B3FF2",
  rose: "#E8245A",
  amber: "#E08600",
  mint: "#0F9F74",
  graphite: "#4E5B76",
};

// 20px line glyphs from the design; `fill` ones are solid shapes.
export const P = {
  home: "M3.5 9.5L10 4l6.5 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1Z",
  desktop: "M3 4.5h14v9H3ZM7.5 17h5M10 13.5V17",
  documents: "M5.5 2.5h6l3.5 3.5v11.5h-9.5ZM11.5 2.5V6H15M8 10h5M8 13h5",
  downloads: "M10 3v10M6 9.5l4 4 4-4M4 17h12",
  music: "M7.5 15V5l9-2v10M7.5 15a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 0 1 4.4 0ZM16.5 13a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 0 1 4.4 0Z",
  pictures: "M3 4.5h14v11H3ZM3 13l4-4 3.5 3.5L13 10l4 4",
  videos: "M3 5h14v10H3ZM8.5 8v4l3.5-2Z",
  disk: "M3 6h14v8H3ZM6 10h.01M10 10h4",
  usb: "M7 2.5h6v5H7ZM5.5 7.5h9v10h-9ZM10 11v3",
  trash: "M4 6h12M8 6V4h4v2M5.5 6l.8 10.5h7.4L14.5 6",
  back: "M12.5 4.5L7 10l5.5 5.5",
  forward: "M7.5 4.5L13 10l-5.5 5.5",
  up: "M10 16V4M4.5 9.5L10 4l5.5 5.5",
  search: "M8.5 14a5.5 5.5 0 1 0 0-11a5.5 5.5 0 0 0 0 11ZM12.5 12.5L17 17",
  wifi: "M2.5 7.5a11 11 0 0 1 15 0M5 10.3a7 7 0 0 1 10 0M7.6 13a3.3 3.3 0 0 1 4.8 0M10 15.8h.01",
  sound: "M3 8v4h3l4 3.5v-11L6 8ZM13 7.5a3.5 3.5 0 0 1 0 5M15.2 5a7 7 0 0 1 0 10",
  sparkle: "M10 2.5C10.6 7.4 12.6 9.4 17.5 10C12.6 10.6 10.6 12.6 10 17.5C9.4 12.6 7.4 10.6 2.5 10C7.4 9.4 9.4 7.4 10 2.5Z",
  account: "M10 9.5a3 3 0 1 0 0-6a3 3 0 0 0 0 6ZM4 17a6 6 0 0 1 12 0",
  look: "M10 3a7 7 0 1 0 0 14Z M10 3a7 7 0 0 1 0 14",
  shelf: "M6 3.5h8a2 2 0 0 1 0 4H6a2 2 0 0 1 0-4ZM4 16.5h12",
  wallpaper: "M3 4.5h14v11H3ZM3 13l4-4 3.5 3.5L13 10l4 4",
  bluetooth: "M6 6.5l8 7-4 3.5V3l4 3.5-8 7",
  display: "M3 4.5h14v9H3ZM7.5 17h5",
  power: "M10 2.5v7M6 5a6.5 6.5 0 1 0 8 0",
  about: "M10 17a7 7 0 1 0 0-14a7 7 0 0 0 0 14ZM10 9v4.5M10 6.5h.01",
  lock: "M5 9h10v8H5ZM7 9V6.5a3 3 0 0 1 6 0V9",
  chevronUp: "M5 12.5l5-5 5 5",
  close: "M5.5 5.5l9 9M14.5 5.5l-9 9",
  minimize: "M5 10h10",
  plus: "M10 4v12M4 10h12",
  refresh: "M16 10a6 6 0 1 1-1.8-4.3M16 3.5V7h-3.5",
  grid: "M4 4h5v5H4ZM11 4h5v5h-5ZM4 11h5v5H4ZM11 11h5v5h-5Z",
  list: "M4 5h12M4 10h12M4 15h12",
  eye: "M2.5 10s3-5.5 7.5-5.5S17.5 10 17.5 10s-3 5.5-7.5 5.5S2.5 10 2.5 10ZM10 12.2a2.2 2.2 0 1 0 0-4.4a2.2 2.2 0 0 0 0 4.4Z",
  copy: "M7 7h9v9H7ZM4 13V4h9",
  cut: "M6 7a2 2 0 1 0 0-4a2 2 0 0 0 0 4ZM6 17a2 2 0 1 0 0-4a2 2 0 0 0 0 4ZM7.6 6.2L16 15M7.6 13.8L16 5",
  paste: "M7 3.5h6v3H7ZM5 5H4.5v12h11V5H15",
  rename: "M4 16l1-4L13 4l3 3-8 8ZM11.5 5.5l3 3",
  extract: "M5 2.5h7l3 3v12H5ZM9 4v1M9 7v1M9 10v1M8.5 12.5h1v2h-1Z",
  open: "M11 3.5h5.5V9M16.5 3.5L9 11M14 12v4.5H3.5V6H8",
  key: "M7 13a4 4 0 1 1 3.5-6H17v3h-2v2h-2.5v-2h-2A4 4 0 0 1 7 13ZM6 9h.01",
  check: "M4.5 10.5l3.5 3.5 7.5-8",
  more: "M4.5 10m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M10 10m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M15.5 10m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0",
  prev: "M5 4h2v12H5ZM16 4.5v11L8 10Z",
  next: "M13 4h2v12h-2ZM4 4.5v11L12 10Z",
  play: "M6 4l10 6-10 6Z",
  pause: "M5.5 4h3v12h-3ZM11.5 4h3v12h-3Z",
};
export function Glyph({
  d,
  size = 18,
  width = 1.7,
  fill = false,
  color,
}: {
  d: string;
  size?: number;
  width?: number;
  fill?: boolean;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill={fill ? (color ?? "currentColor") : "none"}
      stroke={fill ? "none" : (color ?? "currentColor")}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// The bar and the shelf open the island in its own window through storage events;
// the browser demo is a single page, so it also listens for a window event.
export function openIsland(tab: IslandTab) {
  try {
    localStorage.setItem("lumius-island", JSON.stringify({ tab, at: Date.now() }));
  } catch {
    /* storage can be unavailable; the event below still covers one page */
  }
  window.dispatchEvent(new CustomEvent("lumius-island", { detail: tab }));
}
type IslandTab = "now" | "transfers" | "controls";

const clock = (now: Date) =>
  now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function TopBar({
  launch,
  status,
  now,
  desktop,
}: {
  launch: (id: string) => Promise<void>;
  status: Status | null;
  now: Date;
  desktop: number | null;
}) {
  const spaces = ["Studio", "Web", "Music"];
  const [space, setSpace] = useState(0);
  useEffect(() => {
    if (desktop != null && desktop < spaces.length) setSpace(desktop);
  }, [desktop]);
  const battery = status?.battery;
  return (
    <header className="lm-bar">
      <div className="lm-cap lm-cap-left">
        <button
          className="lm-ib lm-launch"
          aria-label="Open launcher"
          onClick={() => launch("launcher")}
        >
          <GlassIcon app="lumius" size={24} />
        </button>
        <span className="lm-vr" />
        <div className="lm-spaces" role="tablist" aria-label="Workspaces">
          {spaces.map((name, i) => (
            <button
              key={name}
              role="tab"
              aria-selected={space === i}
              aria-label={`Workspace ${name}`}
              className={"lm-ws" + (space === i ? " on" : "")}
              onClick={() => {
                setSpace(i);
                if (native) launch(`workspace-${i + 1}`);
              }}
            />
          ))}
        </div>
        <span className="lm-space-name">{spaces[space]}</span>
      </div>
      <div className="lm-cap lm-cap-right">
        <button className="lm-ib" aria-label="Ask" onClick={() => launch("ask")}>
          <Glyph d={P.sparkle} size={17} fill color="#7B3FF2" />
        </button>
        <button
          className="lm-ib"
          aria-label="Network settings"
          onClick={() => launch("network")}
        >
          <Glyph d={P.wifi} width={1.8} />
        </button>
        <button
          className="lm-ib"
          aria-label="Sound and brightness"
          onClick={() => openIsland("controls")}
        >
          <Glyph d={P.sound} width={1.8} />
        </button>
        {battery != null && (
          <span className="lm-ib lm-battery" title={`Battery ${battery}%`}>
            <svg width="22" height="18" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="1.5" y="5.5" width="16" height="9" rx="3" />
              <rect x="3.5" y="7.5" width={Math.max(1, (battery / 100) * 12)} height="5" rx="1.5" fill="currentColor" stroke="none" />
              <path d="M20 8.5v3" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <div className="lm-clock">
          <span>{clock(now)}</span>
          <small>
            {now.toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </small>
        </div>
        <button
          className="lm-ib lm-power"
          aria-label="Power options"
          onClick={() => launch("power")}
        >
          <Glyph d={P.power} size={16} width={2} />
        </button>
      </div>
    </header>
  );
}

const percent = (t: Transfer) =>
  Math.round((t.done / Math.max(1, t.total)) * 100);
const bytes = (n: number) =>
  n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function Island({
  status,
  control,
  transfers,
  launch,
  now,
  reducedMotion,
}: {
  status: Status | null;
  control: (a: string, n?: number) => Promise<void>;
  transfers: Transfer[];
  launch: (id: string) => Promise<void>;
  now: Date;
  reducedMotion: boolean;
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<IslandTab>("now");
  const shrink = useRef(0);
  const active = transfers.find((t) => t.state === "running");
  const failed = transfers.filter((t) => t.state === "error").slice(-1)[0];
  const toggle = (value: boolean, next?: IslandTab) => {
    clearTimeout(shrink.current);
    if (next) setTab(next);
    if (value) {
      if (native) call("island_expand", { expanded: true }).catch(console.error);
      setOpen(true);
    } else {
      setOpen(false);
      // Let the bounce finish before the native window shrinks around it.
      if (native)
        shrink.current = window.setTimeout(
          () => call("island_expand", { expanded: false }).catch(console.error),
          reducedMotion ? 140 : 520,
        );
    }
  };
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const show = (t: unknown) => {
      if (t === "now" || t === "transfers" || t === "controls")
        toggleRef.current(true, t);
    };
    const storage = (e: StorageEvent) => {
      if (e.key === "lumius-island" && e.newValue)
        try {
          show(JSON.parse(e.newValue).tab);
        } catch {
          /* ignore malformed messages */
        }
    };
    const local = (e: Event) => show((e as CustomEvent).detail);
    window.addEventListener("storage", storage);
    window.addEventListener("lumius-island", local);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener("lumius-island", local);
    };
  }, []);
  const playing = !!status?.playing;
  // Players report "Nothing playing" when idle; the island then shows the time.
  const media = !!status?.title && (playing || status.title !== "Nothing playing");
  return (
    <section
      className={"lm-island" + (open ? " open" : "")}
      aria-label="Dynamic Island"
      onKeyDown={(e) => e.key === "Escape" && toggle(false)}
    >
      {open ? (
        <div className="lm-island-body">
          <div className="lm-island-tabs" role="tablist">
            {(["now", "transfers", "controls"] as IslandTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={"lm-tab" + (tab === t ? " on" : "")}
                onClick={() => setTab(t)}
              >
                {t === "now" ? "Now" : t === "transfers" ? "Transfers" : "Controls"}
                {t === "transfers" && active && <i className="lm-badge" />}
              </button>
            ))}
            <button
              className="lm-ctl lm-ctl-sm"
              aria-label="Collapse Dynamic Island"
              onClick={() => toggle(false)}
            >
              <Glyph d={P.chevronUp} size={14} width={2.2} />
            </button>
          </div>
          {tab === "now" ? (
            <>
              <div className="lm-row">
                <span className={"lm-art" + (playing ? " on" : "")} />
                <div className="lm-row-text">
                  <b>{media ? status?.title : "Nothing playing"}</b>
                  <small>
                    {media
                      ? status?.artist || "Music"
                      : "Open Music to play a local track"}
                  </small>
                </div>
                <button
                  className="lm-ctl"
                  aria-label="Open Music"
                  onClick={() => launch("music")}
                >
                  <Glyph d={P.open} size={16} width={2} />
                </button>
              </div>
              <div className="lm-playback">
                <button
                  className="lm-ctl"
                  aria-label="Previous track"
                  onClick={() => control("previous")}
                >
                  <Glyph d={P.prev} size={16} fill />
                </button>
                <button
                  className="lm-ctl lm-ctl-main"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={() => control("play-pause")}
                >
                  <Glyph d={playing ? P.pause : P.play} size={16} fill />
                </button>
                <button
                  className="lm-ctl"
                  aria-label="Next track"
                  onClick={() => control("next")}
                >
                  <Glyph d={P.next} size={16} fill />
                </button>
              </div>
            </>
          ) : tab === "transfers" ? (
            <div className="lm-row">
              <GlassIcon app="folder-downloads" size={56} finish="lumen" />
              <div className="lm-row-text">
                <b>{active ? active.name : "No transfers right now"}</b>
                <small>
                  {active
                    ? `${percent(active)}% · ${bytes(active.done)} of ${bytes(active.total)}`
                    : failed?.error || "Copies and moves from Files appear here."}
                </small>
                {active && (
                  <div className="lm-track">
                    <i style={{ width: `${percent(active)}%` }} />
                  </div>
                )}
              </div>
              {active ? (
                <button
                  className="lm-ctl"
                  aria-label="Cancel transfer"
                  onClick={() => call("cancel", { id: active.id }).catch(console.error)}
                >
                  <Glyph d={P.close} size={14} width={2.2} />
                </button>
              ) : (
                <button
                  className="lm-ctl"
                  aria-label="Open Files"
                  onClick={() => launch("files")}
                >
                  <Glyph d={P.open} size={16} width={2} />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="lm-tiles">
                <button className="lm-tile on" onClick={() => launch("network")}>
                  Wi-Fi<small>Networks</small>
                </button>
                <button className="lm-tile on" onClick={() => launch("bluetooth")}>
                  Bluetooth<small>Devices</small>
                </button>
                <button className="lm-tile" onClick={() => launch("lock")}>
                  Lock<small>Screen</small>
                </button>
                <button className="lm-tile" onClick={() => launch("power")}>
                  Power<small>Options</small>
                </button>
              </div>
              <div className="lm-sliders">
                <IslandSlider
                  label="Display"
                  aria="Brightness"
                  value={status?.brightness}
                  onCommit={(n) => control("brightness", n)}
                />
                <IslandSlider
                  label="Sound"
                  aria="Volume"
                  value={status?.volume}
                  onCommit={(n) => control("volume", n)}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          className="lm-island-summary"
          aria-label="Expand Dynamic Island"
          aria-expanded={false}
          onClick={() => toggle(true, active ? "transfers" : "now")}
        >
          {active ? (
            <>
              <span
                className="lm-ring"
                style={{ "--p": `${percent(active) * 3.6}deg` } as CSSProperties}
              />
              <span className="lm-summary-title">{active.name}</span>
              <b className="lm-pct">{percent(active)}%</b>
            </>
          ) : media ? (
            <>
              <span className="lm-art lm-art-sm" />
              <span className="lm-summary-title">{status?.title}</span>
              <span className={"lm-eq" + (playing ? " on" : "")}>
                <i />
                <i />
                <i />
                <i />
              </span>
            </>
          ) : (
            <>
              <span className="lm-summary-time">{clock(now)}</span>
              <span className="lm-live" />
            </>
          )}
        </button>
      )}
      <span className="lm-core" />
    </section>
  );
}
function IslandSlider({
  label,
  aria,
  value,
  onCommit,
}: {
  label: string;
  aria: string;
  value: number | null | undefined;
  onCommit: (n: number) => void;
}) {
  const [current, setCurrent] = useState(value ?? 0);
  useEffect(() => setCurrent(value ?? 0), [value]);
  return (
    <label className="lm-slider">
      <span>{label}</span>
      <input
        aria-label={aria}
        type="range"
        min="0"
        max="100"
        disabled={value == null}
        value={current}
        onChange={(e) => setCurrent(+e.target.value)}
        onPointerUp={() => onCommit(current)}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            onCommit(current);
        }}
      />
      <small>{value == null ? "—" : `${Math.round(current)}%`}</small>
    </label>
  );
}

export type ShelfWindow = {
  id: number;
  app: string;
  label: string;
  active: boolean;
};
const classes: [RegExp, string][] = [
  [/chrom|firefox/, "browser"],
  [/konsole/, "terminal"],
  [/vlc|elisa/, "music"],
  [/discover/, "store"],
  [/calamares/, "installer"],
  [/systemsettings/, "settings"],
];
const short = (s: string) => (s.length > 16 ? s.slice(0, 15).trimEnd() + "…" : s);
function toShelf(w: OpenWindow): ShelfWindow {
  const own = w.title.match(/^Lumius (files|settings|ask)$/);
  const app = own ? own[1] : (classes.find(([r]) => r.test(w.class))?.[1] ?? "apps");
  // "Page title - Chromium" → "Page title"
  const detail = w.title.replace(/\s[—–-]\s[^—–-]+$/, "");
  const label = own
    ? appNames[app]
    : app === "apps"
      ? short(w.title)
      : `${appNames[app]} · ${short(detail)}`;
  return { id: w.id, app, label, active: w.active };
}
// Open windows and the current workspace; the browser demo mirrors its preview.
export function useWindows(enabled: boolean, demo: string[]) {
  const [state, setState] = useState<{
    windows: ShelfWindow[];
    desktop: number | null;
  }>({ windows: [], desktop: null });
  useEffect(() => {
    if (!enabled || !native) return;
    let alive = true;
    const tick = () =>
      call<{ windows: OpenWindow[]; desktop: number | null }>("windows")
        .then((r) => {
          if (alive) setState({ desktop: r.desktop, windows: r.windows.map(toShelf) });
        })
        .catch(() => {});
    tick();
    const timer = setInterval(tick, 1200);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled]);
  if (native) return state;
  return {
    desktop: null,
    windows: demo.map((app, i) => ({
      id: -1 - i,
      app,
      label: appNames[app] ?? app,
      active: i === 0,
    })),
  };
}

export function Shelf({
  settings,
  launch,
  windows,
}: {
  settings: Settings;
  launch: (id: string) => Promise<void>;
  windows: ShelfWindow[];
}) {
  const [ripple, setRipple] = useState<{ id: string; n: number } | null>(null);
  const running = new Set(windows.map((w) => w.app));
  const press = (id: string, run: () => void) => {
    setRipple((r) => ({ id, n: (r?.n ?? 0) + 1 }));
    run();
  };
  const app = (id: string, label: string, run: () => void, icon = appIcon[id]) => (
    <button
      key={id}
      className="lm-sh"
      aria-label={id === "launcher" || id === "trash" ? label : `Open ${label}`}
      style={{ "--glow": appGlow[id] ?? appGlow.apps } as CSSProperties}
      onClick={() => press(id, run)}
    >
      <span className="lm-pool" />
      <span className="lm-lift">
        <GlassIcon
          app={icon ?? "apps"}
          size={50}
          finish={id === "launcher" ? "spectrum" : settings.iconFinish}
        />
      </span>
      {ripple?.id === id && (
        <span key={ripple.n} className="lm-ripple" onAnimationEnd={() => setRipple(null)} />
      )}
      <span className="lm-tip">{label}</span>
      {running.has(id) && <span className="lm-run" />}
    </button>
  );
  return (
    <nav
      className="lm-shelf"
      aria-label="Application dock"
      style={{ "--lift": `${-settings.shelfLift}px` } as CSSProperties}
    >
      {app("launcher", "Launcher", () => launch("launcher"))}
      <span className="lm-shelf-div" />
      {settings.pinned.map((id) =>
        app(id, appNames[id] ?? id, () => launch(id)),
      )}
      {windows.length > 0 && <span className="lm-shelf-div" />}
      {windows.slice(0, 4).map((w) => (
        <button
          key={w.id}
          className={"lm-chip" + (w.active ? " on" : "")}
          aria-label={w.label}
          style={{ "--glow": appGlow[w.app] ?? appGlow.apps } as CSSProperties}
          onClick={() =>
            w.id >= 0
              ? call("window_activate", { id: w.id }).catch(console.error)
              : launch(w.app)
          }
        >
          <GlassIcon app={appIcon[w.app] ?? "apps"} size={26} finish={settings.iconFinish} />
          <span>{w.label}</span>
          <span className="lm-run" />
        </button>
      ))}
      <span className="lm-shelf-div" />
      {app("trash", "Trash", () => {
        try {
          localStorage.setItem("lumius-files-open", "trash");
        } catch {
          /* Files still opens, just not on Trash */
        }
        launch("files");
      })}
    </nav>
  );
}

// Windows have no title bar: each app places WindowControls in its own toolbar and
// marks drag areas with data-drag.
type WindowAction = (a: "close" | "minimize" | "toggleMaximize") => void;
const WindowContext = createContext<WindowAction>(() => {});
export function WindowControls() {
  const action = useContext(WindowContext);
  return (
    <div className="lm-wc-group" role="group" aria-label="Window">
      <button className="lm-wc" aria-label="Minimize window" onClick={() => action("minimize")}>
        <Glyph d={P.minimize} size={14} width={2.2} />
      </button>
      <button className="lm-wc" aria-label="Maximize window" onClick={() => action("toggleMaximize")}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="4.5" y="4.5" width="11" height="11" rx="3.5" />
        </svg>
      </button>
      <button className="lm-wc lm-wc-x" aria-label="Close window" onClick={() => action("close")}>
        <Glyph d={P.close} size={14} width={2.2} />
      </button>
    </div>
  );
}
export function WindowFrame({
  title,
  children,
  settings,
}: {
  title: string;
  children: ReactNode;
  settings: Settings;
}) {
  const animate = !settings.reducedMotion && settings.leaving === "fold";
  const [phase, setPhase] = useState<"rise" | "idle" | "fold">(
    settings.reducedMotion ? "idle" : "rise",
  );
  const folded = useRef(false);
  useEffect(() => {
    // A window restored from the shelf rises out of light again.
    const back = () => {
      if (folded.current) {
        folded.current = false;
        setPhase(settings.reducedMotion ? "idle" : "rise");
      }
    };
    window.addEventListener("focus", back);
    return () => window.removeEventListener("focus", back);
  }, [settings.reducedMotion]);
  const action: WindowAction = (a) => {
    if (a === "minimize" && animate) {
      setPhase("fold");
      window.setTimeout(() => {
        folded.current = true;
        if (native) getCurrentWindow().minimize().catch(console.error);
        else window.setTimeout(() => window.dispatchEvent(new Event("focus")), 400);
      }, 600);
      return;
    }
    if (native) getCurrentWindow()[a]().catch(console.error);
  };
  const drag = (e: ReactPointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      native &&
      e.button === 0 &&
      target.closest("[data-drag]") &&
      !target.closest("button, input, select, textarea, a, label, form")
    )
      getCurrentWindow().startDragging().catch(console.error);
  };
  return (
    <WindowContext.Provider value={action}>
      <main
        className={`lm-window ${phase}`}
        aria-label={`Lumius ${title}`}
        onPointerDown={drag}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("[data-drag]") && !target.closest("button, input, form"))
            action("toggleMaximize");
        }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && phase === "rise") setPhase("idle");
        }}
      >
        <div className="lm-window-glass">{children}</div>
      </main>
    </WindowContext.Provider>
  );
}
