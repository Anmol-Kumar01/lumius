export type Entry = {
  name: string;
  path: string;
  directory: boolean;
  size: number;
  modified: number;
  kind: string;
};
export type Listing = { path: string; entries: Entry[]; warning?: string };
export type Settings = {
  glass: number;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  wallpaper: string;
  pinned: string[];
};
export type Status = {
  live?: boolean;
  volume: number | null;
  brightness: number | null;
  title: string;
  artist: string;
  playing: boolean;
  battery: number | null;
  platform: string;
};
export type Transfer = {
  id: string;
  done: number;
  total: number;
  name: string;
  state: string;
  error?: string;
};
export type TrashItem = { id: string; name: string; original: string };
