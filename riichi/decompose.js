/**
 * decompose.js — find ALL valid decompositions of a winning hand.
 *
 * A decomposition covers the closed part of the hand only; melded sets are
 * attached later by the caller. Three shapes are searched:
 *   - standard: 4 sets + 1 pair (sets already formed are passed via `melds`)
 *   - chiitoitsu: 7 distinct pairs (closed hands only)
 *   - kokushi: 13 distinct terminals/honors + 1 pair
 *
 * Each decomposition records which group holds the winning tile, so the
 * caller can derive wait types (tanki / kanchan / penchan / ryanmen /
 * shanpon) and closed/open triplet fu later.
 */

import { isHonor, isTerminalOrHonor, codeOf } from "./tiles.js";

/** @typedef {{kind:"run"|"triplet", tiles:number[]}} HandGroup */
/** @typedef {{pair:number|null, groups:HandGroup[]}} StandardDecomp */
/** @typedef {{type:"angen waiting?"}} */

/**
 * Recursively discover every way to split `counts` (the closed tiles) into
 * a fixed pair plus remaining triplets/runs, given melds already on the
 * table. Returns unique decompositions; each group is annotated with
 * `containsWin` (number of copies of the winning tile included) later by
 * the caller, keeping this function generic.
 *
 * @param {number[]} counts      remaining closed tiles (mutated internally via copies)
 * @param {number} meldCountXF3  total tiles the closed part must hold
 * @param {number|null} chosenPair index of the locked-in pair, or null when not chosen yet
 * @param {HandGroup[]} acc      groups collected so far
 * @param {number} groupsNeeded  how many groups still to form here (3 for standard when pair chosen)
 * @returns {StandardDecomp[]}
 */
function findStandardRecursive(counts, chosenPair, acc, groupsNeeded) {
  if (groupsNeeded === 0) {
    return [{ pair: chosenPair, groups: acc.slice() }];
  }
  const results = [];
  // lowest tile index with count>0 — branch on the set that covers it
  let start = 0;
  while (start < 34 && counts[start] === 0) start++;
  if (start === 34) return results;

  // Option A: triplet at `start`
  if (counts[start] >= 3) {
    counts[start] -= 3;
    const rest = findStandardRecursive(counts, chosenPair, acc.concat([{ kind: "triplet", tiles: [start, start, start] }]), groupsNeeded - 1);
    counts[start] += 3;
    results.push(...rest);
  }
  // Option B: run starting at `start` (must lie inside its suit)
  const suitMax = start < 9 ? 8 : start < 27 && start >= 9 ? 26 : 33;
  const inSuit = start < 9 ? start + 2 <= 8 : start < 18 ? start + 2 <= 17 : start + 2 <= 26;
  if (!isHonor(start) && inSuit && counts[start + 1] > 0 && counts[start + 2] > 0) {
    counts[start] -= 1; counts[start + 1] -= 1; counts[start + 2] -= 1;
    const rest = findStandardRecursive(counts, chosenPair, acc.concat([{ kind: "run", tiles: [start, start + 1, start + 2] }]), groupsNeeded - 1);
    counts[start] += 1; counts[start + 1] += 1; counts[start + 2] += 1;
    results.push(...rest);
  }
  return results;
}

/**
 * Full standard search: pick every possible pair, then split the remaining
 * tiles into the required number of sets (4 - number of melds).
 * @param {number[]} counts closed-part counts (includes the win tile)
 * @param {number} meldCount number of melded sets (0..4)
 * @returns {StandardDecomp[]}
 */
export function findStandardDecompositions(counts, meldCount) {
  const setsNeeded = 4 - meldCount;
  const results = [];
  for (let p = 0; p < 34; p++) {
    if (counts[p] < 2) continue;
    counts[p] -= 2;
    if (pairsTotal(counts) === setsNeeded * 3) {
      const found = findStandardRecursive(counts, p, [], setsNeeded);
      results.push(...found);
    }
    counts[p] += 2;
  }
  return dedupe(results);
}

function pairsTotal(counts) {
  return counts.reduce((a, b) => a + b, 0);
}

/** Canonical string key so identical decompositions collapse to one. */
function decompKey(d) {
  const groups = d.groups
    .map((g) => (g.kind === "run" ? `R${g.tiles.join(",")}` : `T${g.tiles[0]}`))
    .sort();
  return `P${d.pair === null ? "-" : d.pair}|${groups.join(";")}`;
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const d of list) {
    const k = decompKey(d);
    if (!seen.has(k)) { seen.add(k); out.push(d); }
  }
  return out;
}

/**
 * Chiitoitsu: exactly seven distinct pairs among closed tiles (no melds).
 * @param {number[]} counts
 * @returns {{pairs:number[]}[]}
 */
export function findChiitoitsu(counts) {
  const pairs = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 2) pairs.push(i);
    else if (counts[i] !== 0) return []; // any odd/other count breaks the shape
  }
  return pairs.length === 7 ? [{ pairs }] : [];
}

/**
 * Kokushi: all 13 yaochu types once, plus one extra (the pair).
 * Returns [] when the counts do not form kokushi.
 * @param {number[]} counts
 * @returns {{doubleIndex:number}[]} doubleIndex = index held twice
 */
export function findKokushi(counts) {
  const yao = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let pairIdx = -1;
  for (let i = 0; i < 34; i++) {
    if (isTerminalOrHonor(i) ? counts[i] === 1 || counts[i] === 2 : counts[i] === 0) {
      if (counts[i] === 2) {
        if (pairIdx !== -1) return [];
        pairIdx = i;
      }
    } else return [];
  }
  return pairIdx === -1 ? [] : [{ doubleIndex: pairIdx }];
}

/**
 * Wait type for the winning tile inside a run group.
 * @param {HandGroup} run
 * @param {number} winIndex index of the winning tile
 * @returns {"ryanmen"|"kanchan"|"penchan"}
 */
export function runWaitType(run, winIndex) {
  const [a, , c] = run.tiles;
  if (winIndex === a + 1) return "kanchan";
  // win is an end tile; check how many completions the held shape allows
  if (winIndex === a) {
    // held: a+1..c = a+1, a+2 → also completable by a+3 unless a+2 is suit end
    return a + 2 === suitEnd(a) ? "penchan" : "ryanmen";
  }
  // held: a, a+1 → also completable by a-1 unless a is suit start
  return a === suitStart(a) ? "penchan" : "ryanmen";
}

function suitStart(i) {
  return i < 9 ? 0 : i < 18 ? 9 : 18;
}
function suitEnd(i) {
  return i < 9 ? 8 : i < 18 ? 17 : 26;
}

export { pairsTotal };
export { findStandardRecursive };
