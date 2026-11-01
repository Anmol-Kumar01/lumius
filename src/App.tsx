import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, MotionConfig, Reorder } from "motion/react";
import {
  Folder,
  House,
  DownloadSimple,
  MusicNotes,
  Image,
  FilmStrip,
  Trash,
  HardDrives,
  Star,
  Clock,
  FileText,
  Gear,
  SquaresFour,
  List,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  MagnifyingGlass,
  Plus,
  X,
  Minus,
  Copy,
  Scissors,
  Clipboard,
  ArrowClockwise,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  Sun,
  WifiHigh,
  Bluetooth,
  Monitor,
  Palette,
  Info,
  Terminal,
  Globe,
  Power,
  Check,
  FileZip,
  ArrowSquareOut,
  DotsThree,
  SidebarSimple,
  BatteryHigh,
  Desktop,
  FloppyDisk,
  Eye,
  Storefront,
  Lock,
} from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import { call, defaults, native } from "./bridge";
import { islandTransition } from "./nectar-motion";
import Toggle from "./Toggle";
import GlassOptics from "./GlassOptics";
import type {
  Entry,
  Listing,
  Settings,
  Status,
  Transfer,
  TrashItem,
} from "./types";

const appIcons: Record<string, typeof Folder> = {
  files: Folder,
  settings: Gear,
  music: MusicNotes,
  browser: Globe,
  terminal: Terminal,
  store: Storefront,
  installer: DownloadSimple,
};
const appNames: Record<string, string> = {
  files: "Files",
  settings: "Settings",
  music: "Music",
  browser: "Browser",
  terminal: "Terminal",
  store: "Software",
  installer: "Install Lumius",
};
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
function EntryIcon({
  entry,
  large = false,
}: {
  entry: Entry;
  large?: boolean;
}) {
  const Icon = entry.directory
    ? Folder
    : entry.kind === "Audio"
      ? MusicNotes
      : entry.kind === "Image"
        ? Image
        : entry.kind === "Archive"
          ? FileZip
          : FileText;
  return (
    <span
      className={`entry-icon ${entry.directory ? "folder" : entry.kind.toLowerCase()} ${large ? "large" : ""}`}
    >
      <Icon weight={entry.directory ? "fill" : "duotone"} />
    </span>
  );
}

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
    if (!native || !["bar", "dock", "island"].includes(view)) return;
    const element = document.querySelector(
      view === "bar" ? ".menubar" : "." + view,
    );
    if (!element) return;
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect();
        call("window_region", {
          x: Math.max(0, box.x),
          y: Math.max(0, box.y),
          width: box.width,
          height: box.height,
        }).catch(console.error);
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(element);
    observer.observe(document.documentElement);
    window.addEventListener("resize", report);
    report();
    return () => {
      observer.disconnect();
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
          if (!saving.current) setSettings(s);
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
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(slow);
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
    if (!native && ["files", "settings"].includes(id)) {
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
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? "always" : "user"}>
      <div
        className={`lumius theme-${settings.wallpaper} view-${view} ${settings.reducedTransparency ? "solid" : ""} ${settings.reducedMotion ? "still" : ""}`}
        style={
          {
            "--glass-alpha": `${0.3 + settings.glass * 0.004}`,
            "--blur": `${12 + settings.glass * 0.35}px`,
          } as CSSProperties
        }
      >
        <GlassOptics />
        {view === "desktop" && (
          <>
            <div className="wallpaper" />
            <Menubar launch={launch} status={status} now={now} />
            <div className="desktop-shortcuts">
              <button onClick={() => launch("files")}>
                <span>
                  <HardDrives weight="duotone" />
                </span>
                Lumius Home
              </button>
              <button onClick={() => launch("installer")}>
                <span>
                  <DownloadSimple weight="duotone" />
                </span>
                Install Lumius
              </button>
            </div>
            <Island {...env} />
            <div className="desktop-window">
              <WindowFrame
                title={previewView === "files" ? "Files" : "Settings"}
                preview
              >
                <>
                  {previewView === "files" ? (
                    <Files launch={launch} transfers={transfers} />
                  ) : (
                    <SettingsPanel {...env} />
                  )}
                </>
              </WindowFrame>
            </div>
            <Dock {...env} />
            <div className="desktop-wordmark">
              lumius<span>A little more possibility.</span>
            </div>
            {!native && (
              <div className="preview-label">
                Design preview · native Linux build required for system actions
              </div>
            )}
          </>
        )}
        {view === "files" && (
          <WindowFrame title="Files">
            <Files launch={launch} transfers={transfers} />
          </WindowFrame>
        )}
        {view === "settings" && (
          <WindowFrame title="Settings">
            <SettingsPanel {...env} />
          </WindowFrame>
        )}
        {view === "bar" && (
          <Menubar launch={launch} status={status} now={now} />
        )}{" "}
        {view === "island" && <Island {...env} />}
        {view === "dock" && <Dock {...env} />}
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
function WindowFrame({
  title,
  children,
  preview = false,
}: {
  title: string;
  children: ReactNode;
  preview?: boolean;
}) {
  const action = (a: "close" | "minimize" | "toggleMaximize") => {
    if (native) getCurrentWindow()[a]().catch(console.error);
  };
  return (
    <main className="app-window glass" aria-label={`Lumius ${title}`}>
      <div
        className="window-titlebar"
        onDoubleClick={() => action("toggleMaximize")}
        onPointerDown={(e) => {
          if (native && e.button === 0 && e.target === e.currentTarget)
            getCurrentWindow().startDragging().catch(console.error);
        }}
      >
        <div className="traffic-lights">
          <button aria-label="Close window" onClick={() => action("close")}>
            <X />
          </button>
          <button
            aria-label="Minimize window"
            onClick={() => action("minimize")}
          >
            <Minus />
          </button>
          <button
            aria-label="Maximize window"
            onClick={() => action("toggleMaximize")}
          >
            <Plus />
          </button>
        </div>
        <span>
          Lumius <b>{title}</b>
        </span>
        <div>
          {preview ? (
            <span className="native-badge">Preview</span>
          ) : (
            <IconButton
              label="Maximize window"
              onClick={() => action("toggleMaximize")}
            >
              <SquaresFour />
            </IconButton>
          )}
        </div>
      </div>
      {children}
    </main>
  );
}

function Files({
  launch,
  transfers,
}: {
  launch: (id: string) => void;
  transfers: Transfer[];
}) {
  const [home, setHome] = useState(""),
    [path, setPath] = useState(""),
    [listing, setListing] = useState<Listing>({ path: "", entries: [] }),
    [selected, setSelected] = useState<Entry | null>(null),
    [layout, setLayout] = useState<"list" | "grid">("list"),
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
        load(h);
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
    e.directory ? navigate(e.path) : execute("open", { path: e.path });
  const showPreview = async (e: Entry) => {
    if (e.directory) {
      navigate(e.path);
      return;
    }
    setPreview({ entry: e });
    if (e.kind !== "Image")
      try {
        const result = await call<{ text: string; truncated: boolean }>(
          "preview",
          { path: e.path },
        );
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
  const places = [
    { name: "Home", folder: "", icon: House },
    { name: "Desktop", folder: "Desktop", icon: Desktop },
    { name: "Documents", folder: "Documents", icon: FileText },
    { name: "Downloads", folder: "Downloads", icon: DownloadSimple },
    { name: "Music", folder: "Music", icon: MusicNotes },
    { name: "Pictures", folder: "Pictures", icon: Image },
    { name: "Videos", folder: "Videos", icon: FilmStrip },
  ];
  return (
    <div className="app-body files-body">
      <aside className="files-sidebar">
        <div className="sidebar-heading">
          <span className="logo-orb" />
          lumius<span className="small-label">FILES</span>
        </div>
        <button
          className="new-folder"
          onClick={() => setModal({ type: "mkdir", value: "" })}
        >
          <Plus weight="bold" />
          New folder
        </button>
        <p className="section-caption">FAVORITES</p>
        <nav>
          {places.map(({ name, folder, icon: Icon }) => (
            <button
              key={name}
              className={
                path === (folder ? `${home}/${folder}` : home) && !trash
                  ? "selected"
                  : ""
              }
              onClick={() => navigate(folder ? `${home}/${folder}` : home)}
            >
              <Icon weight="duotone" />
              {name}
              {name === "Home" && <span>⌘ 1</span>}
            </button>
          ))}
          <button
            className={trash ? "selected" : ""}
            onClick={async () => {
              try {
                setTrash(await call<TrashItem[]>("trash_list"));
                setSelected(null);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <Trash />
            Trash
          </button>
        </nav>
        <p className="section-caption">DEVICES</p>
        <nav>
          <button onClick={() => navigate("/")}>
            <HardDrives />
            Lumius disk
          </button>
          {mounts.map((d) => (
            <button key={d.path} onClick={() => navigate(d.path)}>
              <FloppyDisk />
              {d.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <span className="user-avatar">L</span>
            <div>
              <b>Your workspace</b>
              <small>Make yourself at home</small>
            </div>
            <button
              title="Open Settings"
              aria-label="Open Settings"
              onClick={() => launch("settings")}
            >
              <Gear />
            </button>
          </div>
          <span className="system-storage">
            {native
              ? "Connected to local filesystem"
              : "Browser design preview"}
          </span>
        </div>
      </aside>
      <section className="files-main">
        <div className="file-scroll">
          <div className="files-chrome">
            <div className="file-toolbar">
              <div>
                <IconButton
                  label="Back"
                  disabled={historyIndex <= 0}
                  onClick={() => {
                    const i = historyIndex - 1;
                    setHistoryIndex(i);
                    setTabs((ts) =>
                      ts.map((p, j) => (j === activeTab ? history[i] : p)),
                    );
                    load(history[i]);
                  }}
                >
                  <ArrowLeft />
                </IconButton>
                <IconButton
                  label="Forward"
                  disabled={historyIndex >= history.length - 1}
                  onClick={() => {
                    const i = historyIndex + 1;
                    setHistoryIndex(i);
                    setTabs((ts) =>
                      ts.map((p, j) => (j === activeTab ? history[i] : p)),
                    );
                    load(history[i]);
                  }}
                >
                  <ArrowRight />
                </IconButton>
                <IconButton
                  label="Parent folder"
                  disabled={!path || path === "/"}
                  onClick={() =>
                    navigate(path.slice(0, path.lastIndexOf("/")) || "/")
                  }
                >
                  <ArrowUp />
                </IconButton>
                <span className="toolbar-divider" />
                <span className="breadcrumb">
                  <House size={16} />
                  <span>
                    {trash
                      ? "Trash"
                      : path === home
                        ? "Home"
                        : path.split("/").filter(Boolean).slice(-2).join(" / ")}
                  </span>
                </span>
              </div>
              <form
                className="search glass"
                onSubmit={(e) => {
                  e.preventDefault();
                  search();
                }}
              >
                <MagnifyingGlass />
                <input
                  aria-label="Search files"
                  placeholder={
                    global ? "Search indexed home…" : "Search this folder…"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
            </div>
            <div className="file-tabs">
              {tabs.map((t, i) => (
                <button
                  key={i}
                  className={activeTab === i ? "current" : ""}
                  onClick={() => {
                    setActiveTab(i);
                    setHistory([t]);
                    setHistoryIndex(0);
                    setQuery("");
                    setGlobal(false);
                    load(t);
                  }}
                >
                  <Folder size={15} />
                  {t === home ? "Home" : t.split("/").pop() || "Disk"}
                  {tabs.length > 1 && (
                    <span
                      role="button"
                      aria-label={`Close tab ${i + 1}`}
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(i);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          closeTab(i);
                        }
                      }}
                    >
                      <X size={12} />
                    </span>
                  )}
                </button>
              ))}
              <IconButton
                label="New tab"
                onClick={() => {
                  setActiveTab(tabs.length);
                  setTabs((t) => [...t, path]);
                  setHistory([path]);
                  setHistoryIndex(0);
                }}
              >
                <Plus />
              </IconButton>
            </div>
          </div>
          <div className="files-content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR SPACE, BEAUTIFULLY ORGANIZED</p>
                <h1>
                  {trash
                    ? "Trash"
                    : path === home
                      ? "My files"
                      : path.split("/").pop() || "Lumius disk"}
                  <span className="count-pill">
                    {trash ? trash.length : entries.length}
                  </span>
                </h1>
              </div>
              <div>
                <IconButton label="Refresh" onClick={() => load(path)}>
                  <ArrowClockwise />
                </IconButton>
                <div className="segmented">
                  <IconButton
                    label="Grid view"
                    active={layout === "grid"}
                    onClick={() => setLayout("grid")}
                  >
                    <SquaresFour />
                  </IconButton>
                  <IconButton
                    label="List view"
                    active={layout === "list"}
                    onClick={() => setLayout("list")}
                  >
                    <List />
                  </IconButton>
                </div>
              </div>
            </div>
            {!trash && path === home && !query && (
              <>
                <div className="subheading">
                  <h2>Quick access</h2>
                  <span>Everything, a little closer.</span>
                </div>
                <div className="quick-access">
                  {places.slice(2, 6).map(({ name, folder, icon: Icon }, i) => (
                    <button
                      className={"quick-card card-" + i}
                      key={name}
                      onClick={() => navigate(`${home}/${folder}`)}
                    >
                      <div>
                        <Icon weight="duotone" />
                        <ArrowSquareOut size={16} />
                      </div>
                      <b>{name}</b>
                      <small>
                        Open folder
                        <ArrowRight size={12} />
                      </small>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="subheading files-actions">
              <h2>{trash ? "Recently deleted" : "All files"}</h2>
              <div>
                <label className="scope-check">
                  <input
                    type="checkbox"
                    checked={global}
                    onChange={(e) => setGlobal(e.target.checked)}
                  />
                  Indexed search
                </label>
                {global && (
                  <button onClick={buildIndex} disabled={busy}>
                    Rebuild index
                  </button>
                )}
                <select
                  aria-label="Sort files"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="name">Name</option>
                  <option value="modified">Modified</option>
                  <option value="size">Size</option>
                </select>
              </div>
            </div>
            {listing.warning && !trash && (
              <p className="inline-note">{listing.warning}</p>
            )}
            {error && (
              <div className="inline-error" role="alert">
                <Info />
                <span>{error}</span>
                <button
                  aria-label="Dismiss Files error"
                  onClick={() => setError("")}
                >
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
                    <Trash />
                    <span>
                      <b>{t.name}</b>
                      <small>{t.original}</small>
                    </span>
                    <button
                      onClick={async () => {
                        await execute("restore", { id: t.id });
                        try {
                          setTrash(await call<TrashItem[]>("trash_list"));
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
                {!trash.length && (
                  <div className="empty-state">
                    <Trash />
                    <h3>All clear.</h3>
                    <p>Deleted files appear here for restoration.</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div
                  className={"file-entries " + layout}
                  role="list"
                  aria-label="Files"
                >
                  {layout === "list" && (
                    <div className="list-head">
                      <span>Name</span>
                      <span>Date modified</span>
                      <span>Size</span>
                      <span>Kind</span>
                    </div>
                  )}
                  {entries.map((e) => (
                    <button
                      role="listitem"
                      className={
                        "file-entry " +
                        (selected?.path === e.path ? "selected" : "")
                      }
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
                      <span className="filename">
                        <EntryIcon entry={e} large={layout === "grid"} />
                        <span>{e.name}</span>
                      </span>
                      {layout === "list" && (
                        <>
                          <span>
                            {e.modified
                              ? new Date(e.modified * 1000).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )
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
                    <Folder weight="duotone" />
                    <h3>
                      {query ? "Nothing found." : "Room for something new."}
                    </h3>
                    <p>
                      {query
                        ? "Try another filename or rebuild the home index."
                        : "Create a folder or paste files here."}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="selection-bar">
          <span>
            {selected ? selected.name : `${entries.length} items`}{" "}
            {clipboard && (
              <small>
                {" "}
                · {clipboard.move ? "Move" : "Copy"}: {clipboard.entry.name}
              </small>
            )}
          </span>
          <div>
            <IconButton
              label="Open selected"
              disabled={!selected}
              onClick={() => selected && open(selected)}
            >
              <ArrowSquareOut />
            </IconButton>
            <IconButton
              label="Preview"
              disabled={!selected}
              onClick={() => selected && showPreview(selected)}
            >
              <Eye />
            </IconButton>
            <IconButton
              label="Copy"
              disabled={!selected}
              onClick={() =>
                selected && setClipboard({ entry: selected, move: false })
              }
            >
              <Copy />
            </IconButton>
            <IconButton
              label="Cut"
              disabled={!selected}
              onClick={() =>
                selected && setClipboard({ entry: selected, move: true })
              }
            >
              <Scissors />
            </IconButton>
            <IconButton
              label="Paste"
              disabled={!clipboard || busy}
              onClick={async () => {
                if (clipboard) {
                  const result = await execute("transfer", {
                    source: clipboard.entry.path,
                    destination: path,
                    move: clipboard.move,
                  });
                  if (result) setClipboard(null);
                }
              }}
            >
              <Clipboard />
            </IconButton>
            <IconButton
              label="Rename"
              disabled={!selected}
              onClick={() =>
                selected && setModal({ type: "rename", value: selected.name })
              }
            >
              <FileText />
            </IconButton>
            <IconButton
              label="Extract ZIP"
              disabled={!selected || selected.kind !== "Archive"}
              onClick={() =>
                selected && execute("extract", { path: selected.path })
              }
            >
              <FileZip />
            </IconButton>
            <IconButton
              label="Move to Trash"
              disabled={!selected}
              onClick={() =>
                selected && setModal({ type: "trash", value: selected.name })
              }
            >
              <Trash />
            </IconButton>
          </div>
        </div>
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
            ) : (
              <pre>
                {preview.text || "Loading preview…"}
                {preview.truncated ? "\n… Preview limited to 64 KiB." : ""}
              </pre>
            )}
            <button className="primary" onClick={() => open(preview.entry)}>
              Open in application
            </button>
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
function Island({
  settings,
  change,
  launch,
  status,
  control,
  transfers,
}: Environment) {
  const [expanded, setExpanded] = useState(false),
    [tab, setTab] = useState("music");
  const active = transfers.find((t) => t.state === "running");
  const toggle = (value: boolean) => {
    setExpanded(value);
    if (native) call("island_expand", { expanded: value }).catch(console.error);
  };
  return (
    <div className="island-position">
      <motion.section
        className="island"
        aria-label="Dynamic Island"
        animate={{ width: expanded ? 460 : 310, height: expanded ? 300 : 46 }}
        transition={settings.reducedMotion ? { duration: 0 } : islandTransition}
      >
        <button
          className="island-summary"
          aria-label={
            expanded ? "Collapse Dynamic Island" : "Expand Dynamic Island"
          }
          aria-expanded={expanded}
          onClick={() => toggle(!expanded)}
        >
          <span className="island-orb">
            <MusicNotes weight="fill" />
          </span>
          <span>
            {active
              ? "Transferring files"
              : status?.playing
                ? status.title
                : "Lumius"}
            <small>
              {active
                ? `${Math.round((active.done / Math.max(1, active.total)) * 100)}%`
                : "a space for everything"}
            </small>
          </span>
          <span className={"wave " + (status?.playing ? "playing" : "")}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              className="island-content"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <nav>
                {["music", "controls", "apps"].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              {tab === "music" ? (
                <>
                  <div className="now-playing">
                    <div className="album-art">
                      <MusicNotes size={34} weight="duotone" />
                    </div>
                    <div>
                      <b>{status?.title || "Connecting to player…"}</b>
                      <small>
                        {status?.artist || "Open Music to play a local track"}
                      </small>
                    </div>
                    <button
                      aria-label="Open Music"
                      onClick={() => launch("music")}
                    >
                      <ArrowSquareOut />
                    </button>
                  </div>
                  <div className="playback">
                    <IconButton
                      label="Previous track"
                      onClick={() => control("previous")}
                    >
                      <SkipBack weight="fill" />
                    </IconButton>
                    <IconButton
                      label={status?.playing ? "Pause" : "Play"}
                      onClick={() => control("play-pause")}
                    >
                      {status?.playing ? (
                        <Pause weight="fill" />
                      ) : (
                        <Play weight="fill" />
                      )}
                    </IconButton>
                    <IconButton
                      label="Next track"
                      onClick={() => control("next")}
                    >
                      <SkipForward weight="fill" />
                    </IconButton>
                  </div>
                </>
              ) : tab === "controls" ? (
                <div className="island-controls">
                  <ControlSlider
                    label="Volume"
                    icon={<SpeakerHigh />}
                    value={status?.volume}
                    onCommit={(n) => control("volume", n)}
                  />
                  <ControlSlider
                    label="Brightness"
                    icon={<Sun />}
                    value={status?.brightness}
                    onCommit={(n) => control("brightness", n)}
                  />
                  <button onClick={() => launch("files")}>
                    <Folder />
                    Open Files
                  </button>
                </div>
              ) : (
                <>
                  <p className="island-hint">
                    Drag to reorder your pinned apps
                  </p>
                  <Pinned settings={settings} change={change} launch={launch} />
                </>
              )}
              {active ? (
                <div className="transfer-widget">
                  <span>{active.name}</span>
                  <progress
                    max={Math.max(1, active.total)}
                    value={active.done}
                  />
                  <button onClick={() => call("cancel", { id: active.id })}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="island-files"
                  onClick={() => launch("files")}
                >
                  <Folder />
                  Your files, within reach
                  <ArrowRight />
                </button>
              )}
              {transfers
                .filter((t) => t.state === "error")
                .slice(-1)
                .map((t) => (
                  <p role="alert" className="transfer-error" key={t.id}>
                    {t.error}
                  </p>
                ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
}
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
        const Icon = appIcons[id] || Folder;
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
            className={"app-icon app-" + id}
          >
            <Icon weight="duotone" />
          </Reorder.Item>
        );
      })}
    </Reorder.Group>
  );
}
function Dock(env: Environment) {
  return (
    <div className="dock-position">
      <nav className="dock glass" aria-label="Application dock">
        <IconButton label="Search apps" onClick={() => env.launch("launcher")}>
          <SquaresFour weight="fill" />
        </IconButton>
        <span className="dock-divider" />
        <Pinned {...env} />
      </nav>
    </div>
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
function SettingsPanel(env: Environment) {
  const { settings: s, change, launch, status, control } = env;
  const [page, setPage] = useState("appearance");
  const categories = [
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "desktop", label: "Desktop & Island", icon: Desktop },
    { id: "sound", label: "Sound & brightness", icon: SpeakerHigh },
    { id: "network", label: "Wi-Fi & network", icon: WifiHigh },
    { id: "bluetooth", label: "Bluetooth", icon: Bluetooth },
    { id: "display", label: "Displays", icon: Monitor },
    { id: "about", label: "About Lumius", icon: Info },
  ];
  return (
    <div className="app-body settings-body">
      <aside className="settings-sidebar">
        <div className="settings-profile">
          <div className="logo-orb" />
          <h2>Make it yours.</h2>
          <p>Your Lumius, your way.</p>
        </div>
        <nav>
          {categories.map(({ id, label, icon: Icon }) => (
            <button
              className={id === page ? "selected" : ""}
              key={id}
              onClick={() => setPage(id)}
            >
              <Icon weight="duotone" />
              {label}
              <ArrowRight size={14} />
            </button>
          ))}
        </nav>
      </aside>
      <section className="settings-main">
        <header className="settings-head">
          <p className="eyebrow">A LITTLE MORE YOU</p>
          <h1>{categories.find((c) => c.id === page)?.label}</h1>
        </header>
        {page === "appearance" ? (
          <>
            <p className="settings-intro">
              A softer view of everything you do.
            </p>
            <div className="appearance-preview glass">
              <div className="mini-island" />
              <div className="mini-window glass">
                <span />
                <span />
                <span />
              </div>
              <div className="mini-dock glass">
                <Folder />
                <MusicNotes />
                <Gear />
              </div>
            </div>
            <h2>Choose your atmosphere</h2>
            <div className="wallpaper-options">
              {["aurora", "dusk", "ocean"].map((w) => (
                <button
                  key={w}
                  className={
                    "theme-" +
                    w +
                    " wallpaper-swatch " +
                    (s.wallpaper === w ? "chosen" : "")
                  }
                  aria-label={`Use ${w} wallpaper`}
                  aria-pressed={s.wallpaper === w}
                  onClick={() => change({ ...s, wallpaper: w })}
                >
                  <span>{w}</span>
                  {s.wallpaper === w && <Check weight="bold" />}
                </button>
              ))}
            </div>
            <div className="settings-group glass">
              <label className="control-slider">
                <span>
                  <Sun />
                  Glass intensity<small>{s.glass}%</small>
                </span>
                <input
                  aria-label="Glass intensity"
                  type="range"
                  min="0"
                  max="100"
                  value={s.glass}
                  onChange={(e) => change({ ...s, glass: +e.target.value })}
                />
              </label>
              <Toggle
                title="Reduce transparency"
                detail="Use solid surfaces for easier reading"
                checked={s.reducedTransparency}
                onChange={(v) => change({ ...s, reducedTransparency: v })}
              />
              <Toggle
                title="Reduce motion"
                detail="Keep transitions simple and comfortable"
                checked={s.reducedMotion}
                onChange={(v) => change({ ...s, reducedMotion: v })}
              />
            </div>
          </>
        ) : page === "desktop" ? (
          <>
            <p className="settings-intro">
              Your favorite things. Always within reach.
            </p>
            <div className="settings-group glass">
              <h2>Pinned apps</h2>
              <p>
                Drag icons to rearrange. Changes appear in the island and dock.
              </p>
              <Pinned {...env} />
              <div className="pin-options">
                {Object.keys(appNames)
                  .filter((id) => id !== "installer" || status?.live)
                  .map((id) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={s.pinned.includes(id)}
                        onChange={(e) =>
                          change({
                            ...s,
                            pinned: e.target.checked
                              ? [...s.pinned, id]
                              : s.pinned.filter((p) => p !== id),
                          })
                        }
                      />
                      {appNames[id]}
                    </label>
                  ))}
              </div>
            </div>
            <div className="settings-group glass">
              <h2>Dynamic Island</h2>
              <p>
                Attached to the top edge. Music, controls and file transfers
                share one space.
              </p>
              <p>
                Normal windows keep a reserved top area. Fullscreen uses an edge
                reveal.
              </p>
            </div>
          </>
        ) : page === "sound" ? (
          <div className="settings-group glass">
            <ControlSlider
              label="Volume"
              icon={<SpeakerHigh />}
              value={status?.volume}
              onCommit={(n) => control("volume", n)}
            />
            <ControlSlider
              label="Brightness"
              icon={<Sun />}
              value={status?.brightness}
              onCommit={(n) => control("brightness", n)}
            />
            <p>
              Controls appear when the Linux session exposes supported audio and
              backlight devices.
            </p>
          </div>
        ) : page === "about" ? (
          <div className="about-panel glass">
            <div className="logo-orb" />
            <h2>Lumius</h2>
            <p>A space for everything.</p>
            <dl>
              <dt>Edition</dt>
              <dd>Developer preview 0.1.0</dd>
              <dt>Foundation</dt>
              <dd>Debian 13 · KDE Plasma</dd>
              <dt>Session</dt>
              <dd>
                {native
                  ? status?.platform || "Native"
                  : "Browser design preview"}
              </dd>
              <dt>License</dt>
              <dd>GPL-3.0-only · upstream licenses retained</dd>
            </dl>
            <p>
              Built with open-source software. Island spring animation adapted
              from Nectar / Bloom.
            </p>
          </div>
        ) : (
          <div className="settings-group glass">
            <h2>{categories.find((c) => c.id === page)?.label}</h2>
            <p>
              Manage your actual devices using the native system configuration.
            </p>
            <button className="primary" onClick={() => launch(page)}>
              Open {categories.find((c) => c.id === page)?.label} settings
              <ArrowSquareOut />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Menubar({
  launch,
  status,
  now,
}: {
  launch: (id: string) => Promise<void>;
  status: Status | null;
  now: Date;
}) {
  return (
    <header className="menubar">
      <div>
        <span className="brand-mark">◒</span>
        <b>Lumius</b>
        <button onClick={() => launch("files")}>Files</button>
        <button onClick={() => launch("settings")}>Settings</button>
      </div>
      <div>
        <button aria-label="Network settings" onClick={() => launch("network")}>
          <WifiHigh />
        </button>
        <button aria-label="Sound settings" onClick={() => launch("settings")}>
          <SpeakerHigh />
        </button>
        {status?.battery != null && (
          <>
            <BatteryHigh />
            {status.battery}%
          </>
        )}
        <span>
          {now.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </span>
        <span>
          {now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button aria-label="Lock screen" onClick={() => launch("lock")}>
          <Lock />
        </button>
        <button aria-label="Power options" onClick={() => launch("power")}>
          <Power />
        </button>
      </div>
    </header>
  );
}
