// Hold pets: one pixel pet per position. The species and colours come from the token address, the
// stage from the position's hold-time tier, so every pet on screen is a reading of on-chain data.

export type Stage = "egg" | "rookie" | "pro" | "legend";
export const SPECIES = ["slime", "cat", "chick", "frog"] as const;
export type Species = (typeof SPECIES)[number];

// k outline · b body · d shade · l light · w white · e eye · p blush · a/A lime accent · y beak and feet.
// Rows of one width; the renderer centres them in 16 columns and stands them on the bottom row.
const EGG = [
  "...kkkk...",
  "..kllllk..",
  ".kllllllk.",
  ".kllbbldk.",
  "kllbbbbldk",
  "klllbblldk",
  "kllllllldk",
  "kbbllllldk",
  "kbbllllbdk",
  "kllllbbddk",
  ".kllllddk.",
  "..kddddk..",
  "...kkkk...",
];

const SPRITES: Record<Species, Record<Exclude<Stage, "egg">, string[]>> = {
  slime: {
    rookie: [
      "...kkkk...",
      ".kkbbbbkk.",
      "kbllbbbbbk",
      "kblebbebbk",
      "kbbebbebdk",
      "kdpbbbbpdk",
      ".kkkkkkkk.",
    ],
    pro: [
      "....kk..kk....",
      "...kaakkaak...",
      "......kk......",
      "....kkkkkk....",
      "..kkbbbbbbkk..",
      ".kbllbbbbbbbk.",
      ".kbllbbbbbbbk.",
      "kbbbwebbwebbbk",
      "kbbbeebbeebbbk",
      "kbpbbbkkbbbpbk",
      "kdbbbbbbbbbbdk",
      ".kddddddddddk.",
      "..kkkkkkkkkk..",
    ],
    legend: [
      "....a..aa..a....",
      "....aa.aa.aa....",
      "....aaaaaaaa....",
      "...kAAAAAAAAk...",
      "..kbbbbbbbbbbk..",
      ".kbllbbbbbbbbbk.",
      "kbllbbbbbbbbbbbk",
      "kblbwebbbbwebbbk",
      "kbbbeebbbbeebbbk",
      "kbppbbbkkbbbppbk",
      "kdbbbbbbbbbbbbdk",
      "kdbbbbbbbbbbbbdk",
      ".kddbbbbbbbbddk.",
      "..kddddddddddk..",
      "...kkkkkkkkkk...",
    ],
  },
  cat: {
    rookie: [
      ".k........k.",
      ".kk......kk.",
      ".kpk....kpk.",
      ".kbbkkkkbbk.",
      "kbbbbbbbbbbk",
      "kbwebbbbwebk",
      "kbeebbbbeebk",
      "kpbbbkkbbbpk",
      ".kbbbbbbbbk.",
      "..kkkkkkkk..",
    ],
    pro: [
      "..k........k..",
      "..kk......kk..",
      "..kpk....kpk..",
      "..kbbkkkkbbk..",
      ".kbbbbbbbbbbk.",
      ".kbwebbbbwebk.",
      ".kbeebbbbeebk.",
      ".kpbbbkkbbbpk.",
      "..kbbbbbbbbk..",
      ".kbbkbbbbkbbk.",
      "kbbbkllllkbbbk",
      "kbbbkllllkbbbk",
      ".kbbwwkkwwbbk.",
      "..kkkkkkkkkk..",
    ],
    legend: [
      "...k........k...",
      "...kk......kk...",
      "...kpk....kpk...",
      "..kbbbkkkkbbbk..",
      ".kbbbbbaabbbbbk.",
      ".kbbbbbbbbbbbbk.",
      "kkbbwebbbbwebbkk",
      ".kbbeebbbbeebbk.",
      "kkpbbbbkkbbbbpkk",
      "..kbbbbbbbbbbk..",
      "..kaaaaaaaaaak..",
      ".kbbkbbAAbbkbbk.",
      "kbbbkllAAllkbbbk",
      "kbbbkllllllkbbbk",
      ".kbbbwwkkwwbbbk.",
      "..kkkkkkkkkkkk..",
    ],
  },
  chick: {
    rookie: [
      "....kk....",
      "...kkkk...",
      "..kbbbbk..",
      ".kbbbbbbk.",
      ".kbebbebk.",
      "kbbbyybbbk",
      "kdbbbbbbdk",
      ".kdbbbbdk.",
      "..kykkyk..",
    ],
    pro: [
      "......kk......",
      ".....kbbk.....",
      "....kkbbkk....",
      "...kbbbbbbk...",
      "..kbbbbbbbbk..",
      "..kbwebbwebk..",
      ".kkbeebbeebkk.",
      "kdkbbbyybbbkdk",
      "kddkbbbbbbkddk",
      ".kdkllllllkdk.",
      "..kkbllllbkk..",
      "....kykkyk....",
    ],
    legend: [
      "......a..a......",
      ".......aa.......",
      "......kkkk......",
      ".....kbbbbk.....",
      "....kbbbbbbk....",
      "...kbwebbwebk...",
      "...kbeebbeebk...",
      "kk.kbbbyybbbk.kk",
      "kaakkbbbbbbkkaak",
      "kdaakbllllbkaadk",
      ".kddkbllllbkddk.",
      "..kdkbllllbkdk..",
      "...kkbbbbbbkk...",
      "....kdbbbbdk....",
      ".....kykkyk.....",
    ],
  },
  frog: {
    rookie: [
      ".kk....kk.",
      "kwek..kwek",
      "kbbbkkbbbk",
      "kbbbbbbbbk",
      "kpbkkkkbpk",
      "kdbbbbbbdk",
      ".kkkkkkkk.",
    ],
    pro: [
      "..kk......kk..",
      ".kwek....kwek.",
      ".kbbbkkkkbbbk.",
      "kbbbbbbbbbbbbk",
      "kbbbbbbbbbbbbk",
      "kpbkbbbbbbkbpk",
      "kdbbkkkkkkbbdk",
      ".kdbbllllbbdk.",
      "kbkbllllllbkbk",
      "kbbkllllllkbbk",
      ".kbbkbbbbkbbk.",
      "..kkk.kk.kkk..",
    ],
    legend: [
      "...kk......kk...",
      "..kbbk....kbbk..",
      ".kbbbbkkkkbbbbk.",
      "kkkkkkkkkkkkkkkk",
      "kkwakkkbbkkwakkk",
      "kbkkkkbbbbkkkkbk",
      "kbbbbbbbbbbbbbbk",
      "kpbkbbbbbbbbkbpk",
      "kdbbkkkkkkkkbbdk",
      ".kdbaaaaaaaabdk.",
      "kbkbbbaAAabbbkbk",
      "kbbkbllAAllbkbbk",
      "kbbkblllllllkbbk",
      ".kbbkbbbbbbkbbk.",
      "..kkk.kkkk.kkk..",
    ],
  },
};

