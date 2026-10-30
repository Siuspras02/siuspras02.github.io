/**
 * tiles.js — tile notation parsing, validation and helpers.
 *
 * Tile notation:
 *   Number suits: "1m".."9m", "1p".."9p", "1s".."9s"
 *   Red fives:    "0m", "0p", "0s"  (count as a five; worth 1 aka-dora each)
 *   Honors:       "1z" East, "2z" South, "3z" West, "4z" North,
 *                 "5z" White (Haku), "6z" Green (Hatsu), "7z" Red (Chun)
 *
 * Internal representation: an index 0..33
 *   0-8 man, 9-17 pin, 18-26 sou, 27-33 honors.
 * Red fives are tracked in a parallel `red` array indexed the same way
 * (red fives are always five of a suit → indices 4, 13, 22).
 */

/** Suit letter of an index; honors are "z". @param {number} i @returns {"m"|"p"|"s"|"z"} */
export function suitOf(i) {
  return i < 9 ? "m" : i < 18 ? "p" : i < 27 ? "s" : "z";
}

/** True for honor indices (27-33). @param {number} i @returns {boolean} */
export function isHonor(i) {
  return i >= 27;
}

/** True for 1s/9s of a suit or any honor (yaochu tile). @param {number} i @returns {boolean} */
export function isTerminalOrHonor(i) {
  return isHonor(i) || (i % 9 === 0 || i % 9 === 8);
}

/** True for 1s/9s of a suit only. @param {number} i @returns {boolean} */
export function isTerminal(i) {
  return !isHonor(i) && (i % 9 === 0 || i % 9 === 8);
}

/** True for simple (2-8) numbered tiles. @param {number} i @returns {boolean} */
export function isSimple(i) {
  return !isTerminalOrHonor(i);
}

/** All 13 terminal/honor indices, ascending. @returns {number[]} */
export function yaochuIndices() {
  return [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
}

/** Dragon indices: 5z White, 6z Green, 7z Red. @returns {number[]} */
export function dragonIndices() {
  return [31, 32, 33];
}

/** Wind indices: 1z East, 2z South, 3z West, 4z North. @returns {number[]} */
export function windIndices() {
  return [27, 28, 29, 30];
}

/** Parse "6z" / "0p" to {index, isRed, code}. Throws on bad notation. */
export function parseTile(code) {
  if (typeof code !== "string") throw new Error(`Invalid tile: ${JSON.stringify(code)}`);
  const m = /^([0-9])([mpsz])$/.exec(code.trim());
  if (!m) throw new Error(`Invalid tile notation: "${code}"`);
  const num = Number(m[1]);
  const suit = m[2];
  if (suit === "z") {
    if (num < 1 || num > 7) throw new Error(`Invalid honor scale: "${code}"`);
    return { index: 27 + num - 1, isRed: false, code };
  }
  if (num === 0) return { index: { m: 4, p: 13, s: 22 }[suit], isRed: true, code };
  return { index: (num - 1) + { m: 0, p: 9, s: 18 }[suit], isRed: false, code };
}

/** Canonical display code for an index (red five shown with its own code). */
export function codeOf(index, isRed = false) {
  if (isRed) return `0${suitOf(index)}`;
  if (isHonor(index)) return `${index - 26}z`;
  const suit = suitOf(index);
  const n = (index % 9) + 1;
  return `${n}${suit}`;
}

/** Dora tile revealed by an indicator (successor rule). Red indicator acts as its five. */
export function doraFromIndicator(indicatorCode) {
  let { index, isRed } = parseTile(indicatorCode);
  if (isRed) { /* red five indicator behaves as an ordinary five */ }
  if (isHonor(index)) {
    // winds 1z→2z→3z→4z→1z, dragons 5z→6z→7z→5z
    if (index >= 27 && index <= 30) return (28 + (index - 27 + 1) % 4) - 1;
    return 30 + (index - 30 + 1 - 1) % 3 + 1; // 31→32→33→31
  }
  return (index % 9 === 8) ? index - 8 : index + 1;
}

/**
 * Mutable-able per-tile tallies built from tile codes.
 * @returns {{counts:number[], red:number[], total:number}}
 */
export function buildCounts(codes) {
  const counts = new Array(34).fill(0);
  const red = new Array(34).fill(0);
  for (const c of codes) {
    const { index, isRed } = parseTile(c);
    counts[index] += 1;
    if (isRed) red[index] += 1;
  }
  return { counts, red, total: codes.length };
}

/** Sum of two tally objects (does not mutate inputs). */
export function mergeCounts(a, b) {
  const counts = a.counts.map((v, i) => v + b.counts[i]);
  const red = a.red.map((v, i) => v + b.red[i]);
  return { counts, red, total: a.total + b.total };
}

/** Validate: every tile index used at most maxPer times (default 4, red fives included). */
export function assertMaxPerTile(counts, maxPer = 4, label = "hand") {
  for (let i = 0; i < 34; i++) {
    if (counts[i] > maxPer) {
      throw new Error(
        `${label} has ${counts[i]} copies of "${codeOf(i)}" (max ${maxPer} of any tile).`
      );
    }
  }
}

/** All red fives held (index ≥ 0 means a red five of that index). */
export function countRedFives(red) {
  return red.reduce((a, b) => a + b, 0);
}
