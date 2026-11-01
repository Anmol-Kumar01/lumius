import { invoke } from "@tauri-apps/api/core";
import type {
  Answer,
  Entry,
  IntelAdviseResult,
  IntelAssistResult,
  IntelPolicy,
  IntelSnapshot,
  IntelSnapshotResult,
  IntelStatus,
  Listing,
  ProviderStatus,
  Settings,
  Status,
  TrashItem,
  Transfer,
} from "./types";
export const native = "__TAURI_INTERNALS__" in window;
export const defaults: Settings = {
  glass: 50,
  reducedMotion: false,
  reducedTransparency: false,
  wallpaper: "aurora",
  pinned: ["files", "browser", "music", "ask", "terminal", "settings"],
  light: "day",
  accent: "lumen",
  iconFinish: "spectrum",
  leaving: "fold",
  shelfLift: 8,
  aurora: true,
};

// Browser mode is a clearly labelled demo. It works on an in-memory set of
// sample files and never reads or changes anything on the visitor's computer.
export const demoHome = "/home/demo";
type DemoNode = Entry & { text?: string; url?: string; zip?: string[] };
const fs = new Map<string, DemoNode>();
const trash: (TrashItem & { nodes: DemoNode[] })[] = [];
const jobs: Transfer[] = [];
const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";
const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const kindOf = (name: string) => {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) return "Image";
  if (["mp3", "ogg", "flac", "wav"].includes(ext)) return "Audio";
  if (ext === "zip") return "Archive";
  if (["txt", "md", "json", "log"].includes(ext)) return "Document";
  return "File";
};
const stamp = () => Math.floor(Date.now() / 1000);
function put(path: string, extra: Partial<DemoNode> = {}, directory = false) {
  const name = nameOf(path);
  fs.set(path, {
    name,
    path,
    directory,
    size: extra.text ? new Blob([extra.text]).size : (extra.size ?? 0),
    modified: extra.modified ?? stamp() - Math.floor(Math.random() * 400000),
    kind: directory ? "Folder" : kindOf(name),
    ...extra,
  });
}
const dir = (path: string) => put(path, {}, true);
function seed() {
  dir("/");
  dir("/home");
  dir(demoHome);
  for (const d of [
    "Desktop",
    "Documents",
    "Downloads",
    "Music",
    "Pictures",
    "Videos",
  ])
    dir(`${demoHome}/${d}`);
  put(`${demoHome}/Desktop/Hackathon pitch.txt`, {
    text: "Lumius — a calm, glass desktop built on Debian.\n\n1. Problem\n2. Demo\n3. Plan\n",
  });
  put(`${demoHome}/Documents/Welcome to Lumius.txt`, {
    text: "Welcome to Lumius.\n\nThis is the browser demo: create folders, rename, copy, paste, move to Trash and restore. Play the track in Music and control it from the island.\n\nInstall the Lumius ISO to use your own files.",
  });
  put(`${demoHome}/Documents/Project plan.md`, {
    text: "# Lumius roadmap\n\n- Glass shell, Files, Settings\n- Dynamic Island with music and transfers\n- Installer and first public release\n",
  });
  dir(`${demoHome}/Documents/Notes`);
  put(`${demoHome}/Documents/Notes/Ideas.txt`, {
    text: "Island widgets, quick notes, focus timer.",
  });
  put(`${demoHome}/Downloads/Wallpapers.zip`, {
    size: 4096,
    zip: ["aurora.svg", "dusk.svg", "ocean.svg"],
  });
  put(`${demoHome}/Music/Lumius Aurora.wav`, {
    size: 529244,
    url: "/demo/Lumius-Aurora.wav",
  });
  for (const w of ["aurora", "dusk", "ocean"])
    put(`${demoHome}/Pictures/${w[0].toUpperCase() + w.slice(1)}.svg`, {
      size: 900,
      url: `/demo/${w}.svg`,
    });
}
seed();

function need(path: string) {
  const node = fs.get(path);
  if (!node) throw new Error(`“${nameOf(path)}” no longer exists.`);
  return node;
}
function checkName(name: string) {
  const n = name.trim();
  if (!n || n === "." || n === ".." || n.includes("/"))
    throw new Error("Use a name without slashes.");
  return n;
}
const children = (path: string) =>
  [...fs.values()].filter((n) => n.path !== "/" && parentOf(n.path) === path);
