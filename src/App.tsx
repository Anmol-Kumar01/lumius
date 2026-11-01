import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, MotionConfig, Reorder } from "motion/react";
import {
  ArrowRight,
  MagnifyingGlass,
  X,
  Info,
  ArrowSquareOut,
  Sparkle,
  Key,
} from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import { call, defaults, native } from "./bridge";
import GlassOptics from "./GlassOptics";
import { GlassIcon } from "./GlassIcon";
import {
  accents,
  appIcon,
  appNames,
  Glyph,
  Island,
  P,
  Shelf,
  TopBar,
  useWindows,
  WindowControls,
  WindowFrame,
} from "./Shell";
import type {
  Entry,
  Listing,
  Settings,
  Status,
  Transfer,
  TrashItem,
  Answer,
} from "./types";

const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={"icon-button " + (active ? "active" : "")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
type Rect = { x: number; y: number; width: number; height: number };
// KWin blurs and accepts input in rectangles, so rounded shapes are approximated
// with a few stepped strips per corner.
function roundedRects(box: DOMRect, top: number, bottom: number): Rect[] {
  const steps = 4;
  const strips = (r: number, fromTop: boolean) =>
    Array.from({ length: r > 1 ? steps : 0 }, (_, k) => {
      const h = r / steps;
      const dy = r - (k + 0.5) * h;
      const inset = r - Math.sqrt(Math.max(0, r * r - dy * dy));
      return {
        x: box.x + inset,
        y: fromTop ? box.y + k * h : box.bottom - (k + 1) * h,
        width: box.width - 2 * inset,
        height: h,
      };
    });
  return [
    ...strips(top, true),
    { x: box.x, y: box.y + top, width: box.width, height: box.height - top - bottom },
    ...strips(bottom, false),
  ]
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      x: Math.max(0, r.x),
      y: Math.max(0, r.y),
      width: r.width,
      height: r.height,
    }));
}
const regionSelector: Record<string, string> = {
  bar: ".lm-cap",
  island: ".lm-island",
  dock: ".lm-shelf",
  files: ".lm-window",
  settings: ".lm-window",
  ask: ".lm-window",
};
// Night follows the clock in Auto: 7 PM to 7 AM.
const isNight = (s: Settings, now: Date) =>
  s.light === "night" ||
  (s.light === "auto" && (now.getHours() >= 19 || now.getHours() < 7));
const glassLevels = [
  { name: "Thin", value: 25, alpha: 0.28, blur: 10 },
  { name: "Regular", value: 50, alpha: 0.5, blur: 24 },
  { name: "Thick", value: 75, alpha: 0.72, blur: 40 },
];
const glassLevel = (n: number) =>
  glassLevels.reduce((a, b) => (Math.abs(b.value - n) < Math.abs(a.value - n) ? b : a));

