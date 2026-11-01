import { useId } from "react";

// Lumius glass icons: a solid shape of light at the back, frosted glass in front.
// Ported from the "GlassIcon" artboard of the Lumius 1.0 design.

type Icon = {
  label: string;
  c1: string;
  c2: string;
  back: string;
  front: string;
  tint?: string;
  glyphFill?: string;
  glyphStroke?: string;
  text?: string;
  textY?: number;
  textSize?: number;
};

const FOLDER_BACK = "M14 26a10 10 0 0 1 10-10h16.5a6 6 0 0 1 4.2 1.8L50 23h22a10 10 0 0 1 10 10v16H14Z";
const FOLDER_FRONT = "M20 36h56a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H20a10 10 0 0 1-10-10V46a10 10 0 0 1 10-10Z";
const FOLDER = { back: FOLDER_BACK, front: FOLDER_FRONT, c1: "#7CC0FF", c2: "#2563FF" };

export const ICONS: Record<string, Icon> = {
  lumius: { label: "Lumius", c1: "#7FD8FF", c2: "#2F3BFF", tint: "#5A7BFF",
    back: "M35 8a15 15 0 0 1 15 15v48a15 15 0 0 1-30 0V23a15 15 0 0 1 15-15ZM72 12a12 12 0 1 1 0 24a12 12 0 1 1 0-24Z",
    front: "M35 56h38a15 15 0 0 1 0 30H35a15 15 0 0 1 0-30Z" },
  files: { label: "Files", ...FOLDER },
  settings: { label: "Settings", c1: "#A9B6CC", c2: "#4E5B76",
    back: "M64 12a22 22 0 1 1 0 44a22 22 0 1 1 0-44Z",
    front: "M28 30h28a16 16 0 0 1 16 16v24a16 16 0 0 1-16 16H28a16 16 0 0 1-16-16V46a16 16 0 0 1 16-16Z",
    glyphStroke: "M24 50h32M24 66h32",
    glyphFill: "M34 50m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M50 66m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0" },
  terminal: { label: "Terminal", c1: "#56607A", c2: "#10131C",
    back: "M40 12h34a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10H40a10 10 0 0 1-10-10V22a10 10 0 0 1 10-10Z",
    front: "M22 32h38a12 12 0 0 1 12 12v26a12 12 0 0 1-12 12H22a12 12 0 0 1-12-12V44a12 12 0 0 1 12-12Z",
    glyphStroke: "M24 48l9 8-9 8M40 66h14" },
  browser: { label: "Browser", c1: "#5EE7F5", c2: "#1F7BFF",
    back: "M60 12a26 26 0 1 1 0 52a26 26 0 1 1 0-52Z",
    front: "M40 32a26 26 0 1 1 0 52a26 26 0 1 1 0-52Z",
    glyphFill: "M51 47L44 62 29 69l7-15Z" },
  music: { label: "Music", c1: "#FF8FB8", c2: "#FF2D63",
    back: "M64 12a20 20 0 1 1 0 40a20 20 0 1 1 0-40Z",
    front: "M28 28h24a16 16 0 0 1 16 16v24a16 16 0 0 1-16 16H28a16 16 0 0 1-16-16V44a16 16 0 0 1 16-16Z",
    glyphStroke: "M34 70V46l16-4v24",
    glyphFill: "M34 70m-6 0a6 5 0 1 0 12 0a6 5 0 1 0-12 0M50 66m-6 0a6 5 0 1 0 12 0a6 5 0 1 0-12 0" },
  ask: { label: "Ask", c1: "#C9A6FF", c2: "#7B3FF2",
    back: "M62 12a22 22 0 1 1 0 44a22 22 0 1 1 0-44Z",
    front: "M26 34h32a14 14 0 0 1 14 14v12a14 14 0 0 1-14 14H34l-12 10v-11a14 14 0 0 1-10-13V48a14 14 0 0 1 14-14Z",
    glyphFill: "M42 42C43 50 46 53 54 54 46 55 43 58 42 66 41 58 38 55 30 54 38 53 41 50 42 42Z" },
  calendar: { label: "Calendar", c1: "#FF9A3C", c2: "#FF2D46", text: "31", textY: 76, textSize: 30,
    back: "M28 14h40a14 14 0 0 1 14 14v12H14V28a14 14 0 0 1 14-14Z",
    front: "M28 30h40a14 14 0 0 1 14 14v28a14 14 0 0 1-14 14H28a14 14 0 0 1-14-14V44a14 14 0 0 1 14-14Z",
    glyphStroke: "M34 9v12M62 9v12" },
  photos: { label: "Photos", c1: "#6FC3FF", c2: "#2F6BFF", tint: "#22C58B",
    back: "M26 12h44a12 12 0 0 1 12 12v32a12 12 0 0 1-12 12H26a12 12 0 0 1-12-12V24a12 12 0 0 1 12-12Z",
    front: "M18 84a6 6 0 0 1-4.6-9.8L32 52a6 6 0 0 1 9.2 0l7 8.4 6.6-7.9a6 6 0 0 1 9.2 0l18.6 21.7A6 6 0 0 1 78 84Z",
    glyphFill: "M36 30m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0" },
  mail: { label: "Mail", c1: "#FF7AA8", c2: "#F0245E",
    back: "M34 10h28a8 8 0 0 1 8 8v36H26V18a8 8 0 0 1 8-8Z",
    front: "M24 40h48a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H24a12 12 0 0 1-12-12V52a12 12 0 0 1 12-12Z",
    glyphStroke: "M36 21h24M36 29h14M21 50l27 17 27-17" },
  weather: { label: "Weather", c1: "#FFD54A", c2: "#FF8A00", tint: "#7FB2FF",
    back: "M62 14a20 20 0 1 1 0 40a20 20 0 1 1 0-40Z",
    front: "M30 82a17 17 0 0 1-3-33.7A23 23 0 0 1 71 44a19 19 0 0 1-1 38Z" },
  installer: { label: "Install Lumius", c1: "#6EA8FF", c2: "#1F4BFF",
    back: "M58 10a26 26 0 1 1 0 52a26 26 0 1 1 0-52Z",
    front: "M26 40h44a14 14 0 0 1 14 14v18a14 14 0 0 1-14 14H26a14 14 0 0 1-14-14V54a14 14 0 0 1 14-14Z",
    glyphStroke: "M48 49v20M40 62l8 8 8-8" },
  trash: { label: "Trash", c1: "#B7C2D6", c2: "#5E6B85",
    back: "M30 16h36a8 8 0 0 1 0 16H30a8 8 0 0 1 0-16Z",
    front: "M22 30h52l-4.5 46.5A10 10 0 0 1 59.6 85H36.4a10 10 0 0 1-9.9-8.5Z",
    glyphStroke: "M40 44v28M56 44v28" },
  notes: { label: "Notes", c1: "#FFE066", c2: "#FFA000",
    back: "M44 12h28a12 12 0 0 1 12 12v32a12 12 0 0 1-12 12H44a12 12 0 0 1-12-12V24a12 12 0 0 1 12-12Z",
    front: "M24 28h32a12 12 0 0 1 12 12v34a12 12 0 0 1-12 12H24a12 12 0 0 1-12-12V40a12 12 0 0 1 12-12Z",
    glyphStroke: "M24 46h28M24 57h28M24 68h18" },
  calculator: { label: "Calculator", c1: "#8FA2FF", c2: "#3B4CF0",
    back: "M58 22h14a14 14 0 0 1 14 14v24a14 14 0 0 1-14 14H58a14 14 0 0 1-14-14V36a14 14 0 0 1 14-14Z",
    front: "M26 18h28a16 16 0 0 1 16 16v28a16 16 0 0 1-16 16H26a16 16 0 0 1-16-16V34a16 16 0 0 1 16-16Z",
    glyphStroke: "M24 31l8 8M32 31l-8 8M52 29v12M46 35h12M24 61h8M46 57h12M46 65h12" },
  clock: { label: "Clock", c1: "#7EF0C2", c2: "#12B886",
    back: "M68 10a16 16 0 1 1 0 32a16 16 0 1 1 0-32Z",
    front: "M44 22a32 32 0 1 1 0 64a32 32 0 1 1 0-64Z",
    glyphStroke: "M44 38v16l11 7" },
  software: { label: "Software", c1: "#66D9FF", c2: "#0EA5E9",
    back: "M50 10h22a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H50a12 12 0 0 1-12-12V22a12 12 0 0 1 12-12Z",
    front: "M20 36h48a4 4 0 0 1 4 4.3l-3 38A8 8 0 0 1 61 86H27a8 8 0 0 1-8-7.7l-3-38A4 4 0 0 1 20 36Z",
    glyphStroke: "M33 48v-8a11 11 0 0 1 22 0v8" },
  videos: { label: "Videos", c1: "#FF8A65", c2: "#F43F3F",
    back: "M62 28h12a12 12 0 0 1 12 12v16a12 12 0 0 1-12 12H62a12 12 0 0 1-12-12V40a12 12 0 0 1 12-12Z",
    front: "M24 24h32a14 14 0 0 1 14 14v22a14 14 0 0 1-14 14H24a14 14 0 0 1-14-14V38a14 14 0 0 1 14-14Z",
    glyphFill: "M33 39l17 10-17 10Z" },
  apps: { label: "Apps", c1: "#9CA9FF", c2: "#5865F2",
    back: "M50 10h22a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H50a12 12 0 0 1-12-12V22a12 12 0 0 1 12-12Z",
    front: "M28 30h28a16 16 0 0 1 16 16v24a16 16 0 0 1-16 16H28a16 16 0 0 1-16-16V46a16 16 0 0 1 16-16Z",
    glyphFill: "M32 50m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M52 50m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M32 66m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M52 66m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0" },
  "folder-home": { label: "Home", ...FOLDER, glyphStroke: "M37 60l11-9 11 9M40.5 58v12h15V58" },
  "folder-desktop": { label: "Desktop", ...FOLDER, glyphStroke: "M36 50h24v14H36ZM43 70h10" },
  "folder-documents": { label: "Documents", ...FOLDER, glyphStroke: "M37 52h22M37 60h22M37 68h13" },
  "folder-downloads": { label: "Downloads", ...FOLDER, glyphStroke: "M48 49v19M40 61l8 8 8-8" },
  "folder-music": { label: "Music", ...FOLDER, glyphStroke: "M44 69V51l12-3v17",
    glyphFill: "M44 69m-5 0a5 4.5 0 1 0 10 0a5 4.5 0 1 0-10 0M56 65m-5 0a5 4.5 0 1 0 10 0a5 4.5 0 1 0-10 0" },
  "folder-pictures": { label: "Pictures", ...FOLDER, glyphStroke: "M35 70l8-9 6 6 4-4 7 7",
    glyphFill: "M58 52m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0" },
  "folder-videos": { label: "Videos", ...FOLDER, glyphFill: "M43 50l15 9-15 9Z" },
  folder: { label: "Folder", ...FOLDER },
};

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function GlassIcon({ app, size = 48, finish = "spectrum", className }: {
  app: string;
  size?: number;
  finish?: "spectrum" | "lumen";
  className?: string;
}) {
  const key = useId().replace(/:/g, "");
  const ic = ICONS[app] ?? ICONS.files;
  const lumen = finish === "lumen";
  const c1 = lumen ? "#4F7BFF" : ic.c1;
  const c2 = lumen ? "#0B3BF5" : ic.c2;
  const tint = lumen ? "#9DB4FF" : (ic.tint ?? c2);
  const glow = size < 28 ? "none" : `drop-shadow(0 ${Math.round(size * 0.09)}px ${Math.round(size * 0.13)}px ${rgba(c2, lumen ? 0.22 : 0.26)})`;
  const [g, h, c, f, s] = ["g", "h", "c", "f", "s"].map((p) => `${p}-${key}`);
  return (
    <svg className={className} viewBox="0 0 96 96" width={size} height={size} aria-hidden="true" style={{ overflow: "visible", filter: glow, flex: "none" }}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
        <linearGradient id={h} x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.95" /><stop offset="0.45" stopColor="#fff" stopOpacity="0.12" /><stop offset="1" stopColor="#fff" stopOpacity="0.55" /></linearGradient>
        <clipPath id={c}><path d={ic.front} /></clipPath>
        <filter id={f} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7" /></filter>
        <filter id={s} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor={c2} floodOpacity="0.5" /></filter>
      </defs>
      <path d={ic.back} fill={`url(#${g})`} />
      <g clipPath={`url(#${c})`}><path d={ic.back} fill={`url(#${g})`} filter={`url(#${f})`} /></g>
      <path d={ic.front} fill={tint} fillOpacity={lumen ? 0.62 : 0.2} />
      <path d={ic.front} fill="#fff" fillOpacity={lumen ? 0.18 : 0.4} />
      <path d={ic.front} fill="none" stroke={`url(#${h})`} strokeWidth="1.3" />
      <g filter={`url(#${s})`}>
        {ic.glyphFill && <path d={ic.glyphFill} fill="#fff" />}
        {ic.glyphStroke && <path d={ic.glyphStroke} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
        {ic.text && <text x="48" y={ic.textY} textAnchor="middle" fontFamily="Space Grotesk, DM Sans, sans-serif" fontWeight="800" fontSize={ic.textSize} fill={lumen ? "#fff" : c2}>{ic.text}</text>}
      </g>
    </svg>
  );
}