const subtree = (path: string) =>
  [...fs.values()].filter(
    (n) => n.path === path || n.path.startsWith(path + "/"),
  );
function freeName(folder: string, name: string) {
  if (!fs.has(`${folder}/${name}`)) return name;
  const dot = name.lastIndexOf(".");
  const [stem, ext] =
    dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let i = 2; ; i++) {
    const candidate = `${stem} ${i}${ext}`;
    if (!fs.has(`${folder}/${candidate}`)) return candidate;
  }
}
function relocate(from: string, to: string, keep: boolean) {
  const nodes = subtree(from);
  if (!keep) nodes.forEach((n) => fs.delete(n.path));
  for (const n of nodes) {
    const path = to + n.path.slice(from.length);
    fs.set(path, { ...n, path, name: nameOf(path), modified: stamp() });
  }
}

// Music: the bundled sample track plays through the browser.
let audio: HTMLAudioElement | null = null;
let track: DemoNode | null = null;
let volume = 70;
let brightness = 100;
function play(node: DemoNode) {
  if (!audio) {
    audio = new Audio();
    for (const event of ["play", "pause", "ended"])
      audio.addEventListener(event, () =>
        window.dispatchEvent(new Event("lumius-status")),
      );
  }
  if (track?.path !== node.path) {
    track = node;
    audio.src = node.url!;
  }
  audio.volume = volume / 100;
  return audio.play();
}
function firstTrack() {
  return [...fs.values()].find((n) => n.kind === "Audio" && n.url) || null;
}

const appLabels: Record<string, string> = {
  terminal: "Terminal",
  store: "Software",
  launcher: "App search",
  power: "Power options",
  lock: "Lock screen",
  network: "Wi-Fi settings",
  bluetooth: "Bluetooth settings",
  display: "Display settings",
  installer: "The installer",
};

// System intelligence: fixed sample telemetry marked `demo: true`. Nothing is
// measured from the visitor's computer, and no provider is ever called or keyed.
const demoSnapshot = (): IntelSnapshot => ({
  demo: true,
  taken_at: stamp(),
  mem_total_kb: 16264060,
  mem_available_kb: 9758436,
  mem_available_pct: 60,
  swap_total_kb: 2097148,
  swap_free_kb: 2097148,
  cpu_busy_pct: 14.2,
  cpu_cores: 8,
  psi_cpu_some_avg10: 1.2,
  psi_memory_some_avg10: 0,
  psi_io_some_avg10: 0.4,
  load_1: 0.84,
  load_5: 0.71,
  load_15: 0.65,
  uptime_secs: 7380,
  process_count: 287,
  disk_root_total_bytes: 256060514304,
  disk_root_available_bytes: 141733920768,
  disk_root_used_pct: 41.7,
  battery_pct: 76,
  battery_status: "discharging",
});
const demoPolicy = (): IntelPolicy => ({
  policy_id: "balanced",
  label: "Balanced",
  pressure: "low",
  reasons: [
    "Browser demo: sample telemetry, not measured from this computer.",
    "60.0% of memory available (9.3 of 15.5 GiB): low",
    "Memory stalls (PSI some avg10) at 0.00%: low",
    "CPU 14.2% busy: low",
    "CPU stalls (PSI some avg10) at 1.20%: low",
    "Battery at 76%, discharging",
    "Pressure is low with no battery constraint, so Balanced fits.",
  ],
});
const demoProviders: ProviderStatus[] = [
  {
    id: "cerebras",
    label: "Cerebras",
    model: "llama-3.3-70b",
    configured: false,
    state: "unconfigured",
  },
  {
    id: "openai",
    label: "OpenAI",
    model: "gpt-4.1-mini",
    configured: false,
    state: "unconfigured",
  },
  {
    id: "exa",
    label: "Exa",
    model: null,
    configured: false,
    state: "unconfigured",
  },
];