export default function App() {
  const view = new URLSearchParams(location.search).get("view") || "desktop";
  useEffect(() => {
    document.title = "Lumius " + view;
    if (native)
      getCurrentWindow()
        .setTitle("Lumius " + view)
        .catch(console.error);
  }, [view]);
  useEffect(() => {
    if (!native || !regionSelector[view]) return;
    let frame = 0;
    const observer = new ResizeObserver(() => report());
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const elements = [...document.querySelectorAll(regionSelector[view])];
        elements.forEach((e) => observer.observe(e));
        const rects = elements.flatMap((e) => {
          const style = getComputedStyle(e);
          return roundedRects(
            e.getBoundingClientRect(),
            parseFloat(style.borderTopLeftRadius) || 0,
            parseFloat(style.borderBottomLeftRadius) || 0,
          );
        });
        if (rects.length)
          call("window_region", { rects }).catch(console.error);
      });
    };
    observer.observe(document.documentElement);
    // The island and the shelf change shape when they open or gain window chips.
    const mutations = new MutationObserver(report);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", report);
    report();
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", report);
    };
  }, [view]);
  const [settings, setSettings] = useState<Settings>(defaults),
    [status, setStatus] = useState<Status | null>(null),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [error, setError] = useState(""),
    [previewView, setPreviewView] = useState("files");
  const [now, setNow] = useState(new Date());
  const saving = useRef(false);
  const pendingSaves = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let alive = true;
    const update = async () => {
      try {
        const [s, t] = await Promise.all([
          call<Settings>("settings_get"),
          call<Transfer[]>("transfers"),
        ]);
        if (alive) {
          // Settings saved by older versions lack the Lumius 1.0 fields.
          if (!saving.current) setSettings({ ...defaults, ...s });
          setTransfers(t);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    let readingStatus = false;
    const stat = () => {
      if (readingStatus) return;
      readingStatus = true;
      return call<Status>("status")
        .then((s) => {
          if (alive) setStatus(s);
        })
        .catch(() => {})
        .finally(() => {
          readingStatus = false;
        });
    };
    update();
    stat();
    const timer = setInterval(() => {
      update();
      setNow(new Date());
    }, 1500);
    const slow = setInterval(stat, 3000);
    // The browser demo announces playback changes so the island updates at once.
    window.addEventListener("lumius-status", stat);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(slow);
      window.removeEventListener("lumius-status", stat);
    };
  }, []);
  const change = async (s: Settings) => {
    saving.current = true;
    pendingSaves.current++;
    setSettings(s);
    const task = saveQueue.current.then(async () => {
      try {
        await call("settings_set", { settings: s });
      } catch (e) {
        setError(String(e));
      } finally {
        pendingSaves.current--;
        saving.current = pendingSaves.current > 0;
      }
    });
    saveQueue.current = task;
    await task;
  };
  const launch = async (id: string) => {
    if (!native && ["files", "settings", "ask"].includes(id)) {
      setPreviewView(id);
      return;
    }
    try {
      await call("launch", { id });
    } catch (e) {
      setError(String(e));
    }
  };
  const control = async (action: string, value?: number) => {
    try {
      await call("control", { action, value });
      setStatus(await call<Status>("status"));
    } catch (e) {
      setError(String(e));
    }
  };
  const env = { settings, change, launch, status, control, transfers };
  const { windows, desktop } = useWindows(
    view === "dock" || view === "bar",
    [previewView, ...(status?.playing && previewView !== "music" ? ["music"] : [])],
  );
  const night = isNight(settings, now);
  const level = glassLevel(settings.glass);
  const frame = (title: string, body: ReactNode) => (
    <WindowFrame title={title} settings={settings}>
      {body}
    </WindowFrame>
  );
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? "always" : "user"}>
      <div
        className={`lumius lm theme-${settings.wallpaper} view-${view} ${night ? "night" : "day"} ${settings.reducedTransparency ? "solid" : ""} ${settings.reducedMotion ? "still" : ""} ${settings.aurora ? "aurora-on" : ""}`}
        style={
          {
            "--accent": accents[settings.accent] ?? accents.lumen,
            "--glass-alpha": `${level.alpha}`,
            "--glass-blur": `${level.blur}px`,
            "--blur": `${level.blur}px`,
            // The browser demo has no backlight, so brightness dims the page.
            filter:
              !native && status?.brightness != null
                ? `brightness(${0.35 + status.brightness * 0.0065})`
                : undefined,
          } as CSSProperties
        }
      >
        <GlassOptics />
        {view === "desktop" && (
          <>
            <div className="lm-aurora" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <TopBar launch={launch} status={status} now={now} desktop={desktop} />
            <div className="lm-desk-icons">
              <button className="lm-cellf" onClick={() => launch("files")}>
                <GlassIcon app="lumius" size={58} />
                <span>Lumius Home</span>
              </button>
              <button className="lm-cellf" onClick={() => launch("installer")}>
                <GlassIcon app="installer" size={58} />
                <span>Install Lumius</span>
              </button>
            </div>
            <Island
              status={status}
              control={control}
              transfers={transfers}
              launch={launch}
              now={now}
              reducedMotion={settings.reducedMotion}
            />
            <div className="lm-desk-window" key={previewView}>
              {frame(
                appNames[previewView],
                previewView === "files" ? (
                  <Files launch={launch} transfers={transfers} settings={settings} />
                ) : previewView === "ask" ? (
                  <AskPanel />
                ) : (
                  <SettingsPanel {...env} />
                ),
              )}
            </div>
            <Shelf settings={settings} launch={launch} windows={windows} />
            {!native && (
              <div className="preview-label">
                Demo mode · sample files only, nothing on this computer changes
              </div>
            )}
          </>
        )}
        {view === "files" &&
          frame("Files", <Files launch={launch} transfers={transfers} settings={settings} />)}
        {view === "settings" && frame("Settings", <SettingsPanel {...env} />)}
        {view === "ask" && frame("Ask", <AskPanel />)}
        {view === "bar" && (
          <TopBar launch={launch} status={status} now={now} desktop={desktop} />
        )}
        {view === "island" && (
          <Island
            status={status}
            control={control}
            transfers={transfers}
            launch={launch}
            now={now}
            reducedMotion={settings.reducedMotion}
          />
        )}
        {view === "dock" && <Shelf settings={settings} launch={launch} windows={windows} />}
        <AnimatePresence>
          {error && (
            <motion.div
              role="alert"
              className="error-toast glass"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Info size={22} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function Files({
  launch,
  transfers,
  settings,
}: {
  launch: (id: string) => void;
  transfers: Transfer[];
  settings: Settings;
}) {
  const [home, setHome] = useState(""),
    [path, setPath] = useState(""),
    [listing, setListing] = useState<Listing>({ path: "", entries: [] }),
    [selected, setSelected] = useState<Entry | null>(null),
    [layout, setLayout] = useState<"list" | "grid">("grid"),
    [menu, setMenu] = useState(false),
    [query, setQuery] = useState(""),
    [global, setGlobal] = useState(false),
    [sort, setSort] = useState("name"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tabs, setTabs] = useState<string[]>([]),
    [activeTab, setActiveTab] = useState(0),
    [clipboard, setClipboard] = useState<{
      entry: Entry;
      move: boolean;
    } | null>(null),
    [preview, setPreview] = useState<{
      entry: Entry;
      text?: string;
      truncated?: boolean;
      url?: string;
    } | null>(null),
    [modal, setModal] = useState<{
      type: "mkdir" | "rename" | "trash";
      value: string;
    } | null>(null),
    [trash, setTrash] = useState<TrashItem[] | null>(null),
    [mounts, setMounts] = useState<Entry[]>([]),
    [history, setHistory] = useState<string[]>([]),
    [historyIndex, setHistoryIndex] = useState(-1);
  const closeTab = (index: number) => {
    const next = tabs.filter((_, i) => i !== index);
    const active =
      index < activeTab ? activeTab - 1 : Math.min(activeTab, next.length - 1);
    setTabs(next);
    setActiveTab(active);
    load(next[active]);
  };
  const request = useRef(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  const load = async (p: string) => {
    const id = ++request.current;
    setBusy(true);
    setError("");
    try {
      const result = await call<Listing>("list", { path: p });
      if (id === request.current) {
        setListing(result);
        setPath(result.path);
        setSelected(null);
        setTrash(null);
      }
    } catch (e) {
      if (id === request.current) setError(String(e));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  const navigate = (p: string) => {
    setTabs((ts) => ts.map((v, i) => (i === activeTab ? p : v)));
    setQuery("");
    setGlobal(false);
    setHistory((h) => [...h.slice(0, historyIndex + 1), p]);
    setHistoryIndex((i) => i + 1);
    load(p);
  };
  useEffect(() => {
    call<string>("home")
      .then((h) => {
        setHome(h);
        setTabs([h]);
        setHistory([h]);
        setHistoryIndex(0);
        let trashFirst = false;
        try {
          trashFirst = localStorage.getItem("lumius-files-open") === "trash";
          localStorage.removeItem("lumius-files-open");
        } catch {
          /* no storage: open Home */
        }
        load(h).then(() => {
          if (trashFirst) openTrash();
        });
      })
      .catch((e) => setError(String(e)));
    call<Entry[]>("mounts")
      .then(setMounts)
      .catch(() => {});
    const mountTimer = setInterval(() => {
      call<Entry[]>("mounts")
        .then(setMounts)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(mountTimer);
  }, []);
  const lastTransfer = transfers.map((t) => t.id + t.state).join(",");
  useEffect(() => {
    if (pathRef.current) load(pathRef.current);
  }, [lastTransfer]);
  const execute = async (cmd: string, args: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    try {
      const result = await call(cmd, args);
      await load(path);
      return result;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const open = (e: Entry) =>
    e.directory
      ? navigate(e.path)
      : !native && e.kind !== "Audio"
        ? showPreview(e)
        : execute("open", { path: e.path });
  const showPreview = async (e: Entry) => {
    if (e.directory) {
      navigate(e.path);
      return;
    }
    setPreview({ entry: e });
    if (e.kind !== "Image" || !native)
      try {
        const result = await call<{
          text: string;
          truncated: boolean;
          url?: string;
        }>("preview", { path: e.path });
        setPreview({ entry: e, ...result });
      } catch (err) {
        setError(String(err));
        setPreview(null);
      }
  };
  const search = async () => {
    if (!global) return;
    setBusy(true);
    try {
      setListing(await call<Listing>("search", { query }));
      setSelected(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const buildIndex = async () => {
    setBusy(true);
    try {
      const r = await call<{ indexed: number; skipped: number }>("index");
      setError(
        `Index ready: ${r.indexed} entries; ${r.skipped} unreadable paths skipped.`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const entries = listing.entries
    .filter(
      (e) =>
        (global || e.name.toLowerCase().includes(query.toLowerCase())) &&
        !e.name.startsWith("."),
    )
    .sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        (sort === "size"
          ? b.size - a.size
          : sort === "modified"
            ? b.modified - a.modified
            : a.name.localeCompare(b.name)),
    );
  const openTrash = async () => {
    try {
      setTrash(await call<TrashItem[]>("trash_list"));
      setSelected(null);
    } catch (e) {
      setError(String(e));
    }
  };
  const places = [
    { name: "Home", folder: "", d: P.home },
    { name: "Desktop", folder: "Desktop", d: P.desktop },
    { name: "Documents", folder: "Documents", d: P.documents },
    { name: "Downloads", folder: "Downloads", d: P.downloads },
    { name: "Music", folder: "Music", d: P.music },
    { name: "Pictures", folder: "Pictures", d: P.pictures },
    { name: "Videos", folder: "Videos", d: P.videos },
  ];
  const title = trash
    ? "Trash"
    : path === home
      ? "Home"
      : path.split("/").pop() || "Lumius disk";
  const historyGo = (i: number) => {
    setHistoryIndex(i);
    setTabs((ts) => ts.map((p, j) => (j === activeTab ? history[i] : p)));
    load(history[i]);
  };
  const special: Record<string, string> = {
    Desktop: "folder-desktop",
    Documents: "folder-documents",
    Downloads: "folder-downloads",
    Music: "folder-music",
    Pictures: "folder-pictures",
    Videos: "folder-videos",
  };
  const iconFor = (e: Entry) =>
    e.directory
      ? path === home && special[e.name]
        ? special[e.name]
        : "folder"
      : ({ Audio: "music", Image: "photos", Archive: "apps", Document: "notes" } as Record<string, string>)[e.kind] ?? "notes";
  const tool = (label: string, d: string, onClick: () => void, disabled = false) => (
    <button className="lm-wc" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <Glyph d={d} size={17} width={1.9} />
    </button>
  );
  return (
    <div className="lm-app lm-files">
      <nav className="lm-sidebar" aria-label="Files sidebar" data-drag>
        <div className="lm-side-head" data-drag>
          <GlassIcon app="files" size={28} />
          <span>Files</span>
          <button
            className="lm-wc"
            aria-label="Files menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Glyph d={P.more} size={16} fill />
          </button>
          {menu && (
            <div className="lm-menu" role="menu" onClick={() => setMenu(false)}>
              <button role="menuitem" onClick={() => setModal({ type: "mkdir", value: "" })}>
                <Glyph d={P.plus} size={16} /> New folder
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setActiveTab(tabs.length);
                  setTabs((t) => [...t, path]);
                  setHistory([path]);
                  setHistoryIndex(0);
                }}
              >
                <Glyph d={P.copy} size={16} /> New tab
              </button>
              <button role="menuitem" onClick={() => setLayout(layout === "grid" ? "list" : "grid")}>
                <Glyph d={layout === "grid" ? P.list : P.grid} size={16} />
                {layout === "grid" ? "List view" : "Icon view"}
              </button>
              <button role="menuitem" onClick={() => load(path)}>
                <Glyph d={P.refresh} size={16} /> Refresh
              </button>
              <hr />
              {(["name", "modified", "size"] as const).map((k) => (
                <button role="menuitemradio" aria-checked={sort === k} key={k} onClick={() => setSort(k)}>
                  <Glyph d={sort === k ? P.check : ""} size={16} width={2} /> Sort by {k}
                </button>
              ))}
              <hr />
              <button role="menuitemcheckbox" aria-checked={global} onClick={() => setGlobal(!global)}>
                <Glyph d={global ? P.check : ""} size={16} width={2} /> Search all of Home
              </button>
              {global && (
                <button role="menuitem" onClick={buildIndex} disabled={busy}>
                  <Glyph d={P.refresh} size={16} /> Rebuild search index
                </button>
              )}
              <button role="menuitem" onClick={() => launch("settings")}>
                <Glyph d={P.look} size={16} /> Settings
              </button>
            </div>
          )}
        </div>
        <div className="lm-sec">Places</div>
        {places.map(({ name, folder, d }) => {
          const target = folder ? `${home}/${folder}` : home;
          return (
            <button
              key={name}
              className={"lm-side" + (path === target && !trash ? " on" : "")}
              aria-current={path === target && !trash ? "page" : undefined}
              onClick={() => navigate(target)}
            >
              <Glyph d={d} />
              {name}
            </button>
          );
        })}
        <div className="lm-sec">Devices</div>
        <button
          className={"lm-side" + (path === "/" && !trash ? " on" : "")}
          onClick={() => navigate("/")}
        >
          <Glyph d={P.disk} />
          Lumius disk
        </button>
        {mounts.map((d) => (
          <button
            key={d.path}
            className={"lm-side" + (path === d.path && !trash ? " on" : "")}
            onClick={() => navigate(d.path)}
          >
            <Glyph d={P.usb} />
            {d.name}
          </button>
        ))}
        <button className={"lm-side" + (trash ? " on" : "")} onClick={openTrash}>
          <Glyph d={P.trash} />
          Trash
        </button>
        <p className="lm-side-note">
          {native ? "Your files on this computer" : "Browser demo · sample files"}
        </p>
      </nav>
      <section className="lm-main">
        <header className="lm-toolbar" data-drag>
          {tool("Back", P.back, () => historyGo(historyIndex - 1), historyIndex <= 0)}
          {tool(
            "Forward",
            P.forward,
            () => historyGo(historyIndex + 1),
            historyIndex >= history.length - 1,
          )}
          {tool(
            "Parent folder",
            P.up,
            () => navigate(path.slice(0, path.lastIndexOf("/")) || "/"),
            !path || path === "/" || !!trash,
          )}
          <h1 data-drag>{title}</h1>
          <form
            className="lm-search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              // A question goes to Ask; anything else searches files.
              if (q.endsWith("?")) {
                try {
                  localStorage.setItem("lumius-ask", q);
                } catch {
                  /* Ask opens without the question */
                }
                launch("ask");
                window.dispatchEvent(new Event("lumius-ask"));
              } else search();
            }}
          >
            <Glyph d={P.search} size={15} width={2} />
            <input
              aria-label="Search files"
              placeholder={`Search ${title}, or ask`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <WindowControls />
        </header>
        {tabs.length > 1 && (
          <div className="lm-tabs" role="tablist">
            {tabs.map((t, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={activeTab === i}
                className={activeTab === i ? "on" : ""}
                onClick={() => {
                  setActiveTab(i);
                  setHistory([t]);
                  setHistoryIndex(0);
                  setQuery("");
                  setGlobal(false);
                  load(t);
                }}
              >
                {t === home ? "Home" : t.split("/").pop() || "Disk"}
                <span
                  role="button"
                  aria-label={`Close tab ${i + 1}`}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(i);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") closeTab(i);
                  }}
                >
                  <Glyph d={P.close} size={11} width={2.4} />
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="lm-content" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          {listing.warning && !trash && <p className="inline-note">{listing.warning}</p>}
          {error && (
            <div className="inline-error" role="alert">
              <Info />
              <span>{error}</span>
              <button aria-label="Dismiss Files error" onClick={() => setError("")}>
                <X />
              </button>
            </div>
          )}
          {busy && (
            <div role="status" className="loading-line">
              Working…
            </div>
          )}
          {trash ? (
            <div className="trash-list">
              {trash.map((t) => (
                <div key={t.id}>
                  <GlassIcon app="trash" size={34} finish="lumen" />
                  <span>
                    <b>{t.name}</b>
                    <small>{t.original}</small>
                  </span>
                  <button
                    onClick={async () => {
                      await execute("restore", { id: t.id });
                      openTrash();
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))}
              {!trash.length && (
                <div className="empty-state">
                  <GlassIcon app="trash" size={76} finish="lumen" />
                  <h3>All clear.</h3>
                  <p>Deleted files appear here so you can restore them.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className={"lm-entries " + layout} role="list" aria-label="Files">
                {layout === "list" && (
                  <div className="lm-list-head">
                    <span>Name</span>
                    <span>Date modified</span>
                    <span>Size</span>
                    <span>Kind</span>
                  </div>
                )}
                {entries.map((e) => (
                  <button
                    role="listitem"
                    className={"lm-cellf" + (selected?.path === e.path ? " selected" : "")}
                    key={e.path}
                    onClick={() => setSelected(e)}
                    onDoubleClick={() => open(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") open(e);
                      if (ev.key === " ") {
                        ev.preventDefault();
                        showPreview(e);
                      }
                    }}
                  >
                    <GlassIcon
                      app={iconFor(e)}
                      size={layout === "grid" ? 76 : 26}
                      finish={e.directory ? "lumen" : settings.iconFinish}
                    />
                    <span className="lm-name">{e.name}</span>
                    {layout === "list" && (
                      <>
                        <span>
                          {e.modified
                            ? new Date(e.modified * 1000).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </span>
                        <span>{e.directory ? "—" : size(e.size)}</span>
                        <span>{e.kind}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
              {!entries.length && !busy && (
                <div className="empty-state">
                  <GlassIcon app="folder" size={76} finish="lumen" />
                  <h3>{query ? "Nothing found." : "Room for something new."}</h3>
                  <p>
                    {query
                      ? "Try another name, or turn on Search all of Home in the menu."
                      : "Create a folder from the menu, or paste files here."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="lm-status">
          <span>
            {selected ? selected.name : title}
            {clipboard && (
              <small>
                {" "}
                · {clipboard.move ? "Move" : "Copy"}: {clipboard.entry.name}
              </small>
            )}
          </span>
          <div className="lm-actions">
            {selected && (
              <>
                {tool("Open selected", P.open, () => open(selected))}
                {tool("Preview", P.eye, () => showPreview(selected))}
                {tool("Copy", P.copy, () => setClipboard({ entry: selected, move: false }))}
                {tool("Cut", P.cut, () => setClipboard({ entry: selected, move: true }))}
                {tool("Rename", P.rename, () => setModal({ type: "rename", value: selected.name }))}
                {selected.kind === "Archive" &&
                  tool("Extract ZIP", P.extract, () => execute("extract", { path: selected.path }))}
                {tool("Move to Trash", P.trash, () => setModal({ type: "trash", value: selected.name }))}
              </>
            )}
            {clipboard &&
              tool(
                "Paste",
                P.paste,
                async () => {
                  const result = await execute("transfer", {
                    source: clipboard.entry.path,
                    destination: path,
                    move: clipboard.move,
                  });
                  if (result) setClipboard(null);
                },
                busy || !!trash,
              )}
            <span className="lm-count">
              {trash ? trash.length : entries.length}{" "}
              {(trash ? trash.length : entries.length) === 1 ? "item" : "items"}
            </span>
          </div>
        </footer>
      </section>
      <AnimatePresence>
        {modal && (
          <div className="modal-scrim">
            <motion.form
              className="dialog glass"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onSubmit={async (e) => {
                e.preventDefault();
                const m = modal;
                setModal(null);
                if (m.type === "mkdir")
                  await execute("mkdir", { path, name: m.value });
                else if (selected)
                  await execute(m.type === "trash" ? "trash" : "rename", {
                    path: selected.path,
                    name: m.value,
                  });
              }}
            >
              <h2>
                {modal.type === "mkdir"
                  ? "A new beginning."
                  : modal.type === "rename"
                    ? "Give it a new name."
                    : "Move to Trash?"}
              </h2>
              {modal.type === "trash" ? (
                <p>“{modal.value}” can be restored from Trash.</p>
              ) : (
                <input
                  autoFocus
                  aria-label="Folder or file name"
                  required
                  value={modal.value}
                  onChange={(e) =>
                    setModal({ ...modal, value: e.target.value })
                  }
                />
              )}
              <div>
                <button type="button" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button className="primary" type="submit">
                  {modal.type === "trash" ? "Move to Trash" : "Save"}
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
      {preview && (
        <div className="modal-scrim">
          <section className="preview-dialog glass">
            <header>
              <h2>{preview.entry.name}</h2>
              <IconButton
                label="Close preview"
                onClick={() => setPreview(null)}
              >
                <X />
              </IconButton>
            </header>
            {preview.entry.kind === "Image" && native ? (
              <img
                alt={preview.entry.name}
                src={convertFileSrc(preview.entry.path)}
              />
            ) : preview.url ? (
              <img alt={preview.entry.name} src={preview.url} />
            ) : (
              <pre>
                {preview.text || "Loading preview…"}
                {preview.truncated ? "\n… Preview limited to 64 KiB." : ""}
              </pre>
            )}
            {(native || preview.entry.kind === "Audio") && (
              <button className="primary" onClick={() => open(preview.entry)}>
                Open in application
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

type Environment = {
  settings: Settings;
  change: (s: Settings) => Promise<void>;
  launch: (id: string) => Promise<void>;
  status: Status | null;
  control: (a: string, n?: number) => Promise<void>;
  transfers: Transfer[];
};
function Pinned({
  settings,
  change,
  launch,
}: {
  settings: Settings;
  change: Environment["change"];
  launch: Environment["launch"];
}) {
  const dragging = useRef(false);
  return (
    <Reorder.Group
      as="div"
      axis="x"
      values={settings.pinned}
      onReorder={(pinned: string[]) => change({ ...settings, pinned })}
      className="pinned-apps"
    >
      {settings.pinned.map((id) => {
        return (
          <Reorder.Item
            as="button"
            key={id}
            value={id}
            dragMomentum={false}
            onDragStart={() => {
              dragging.current = true;
            }}
            onDragEnd={() => {
              setTimeout(() => {
                dragging.current = false;
              }, 0);
            }}
            onClick={() => {
              if (!dragging.current) launch(id);
            }}
            style={{ touchAction: "none" }}
            aria-label={`Open ${appNames[id]}`}
            title={appNames[id]}
            className="lm-pin"
          >
            <GlassIcon app={appIcon[id]} size={40} finish={settings.iconFinish} />
          </Reorder.Item>
        );
      })}
    </Reorder.Group>
  );
}
function ControlSlider({
  label,
  icon,
  value,
  onCommit,
}: {
  label: string;
  icon: ReactNode;
  value: number | null | undefined;
  onCommit: (n: number) => void;
}) {
  const [current, setCurrent] = useState(value ?? 0);
  useEffect(() => setCurrent(value ?? 0), [value]);
  return (
    <label className="control-slider">
      <span>
        {icon}
        {label}
        <small>
          {value == null ? "Unavailable" : `${Math.round(current)}%`}
        </small>
      </span>
      <input
        aria-label={label}
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
    </label>
  );
}
function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="lm-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, name]) => (
        <button
          key={String(v)}
          role="radio"
          aria-checked={value === v}
          className={value === v ? "on" : ""}
          onClick={() => onChange(v)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className={"lm-sw" + (checked ? " on" : "")}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}
function Line({
  title,
  detail,
  children,
}: {
  title: string;
  detail: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="lm-line">
      <div>
        <div className="lm-t">{title}</div>
        <div className="lm-d">{detail}</div>
      </div>
      {children}
    </div>
  );
}
function LivePreview({ settings: s, night }: { settings: Settings; night: boolean }) {
  const accent = accents[s.accent] ?? accents.lumen;
  const level = glassLevel(s.glass);
  return (
    <div
      className={"lm-preview" + (night ? " night" : "") + (s.light === "auto" ? " auto" : "")}
      role="img"
      aria-label="Live preview"
      style={
        {
          "--accent": accent,
          "--pv-glass": s.reducedTransparency ? "1" : String(level.alpha),
          "--pv-blur": s.reducedTransparency ? "0px" : `${level.blur}px`,
        } as CSSProperties
      }
    >
      <span className="lm-pv-island">
        <i />
      </span>
      <span className="lm-pv-cap">
        <i />
        <i />
      </span>
      <div className={"lm-pv-win" + (s.reducedMotion ? "" : " live")}>
        <span className="lm-pv-side" />
        <GlassIcon app="folder-documents" size={30} finish="lumen" />
        <GlassIcon app="folder-pictures" size={30} finish="lumen" />
        <GlassIcon app="folder-music" size={30} finish="lumen" />
        <b>Open</b>
      </div>
      <div className="lm-pv-shelf">
        {["lumius", "files", "browser", "music", "ask", "settings"].map((a) => (
          <span key={a} style={{ transform: a === "music" ? `translateY(${-s.shelfLift / 2}px)` : undefined }}>
            <GlassIcon app={a} size={26} finish={a === "lumius" ? "spectrum" : s.iconFinish} />
          </span>
        ))}
      </div>
      <small>Live preview</small>
    </div>
  );
}
function SettingsPanel(env: Environment) {
  const { settings: s, change, launch, status, control } = env;
  const [page, setPage] = useState("look");
  const [filter, setFilter] = useState("");
  const groups: [string, { id: string; label: string; d: string }[]][] = [
    [
      "You",
      [
        { id: "account", label: "Account", d: P.account },
        { id: "look", label: "Look and feel", d: P.look },
        { id: "shelf", label: "Island and shelf", d: P.shelf },
        { id: "wallpaper", label: "Wallpaper", d: P.wallpaper },
      ],
    ],
    [
      "Connections",
      [
        { id: "network", label: "Wi-Fi", d: P.wifi },
        { id: "bluetooth", label: "Bluetooth", d: P.bluetooth },
      ],
    ],
    [
      "System",
      [
        { id: "sound", label: "Sound", d: P.sound },
        { id: "display", label: "Displays", d: P.display },
        { id: "energy", label: "Power and battery", d: P.power },
        { id: "ask", label: "Ask and web answers", d: P.sparkle },
        { id: "about", label: "About Lumius", d: P.about },
      ],
    ],
  ];
  const all = groups.flatMap(([, items]) => items);
  const current = all.find((i) => i.id === page) ?? all[1];
  const night = isNight(s, new Date());
  const external = (id: string, what: string, body: ReactNode) => (
    <div className="lm-box">
      <Line title={current.label} detail={body}>
        <button className="lm-btn" onClick={() => launch(id)}>
          Open {what}
          <Glyph d={P.open} size={15} width={2} />
        </button>
      </Line>
    </div>
  );
  return (
    <div className="lm-app lm-settings">
      <nav className="lm-sidebar wide" aria-label="Settings sections" data-drag>
        <div className="lm-side-head" data-drag>
          <GlassIcon app="settings" size={30} />
          <span>Settings</span>
        </div>
        <label className="lm-search lm-side-search">
          <Glyph d={P.search} size={15} width={2} />
          <input
            aria-label="Search settings"
            placeholder="Search, e.g. wallpaper"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        {groups.map(([name, items]) => {
          const shown = items.filter((i) =>
            i.label.toLowerCase().includes(filter.trim().toLowerCase()),
          );
          return (
            shown.length > 0 && (
              <div key={name}>
                <div className="lm-sec">{name}</div>
                {shown.map((i) => (
                  <button
                    key={i.id}
                    className={"lm-side lm-nav" + (i.id === current.id ? " on" : "")}
                    aria-current={i.id === current.id ? "page" : undefined}
                    onClick={() => setPage(i.id)}
                  >
                    <Glyph d={i.d} width={1.8} />
                    {i.label}
                  </button>
                ))}
              </div>
            )
          );
        })}
      </nav>
      <section className="lm-main lm-settings-main">
        <header className="lm-settings-head" data-drag>
          <h1 data-drag>{current.label}</h1>
          <WindowControls />
        </header>
        <div className="lm-settings-scroll">
          {current.id === "look" ? (
            <>
              <LivePreview settings={s} night={night} />
              <div className="lm-cols">
                <div className="lm-box">
                  <Line title="Light" detail="Night also dims the aurora.">
                    <Seg
                      label="Light"
                      value={s.light}
                      options={[
                        ["day", "Day"],
                        ["night", "Night"],
                        ["auto", "Auto"],
                      ]}
                      onChange={(light) => change({ ...s, light })}
                    />
                  </Line>
                  <Line title="Accent" detail="Lumen · focus rims, buttons, island core">
                    <div className="lm-accents" role="radiogroup" aria-label="Accent">
                      {(Object.keys(accents) as Settings["accent"][]).map((a) => (
                        <button
                          key={a}
                          role="radio"
                          aria-checked={s.accent === a}
                          aria-label={a[0].toUpperCase() + a.slice(1)}
                          style={{ "--c": accents[a] } as CSSProperties}
                          className={s.accent === a ? "on" : ""}
                          onClick={() => change({ ...s, accent: a })}
                        />
                      ))}
                    </div>
                  </Line>
                  <Line title="Glass" detail="How much wallpaper shows through.">
                    <Seg
                      label="Glass"
                      value={s.reducedTransparency ? 100 : glassLevel(s.glass).value}
                      options={[
                        [25, "Thin"],
                        [50, "Regular"],
                        [75, "Thick"],
                        [100, "Solid"],
                      ]}
                      onChange={(v) =>
                        change(
                          v === 100
                            ? { ...s, reducedTransparency: true }
                            : { ...s, glass: v, reducedTransparency: false },
                        )
                      }
                    />
                  </Line>
                  <Line title="App icons" detail="Spectrum colors, or Lumen blue everywhere.">
                    <Seg
                      label="App icons"
                      value={s.iconFinish}
                      options={[
                        ["spectrum", "Spectrum"],
                        ["lumen", "Lumen"],
                      ]}
                      onChange={(iconFinish) => change({ ...s, iconFinish })}
                    />
                  </Line>
                </div>
                <div className="lm-box">
                  <Line title="Leaving windows" detail="How a minimized window travels to the shelf.">
                    <Seg
                      label="Leaving windows"
                      value={s.leaving}
                      options={[
                        ["fold", "Fold to light"],
                        ["fade", "Fade"],
                      ]}
                      onChange={(leaving) => change({ ...s, leaving })}
                    />
                  </Line>
                  <Line
                    title="Shelf lift"
                    detail={
                      s.shelfLift
                        ? `Icons rise ${s.shelfLift}px over a pool of their own color.`
                        : "Off: icons stay put, only the light pool shows."
                    }
                  >
                    <input
                      aria-label="Shelf lift"
                      type="range"
                      min="0"
                      max="16"
                      value={s.shelfLift}
                      onChange={(e) => change({ ...s, shelfLift: +e.target.value })}
                    />
                  </Line>
                  <Line title="Moving aurora" detail="Slow light drifting behind the wallpaper.">
                    <Switch
                      label="Moving aurora"
                      checked={s.aurora}
                      onChange={(aurora) => change({ ...s, aurora })}
                    />
                  </Line>
                  <Line title="Reduce motion" detail="Swap folds, blooms and bounces for short fades.">
                    <Switch
                      label="Reduce motion"
                      checked={s.reducedMotion}
                      onChange={(reducedMotion) => change({ ...s, reducedMotion })}
                    />
                  </Line>
                </div>
              </div>
            </>
          ) : current.id === "shelf" ? (
            <div className="lm-cols">
              <div className="lm-box">
                <Line title="Pinned apps" detail="Drag to reorder. Up to six apps live on the shelf.">
                  <Pinned {...env} />
                </Line>
                <div className="lm-pins">
                  {Object.keys(appNames)
                    .filter((id) => id !== "installer" || status?.live)
                    .map((id) => (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={s.pinned.includes(id)}
                          disabled={!s.pinned.includes(id) && s.pinned.length >= 6}
                          onChange={(e) =>
                            change({
                              ...s,
                              pinned: e.target.checked
                                ? [...s.pinned, id]
                                : s.pinned.filter((p) => p !== id),
                            })
                          }
                        />
                        <GlassIcon app={appIcon[id]} size={22} finish={s.iconFinish} />
                        {appNames[id]}
                      </label>
                    ))}
                </div>
              </div>
              <div className="lm-box">
                <Line
                  title="Dynamic Island"
                  detail="Attached to the top edge. Music, transfers and controls share one space; click it or the sound icon to open."
                />
                <Line
                  title="Reserved edges"
                  detail="Windows stay clear of the bar and the shelf. Fullscreen apps hide them until you touch the edge."
                />
              </div>
            </div>
          ) : current.id === "wallpaper" ? (
            <div className="lm-walls">
              {["aurora", "dusk", "ocean"].map((w) => (
                <button
                  key={w}
                  className={"theme-" + w + " lm-wall" + (s.wallpaper === w ? " on" : "")}
                  aria-label={`Use ${w} wallpaper`}
                  aria-pressed={s.wallpaper === w}
                  onClick={() => change({ ...s, wallpaper: w })}
                >
                  <span>{w[0].toUpperCase() + w.slice(1)}</span>
                  {s.wallpaper === w && <Glyph d={P.check} size={16} width={2.4} />}
                </button>
              ))}
            </div>
          ) : current.id === "sound" ? (
            <div className="lm-box lm-pad">
              <ControlSlider
                label="Volume"
                icon={<Glyph d={P.sound} />}
                value={status?.volume}
                onCommit={(n) => control("volume", n)}
              />
              <p className="lm-d">
                Volume follows the default output of this computer.
              </p>
            </div>
          ) : current.id === "display" ? (
            <>
              <div className="lm-box lm-pad">
                <ControlSlider
                  label="Brightness"
                  icon={<Glyph d={P.display} />}
                  value={status?.brightness}
                  onCommit={(n) => control("brightness", n)}
                />
                <p className="lm-d">Brightness appears when the screen has a backlight Lumius can control.</p>
              </div>
              {external("display", "display settings", "Resolution, scale and arrangement.")}
            </>
          ) : current.id === "energy" ? (
            <>
              <div className="lm-box">
                <Line
                  title="Battery"
                  detail={
                    status?.battery != null
                      ? `${status.battery}% charged`
                      : "No battery found; this computer runs on mains power."
                  }
                />
              </div>
              {external("energy", "power settings", "Sleep, screen dimming and power profiles.")}
            </>
          ) : current.id === "network" ? (
            external("network", "Wi-Fi settings", "Join networks and manage connections.")
          ) : current.id === "bluetooth" ? (
            external("bluetooth", "Bluetooth settings", "Pair headphones, mice and keyboards.")
          ) : current.id === "account" ? (
            external("users", "account settings", "Your name, picture and password.")
          ) : current.id === "ask" ? (
            <ExaSettings launch={launch} />
          ) : (
            <div className="lm-box lm-about">
              <GlassIcon app="lumius" size={84} />
              <h2>Lumius</h2>
              <p className="lm-d">Light, behind glass.</p>
              <dl>
                <dt>Version</dt>
                <dd>1.0 · Debian 13 base</dd>
                <dt>Desktop</dt>
                <dd>KDE Plasma · KWin</dd>
                <dt>Session</dt>
                <dd>{native ? status?.platform || "Native" : "Browser demo · sample files"}</dd>
                <dt>License</dt>
                <dd>GPL-3.0-only · upstream licenses retained</dd>
              </dl>
              <p className="lm-d">
                Built with open-source software. Fonts: Space Grotesk and DM Sans (OFL).
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const suggestions = [
  "What's new in Linux this month?",
  "Explain how an operating system boots",
  "Best open-source alternatives to Photoshop",
];
// Turns Exa's "[1]" citation markers and **bold** runs into inline elements.
function AnswerText({
  text,
  onCite,
}: {
  text: string;
  onCite: (index: number) => void;
}) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((paragraph, i) => (
          <p key={i}>
            {paragraph.split(/(\[\d+\]|\*\*[^*]+\*\*)/).map((part, j) => {
              const cite = part.match(/^\[(\d+)\]$/);
              if (cite)
                return (
                  <button
                    key={j}
                    className="cite"
                    aria-label={`Open source ${cite[1]}`}
                    onClick={() => onCite(Number(cite[1]) - 1)}
                  >
                    {cite[1]}
                  </button>
                );
              if (part.startsWith("**") && part.endsWith("**"))
                return <b key={j}>{part.slice(2, -2)}</b>;
              return part;
            })}
          </p>
        ))}
    </>
  );
}
function AskPanel() {
  const [query, setQuery] = useState(""),
    [asked, setAsked] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Answer | null>(null);
  const request = useRef(0);
  const ask = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    const id = ++request.current;
    setQuery(q);
    setAsked(q);
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const answer = await call<Answer>("ask", { query: q });
      if (id === request.current) setResult(answer);
    } catch (e) {
      if (id === request.current) setError(String(e));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  const openSource = (index: number) => {
    const source = result?.citations[index];
    if (source)
      call("open_url", { url: source.url }).catch((e) => setError(String(e)));
  };
  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };
  return (
    <div className="app-body ask-body">
      <div className="ask-scroll">
        <header className="ask-hero">
          <span className="ask-orb">
            <Sparkle weight="fill" />
          </span>
          <h1>Ask anything.</h1>
          <p>Answers from the live web, with sources. Powered by Exa.</p>
          <form
            className="ask-box"
            onSubmit={(e) => {
              e.preventDefault();
              ask(query);
            }}
          >
            <MagnifyingGlass />
            <input
              autoFocus
              aria-label="Ask a question"
              placeholder="Ask about anything on the web…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="primary"
              type="submit"
              disabled={busy || !query.trim()}
            >
              {busy ? "Searching…" : "Ask"}
              <ArrowRight />
            </button>
          </form>
          {!result && !busy && (
            <div className="ask-suggestions">
              {suggestions.map((s) => (
                <button key={s} onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </header>
        {error && (
          <div className="inline-error ask-error" role="alert">
            <Info />
            <span>{error}</span>
            <button aria-label="Dismiss" onClick={() => setError("")}>
              <X />
            </button>
          </div>
        )}
        {busy && (
          <div className="ask-card glass" role="status">
            <p className="eyebrow">READING THE WEB</p>
            <span className="ask-shimmer" />
            <span className="ask-shimmer" />
            <span className="ask-shimmer short" />
          </div>
        )}
        {result && (
          <article className="ask-card glass" aria-live="polite">
            <p className="eyebrow">ANSWER</p>
            <h2>{asked}</h2>
            <div className="ask-answer">
              {result.answer ? (
                <AnswerText text={result.answer} onCite={openSource} />
              ) : (
                <p>Exa found no answer for that. Try rephrasing.</p>
              )}
            </div>
            {result.citations.length > 0 && (
              <>
                <p className="eyebrow">SOURCES</p>
                <ol className="ask-sources">
                  {result.citations.map((c, i) => (
                    <li key={c.url + i}>
                      <button onClick={() => openSource(i)}>
                        <span className="source-index">{i + 1}</span>
                        <span>
                          <b>{c.title}</b>
                          <small>{host(c.url)}</small>
                        </span>
                        <ArrowSquareOut />
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
function ExaSettings({ launch }: { launch: Environment["launch"] }) {
  const [configured, setConfigured] = useState<boolean | null>(null),
    [key, setKey] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    call<{ configured: boolean | null }>("exa_key_status")
      .then((r) => setConfigured(r.configured))
      .catch(() => setConfigured(false));
  }, []);
  return (
    <>
      <p className="settings-intro">
        Ask answers questions from the live web, with sources, using Exa.
      </p>
      <div className="settings-group glass">
        <h2>Exa API key</h2>
        <p>
          {configured === null
            ? "In the browser demo the key is read from .env.local by the dev server."
            : configured
              ? "A key is saved. Paste a new one to replace it."
              : "Paste your key from dashboard.exa.ai. It is stored privately in your home folder."}
        </p>
        {configured !== null && (
          <form
            className="key-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await call<{ configured: boolean }>("exa_key_set", {
                  key,
                });
                setConfigured(r.configured);
                setKey("");
                setMessage("Saved. Ask is ready.");
              } catch (err) {
                setMessage(String(err));
              }
            }}
          >
            <Key />
            <input
              type="password"
              aria-label="Exa API key"
              placeholder="Exa API key"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="primary" type="submit" disabled={!key.trim()}>
              Save key
            </button>
          </form>
        )}
        {message && <p role="status">{message}</p>}
        <button className="primary" onClick={() => launch("ask")}>
          Open Ask
          <ArrowSquareOut />
        </button>
      </div>
    </>
  );
}