/** Colour sets a pet can hatch in: body, shade, light. */
const PALETTES: [string, string, string][] = [
  ["#7ee0b5", "#3fa57f", "#c8f7e2"],
  ["#ff9fcf", "#d9619c", "#ffd6eb"],
  ["#8cc8ff", "#4f8fd6", "#d3ebff"],
  ["#ffb36b", "#d9792f", "#ffe0bd"],
  ["#b79cff", "#7a5bd6", "#e1d6ff"],
  ["#ffe36b", "#c9a92a", "#fff4bf"],
  ["#ff8a80", "#d14f47", "#ffd0cb"],
  ["#c9d1d9", "#8a96a3", "#eef2f6"],
];

const FIXED: Record<string, string> = { k: "#0e0f0c", e: "#0e0f0c", w: "#ffffff", p: "#ff6f9f", a: "#cbfd00", A: "#7fa300", y: "#ffaa1d" };

const hash = (s: string) => [...s.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11);

/** The same token always hatches the same pet, for every wallet. */
export function petOf(token: string): { species: Species; colors: Record<string, string> } {
  const h = hash(token);
  const [b, d, l] = PALETTES[(h >>> 3) % PALETTES.length]!;
  return { species: SPECIES[h % SPECIES.length]!, colors: { ...FIXED, b, d, l } };
}

export const STAGE_NAME: Record<Stage, string> = { egg: "Egg", rookie: "Hatchling", pro: "Grown", legend: "Final form" };

export function spriteOf(species: Species, stage: Stage): string[] {
  return stage === "egg" ? EGG : SPRITES[species][stage];
}

export type Px = { x: number; y: number; w: number; c: string; eye: boolean };

/** A sprite as horizontal runs of one colour on a 16×16 grid, bottom-aligned and centred. */
export function pixels(rows: string[], colors: Record<string, string>): Px[] {
  const width = rows[0]!.length;
  const left = Math.floor((16 - width) / 2);
  const top = 16 - rows.length;
  const out: Px[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x]!;
      let run = 1;
      while (row[x + run] === ch) run++;
      if (ch !== ".") out.push({ x: left + x, y: top + y, w: run, c: colors[ch] ?? "#f0f", eye: ch === "e" });
      x += run;
    }
  });
  return out;
}

export const ALL_SPRITES = [EGG, ...SPECIES.flatMap((s) => Object.values(SPRITES[s]))];