async function demo(
  command: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const s = (key: string) => String(args[key] ?? "");
  switch (command) {
    case "settings_get":
      return JSON.parse(
        localStorage.getItem("lumius-preview") || JSON.stringify(defaults),
      );
    case "settings_set":
      localStorage.setItem("lumius-preview", JSON.stringify(args.settings));
      return args.settings;
    case "home":
      return demoHome;
    case "mounts":
      return [];
    case "list": {
      const path = s("path") || demoHome;
      if (!need(path).directory) throw new Error("That is not a folder.");
      return { path, entries: children(path) } satisfies Listing;
    }
    case "mkdir": {
      const name = checkName(s("name"));
      const path = `${s("path")}/${name}`;
      if (fs.has(path))
        throw new Error(`An item named “${name}” already exists here.`);
      dir(path);
      fs.get(path)!.modified = stamp();
      return null;
    }
    case "rename": {
      const from = s("path");
      need(from);
      const name = checkName(s("name"));
      const to = `${parentOf(from)}/${name}`;
      if (to === from) return null;
      if (fs.has(to))
        throw new Error(`An item named “${name}” already exists here.`);
      relocate(from, to, false);
      return null;
    }
    case "transfer": {
      const source = s("source");
      const folder = s("destination");
      const node = need(source);
      const move = Boolean(args.move);
      if (folder === source || folder.startsWith(source + "/"))
        throw new Error("A folder can't be placed inside itself.");
      if (move && parentOf(source) === folder)
        throw new Error(`“${node.name}” is already in this folder.`);
      const job: Transfer = {
        id: crypto.randomUUID(),
        name: node.name,
        done: 0,
        total: 100,
        state: "running",
      };
      jobs.push(job);
      const timer = setInterval(() => {
        if (job.state !== "running") return clearInterval(timer);
        job.done = Math.min(100, job.done + 20);
        if (job.done < 100) return;
        clearInterval(timer);
        if (!fs.has(source)) {
          job.state = "error";
          job.error = `“${node.name}” no longer exists.`;
          return;
        }
        relocate(source, `${folder}/${freeName(folder, node.name)}`, !move);
        job.state = "done";
      }, 250);
      return job.id;
    }
    case "cancel": {
      const job = jobs.find((j) => j.id === s("id"));
      if (job?.state === "running") job.state = "cancelled";
      return null;
    }
    case "transfers":
      return jobs.slice(-10).map((j) => ({ ...j }));
    case "trash": {
      const path = s("path");
      const node = need(path);
      if (track && subtree(path).some((n) => n.path === track!.path)) {
        audio?.pause();
        track = null;
      }
      trash.push({
        id: crypto.randomUUID(),
        name: node.name,
        original: path,
        nodes: subtree(path),
      });
      subtree(path).forEach((n) => fs.delete(n.path));
      return null;
    }
    case "trash_list":
      return trash.map(({ id, name, original }) => ({ id, name, original }));
    case "restore": {
      const index = trash.findIndex((t) => t.id === s("id"));
      if (index < 0) throw new Error("That item is no longer in Trash.");
      const item = trash[index];
      if (fs.has(item.original))
        throw new Error(
          `Something named “${item.name}” is already in the original folder.`,
        );
      if (!fs.has(parentOf(item.original)))
        throw new Error("The original folder no longer exists.");
      item.nodes.forEach((n) => fs.set(n.path, n));
      trash.splice(index, 1);
      return null;
    }
    case "extract": {
      const node = need(s("path"));
      if (node.kind !== "Archive") throw new Error("Only ZIP files extract.");
      const folder = parentOf(node.path);
      const target = `${folder}/${freeName(folder, node.name.replace(/\.zip$/i, ""))}`;
      dir(target);
      for (const file of node.zip || [])
        put(`${target}/${file}`, { size: 900, url: `/demo/${file}` });
      return null;
    }
    case "preview": {
      const node = need(s("path"));
      if (node.kind === "Image") return { text: "", url: node.url };
      if (node.text != null) return { text: node.text, truncated: false };
      if (node.kind === "Audio")
        return {
          text: "Audio track. Open it to play — controls appear in the island.",
          truncated: false,
        };
      return { text: "No preview for this file type.", truncated: false };
    }
    case "open": {
      const node = need(s("path"));
      if (node.kind === "Audio" && node.url) {
        await play(node);
        return null;
      }
      throw new Error(`Use Preview to view “${node.name}” in the demo.`);
    }
    case "index":
      return { indexed: fs.size, skipped: 0 };
    case "search": {
      const q = s("query").toLowerCase();
      return {
        path: demoHome,
        entries: [...fs.values()].filter(
          (n) =>
            n.path.startsWith(demoHome + "/") &&
            n.name.toLowerCase().includes(q),
        ),
      } satisfies Listing;
    }
    case "status":
      return {
        live: false,
        volume,
        brightness,
        title: track ? track.name.replace(/\.[^.]+$/, "") : "Nothing playing",
        artist: track ? "Lumius sample" : "Press play to start a track",
        playing: Boolean(audio && !audio.paused),
        battery: null,
        platform: "Browser demo",
      } satisfies Status;
    case "control": {
      const value = Math.max(0, Math.min(100, Number(args.value ?? 0)));
      switch (s("action")) {
        case "play-pause": {
          const next = track || firstTrack();
          if (!next) throw new Error("Add a track to Music to play it.");
          if (audio && !audio.paused && track) audio.pause();
          else await play(next);
          return null;
        }
        case "next":
        case "previous": {
          const next = track || firstTrack();
          if (!next) throw new Error("Add a track to Music to play it.");
          if (audio) audio.currentTime = 0;
          await play(next);
          return null;
        }
        case "volume":
          volume = value;
          if (audio) audio.volume = value / 100;
          return null;
        case "brightness":
          brightness = Math.max(10, value);
          return null;
      }
      throw new Error("Unknown control.");
    }
    case "launch": {
      const id = s("id");
      if (id === "browser") {
        window.open("https://www.google.com", "_blank", "noopener");
        return null;
      }
      if (id === "music") {
        const next = track || firstTrack();
        if (next) await play(next);
        return null;
      }
      throw new Error(
        `${appLabels[id] || "This app"} runs in the installed Lumius OS. The browser demo can't open system apps.`,
      );
    }
    case "ask": {
      const query = s("query").trim();
      if (!query) throw new Error("Type a question first.");
      let res: Response;
      try {
        res = await fetch("/exa/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
      } catch {
        throw new Error("Can't reach Exa. Check the internet connection.");
      }
      if (res.status === 401 || res.status === 403)
        throw new Error(
          "Exa rejected the API key. Set EXA_API_KEY in .env.local and restart npm run dev.",
        );
      if (res.status === 429)
        throw new Error("Exa is busy right now. Try again in a moment.");
      if (!res.ok) throw new Error(`Exa request failed (HTTP ${res.status}).`);
      const data = await res.json();
      return {
        answer: data.answer || "",
        citations: (data.citations || [])
          .filter((c: { url?: string }) => c.url)
          .map(
            (c: { url: string; title?: string; publishedDate?: string }) => ({
              url: c.url,
              title: c.title || c.url,
              publishedDate: c.publishedDate ?? null,
            }),
          ),
      } satisfies Answer;
    }
    case "open_url": {
      const url = s("url");
      if (!/^https?:\/\//.test(url))
        throw new Error("Only web links can be opened");
      window.open(url, "_blank", "noopener");
      return null;
    }
    case "exa_key_status":
      return { configured: null };
    case "exa_key_set":
      throw new Error(
        "In the browser demo the key lives in .env.local on the dev server.",
      );
    case "intel_snapshot":
      return {
        snapshot: demoSnapshot(),
        policy: demoPolicy(),
      } satisfies IntelSnapshotResult;
    case "intel_status":
      return {
        providers: demoProviders.map((p) => ({ ...p })),
        demo: true,
      } satisfies IntelStatus;
    case "intel_key_set":
      throw new Error(
        "API keys are saved in Settings on the installed Lumius OS. The browser demo never stores keys.",
      );
    case "intel_advise":
      return {
        local: demoPolicy(),
        advice: null,
        accepted: false,
        state: "unconfigured",
        error:
          "Policy advice runs on the installed Lumius OS. Add a Cerebras API key in Settings there.",
      } satisfies IntelAdviseResult;
    case "intel_assist": {
      const query = s("query").trim();
      if (!query) throw new Error("Type a question first.");
      if ([...query].length > 2000)
        throw new Error("Questions can be up to 2000 characters.");
      return {
        answer: null,
        state: "unconfigured",
        error:
          "The assistant runs on the installed Lumius OS. Add an OpenAI API key in Settings there.",
      } satisfies IntelAssistResult;
    }
    case "window_region":
    case "island_expand":
      return null;
    default:
      throw new Error("This action runs in the installed Lumius OS.");
  }
}

export async function call<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (native) return invoke<T>("rpc", { command, args });
  try {
    return (await demo(command, args)) as T;
  } catch (e) {
    // Match native errors, which arrive as plain strings.
    throw e instanceof Error ? e.message : e;
  }
}
