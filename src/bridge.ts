import { invoke } from "@tauri-apps/api/core";
import type {
  Entry,
  Listing,
  Settings,
  Status,
  TrashItem,
  Transfer,
} from "./types";
export const native = "__TAURI_INTERNALS__" in window;
export const defaults: Settings = {
  glass: 65,
  reducedMotion: false,
  reducedTransparency: false,
  wallpaper: "aurora",
  pinned: ["files", "browser", "music", "terminal", "settings"],
};
// Browser mode is an explicitly labelled design preview. It never impersonates a native filesystem.
const previewNames = [
  "Desktop",
  "Documents",
  "Downloads",
  "Music",
  "Pictures",
  "Videos",
];
const previewFiles: Entry[] = previewNames.map((name) => ({
  name,
  path: "/preview/" + name,
  directory: true,
  size: 0,
  modified: 0,
  kind: "Folder",
}));
export async function call<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (native) return invoke<T>("rpc", { command, args });
  switch (command) {
    case "settings_get":
      return JSON.parse(
        localStorage.getItem("lumius-preview") || JSON.stringify(defaults),
      );
    case "settings_set":
      localStorage.setItem("lumius-preview", JSON.stringify(args.settings));
      return args.settings as T;
    case "home":
      return "/preview" as T;
    case "list":
      return {
        path: args.path || "/preview",
        entries: args.path === "/preview" || !args.path ? previewFiles : [],
        warning: "Design preview · launch the native app to access real files.",
      } as T;
    case "status":
      return {
        volume: null,
        brightness: null,
        title: "No player connected",
        artist: "Native session required",
        playing: false,
        battery: null,
        platform: "Browser design preview",
      } as T;
    case "trash_list":
      return [] as TrashItem[] as T;
    case "transfers":
      return [] as Transfer[] as T;
    case "mounts":
      return [] as Entry[] as T;
    default:
      throw new Error(
        "This action requires the native Lumius session. Browser preview does not modify your computer.",
      );
  }
}
