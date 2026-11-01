// Adapted from kua8/Nectar src/App.tsx, GPL-3.0-only.
// Copyright Nectar contributors and original Bloom contributors.
// Linux integration and Lumius component layout are implemented separately.
export const islandTransition = {
  width: { type: "spring" as const, stiffness: 400, damping: 31 },
  height: { type: "spring" as const, stiffness: 450, damping: 29 },
  default: { type: "spring" as const, stiffness: 500, damping: 30, mass: 1 },
};
