/**
 * yaku.js — yaku detection.
 *
 * All functions are pure. Yakuman detectors return null / yakuman entries;
 * `detectSitHanYaku` returns the 1–6 han list for a standard decomposition.
 *
 * A "candidate context" (built by score.js) looks like:
 * {
 *   counts,            // combined counts, closed part + melds
 *   decomp,            // {pair:number|null, groups:[{kind,tiles,origin,claimedByWin}]} | null
 *   shape,             // "standard" | "chiitoitsu" | "kokushi"
 *   melds, isOpenMeld, // resolved melds; isOpenMeld = any open chii/pon/kan
 *   kanCount,          // number of kans
 *   winIndex, winType, // indices / "ron"|"tsumo"
 *   waitType,          // "tanki"|"kanchan"|"penchan"|"ryanmen"|"shanpon"|"pair"
 *   isMenzen, riichi, doubleRiichi, ippatsu,
 *   lastTile, afterKan, robbingKan,
 *   roundWindIndex, seatWindIndex,
 *   config
 * }
 */
import {
  isHonor, isTerminal, isTerminalOrHonor, suitOf, isSimple,
  dragonIndices, windIndices,
} from "./tiles.js";

const WIND_NAMES = ["East", "South", "West", "North"];
const DRAGON_NAMES = ["White Dragon", "Green Dragon", "Red Dragon"];

/* ------------------------------------------------------------------ *
 * Yakuman detectors
 * ------------------------------------------------------------------ */

/** Kokushi: 13 yaochu types + one pair (only true for kokushi hands). */
export function detectKokushi(counts, winIndex) {
  const yao = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let pairIdx = -1;
  for (let i = 0; i < 34; i++) {
    if (isTerminalOrHonor(i)) {
      if (counts[i] === 0 || counts[i] > 2) return null;
      if (counts[i] === 2) {
        if (pairIdx !== -1) return null;
        pairIdx = i;
      }
    } else if (counts[i] !== 0) return null;
  }
  if (pairIdx === -1) return null;
  // 13-way wait: the winning tile completed the pair (held 13 singles before).
  return { isDoubleWait: winIndex === pairIdx };
}

/** Suuankou: four *closed* triplets (closed kans count). */
export function detectSuuankou(ctx, tripletGroups, config) {
  const closed = tripletGroups.filter(
    (g) => !g.isOpen && !g.claimedByWin
  );
  if (closed.length >= 4) {
    // tanki wait (win completes the pair) → hand's triplets are still closed
    return [{ name: "Suuankou", han: 1, isYakuman: true }];
  }
  return null;
}

/** Daisangen: three dragon triplets. */
export function detectDaisangen(tripletMap) {
  return dragonIndices().every((i) => tripletMap[i]);
}

/** Shousuushii (small) / Daisuushii (big): three wind triplets + wind pair / all four. */
export function detectSuushi(tripletMap, pairIndex) {
  const winds = windIndices();
  const trips = winds.filter((i) => tripletMap[i]);
  if (trips.length === 4) return { type: "Daisuushii" };
  if (
    trips.length === 3 && pairIndex !== null && winds.includes(pairIndex) &&
    !tripletMap[pairIndex]
  ) {
    // pair must be the missing (4th) wind
    return { type: "Shousuushii" };
  }
  return null;
}

/** Tsuuiisou: all honor tiles. */
export function detectTsuuiisou(counts) {
  for (let i = 0; i < 27; i++) if (counts[i] !== 0) return false;
  return true;
}

/** Chinroutou: all terminals. */
export function detectChinroutou(counts) {
  for (let i = 0; i < 34; i++) {
    if (counts[i] !== 0 && !isTerminal(i)) return false;
  }
  return true;
}

/** Ryuuiisou: all green tiles (2,3,4,6,8 sou + green dragon). */
export function detectRyuuiisou(counts) {
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) continue;
    if (![19, 20, 21, 23, 25, 32].includes(i)) return false;
  }
  return true;
}

/**
 * Chuuren poutou: one suit, closed; shape = 1112345678999 + one extra.
 * `{pure:true}` = the win was on the exact 13-tile nine-gates hand.
 */
export function detectChuuren(counts, winIndex) {
  const suit = suitOf(winIndex);
  if (suit === "z") return null;
  const base9 = suit === "m" ? 0 : suit === "p" ? 9 : 18;
  for (let i = 0; i < 34; i++) {
    if (i < base9 || i >= base9 + 9) return null;
  }
  const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  const have = counts.slice(base9, base9 + 9);
  const w = winIndex - base9;
  if (w < 0 || w > 8) return null;
  // pure nine-gates: dropping the win tile leaves the exact base shape
  const minus = have.slice().map((v, i) => (i === w ? v - 1 : v));
  if (minus.every((v, i) => v === base[i])) return { pure: true };
  // general chuuren: dropping one tile anywhere leaves the base shape
  for (let k = 0; k < 9; k++) {
    if (have[k] <= 0) continue;
    const c = have.slice();
    c[k] -= 1;
    if (c.every((v, i) => v === base[i])) return { pure: false };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Standard sit-han yaku for one decomposition
 * ------------------------------------------------------------------ */

/**
 * Assemble the uniform set list: closed groups + melds.
 * @param {object} ctx
 */
export function allSets(ctx) {
  const sets = [];
  if (ctx.decomp) {
    for (const g of ctx.decomp.groups) {
      sets.push({ kind: g.kind, tiles: g.tiles, origin: "hand", claimedByWin: g.claimedByWin });
    }
  }
  for (const m of ctx.melds) {
    if (m.type === "kan" || m.type === "closed_kan") {
      sets.push({ kind: "kan", tiles: m.tiles, origin: "meld", isOpen: m.type === "kan" });
    } else if (m.type === "pon") {
      sets.push({ kind: "triplet", tiles: m.tiles, origin: "meld", isOpen: true });
    } else {
      sets.push({ kind: "run", tiles: m.tiles, origin: "meld", isOpen: true });
    }
  }
  return sets;
}

function tripletMapOf(sets) {
  const map = {};
  for (const s of sets) {
    if (s.kind === "triplet" || s.kind === "kan") {
      map[s.tiles[0]] = (map[s.tiles[0]] || 0) + 1;
    }
  }
  return map;
}

function runMapOf(sets) {
  const map = {};
  for (const s of sets) {
    if (s.kind === "run") map[s.tiles[0]] = (map[s.tiles[0]] || 0) + 1;
  }
  return map;
}

/** True for dragon / round wind / seat wind pair (blocks pinfu). */
function isYakuhaiPair(i, ctx) {
  if (i >= 31) return true;
  return i === ctx.roundWindIndex || i === ctx.seatWindIndex;
}

/**
 * Sit-han yaku for a candidate.
 * @param {object} ctx candidate context
 * @returns {{name:string, han:number, isYakuman:boolean}[]}
 */
export function detectSitHanYaku(ctx) {
  const y = [];
  const add = (name, han) => y.push({ name, han, isYakuman: false });

  /* --- situational yaku --- */
  if (ctx.riichi) add("Riichi", 1);
  if (ctx.doubleRiichi) add("Double Riichi", 1);
  if (ctx.ippatsu) add("Ippatsu", 1);
  if (ctx.winType === "tsumo" && ctx.isMenzen) add("Menzen Tsumo", 1);
  if (ctx.winType === "tsumo" && ctx.lastTile) add("Haitei", 1);
  if (ctx.winType === "ron" && ctx.lastTile) add("Houtei", 1);
  if (ctx.winType === "tsumo" && ctx.afterKan) add("Rinshan", 1);
  if (ctx.winType === "ron" && ctx.robbingKan) add("Chankan", 1);
  if (ctx.kanCount === 4) add("Sankantsu", 2);

  /* --- composition checks (standard shape only; chiitoitsu/kokushi stop) --- */
  if (ctx.shape !== "standard") {
    if (ctx.shape === "chiitoitsu") add("Chiitoitsu", 2);
    return y;
  }

  const counts = ctx.counts;
  let tanyaoOk = true;
  let honroutouOk = counts.reduce((a, b) => a + b, 0) > 0;
  let onlySuit = null;
  let hasHonor = false;
  let hasHonorTile = false;
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) continue;
    if (isTerminalOrHonor(i)) tanyaoOk = false;
    if (!isTerminal(i)) honroutouOk = false;
    if (isHonor(i)) hasHonorTile = true;
    if (i < 27) {
      const s = suitOf(i);
      if (onlySuit === null) onlySuit = s;
      else if (onlySuit !== s) onlySuit = "mixed";
    } else {
      hasHonor = true;
    }
  }

  if (tanyaoOk) add("Tanyao", 1);
  if (honroutouOk) add("Honroutou", 4);
  if (onlySuit !== null && onlySuit !== "mixed") {
    if (hasHonor) add("Honitsu", ctx.isMenzen ? 3 : 2);
    else add("Chinitsu", ctx.isMenzen ? 6 : 5);
  }

  const sets = allSets(ctx);
  if (!ctx.decomp) return y;

  const tm = tripletMapOf(sets);
  const rm = runMapOf(sets);

  /* yakuhai: dragons, round wind, seat wind (all stack) */
  for (let k = 0; k < 3; k++) {
    if (tm[31 + k]) add(DRAGON_NAMES[k], 1);
  }
  if (tm[ctx.roundWindIndex]) add(`Round Wind (${WIND_NAMES[ctx.roundWindIndex - 27]})`, 1);
  if (tm[ctx.seatWindIndex]) add(`Seat Wind (${WIND_NAMES[ctx.seatWindIndex - 27]})`, 1);

  /* toitoi */
  if (sets.length === 4 && sets.every((s) => s.kind === "triplet" || s.kind === "kan")) {
    add("Toitoi", 2);
  }

  /* sanankou: ≥3 concealed triplets, unclaimed by the winning tile */
  const closedTrips = sets.filter(
    (s) =>
      (s.kind === "triplet" || s.kind === "kan") &&
      s.origin === "hand" && !s.claimedByWin
  );
  const concealedKans = sets.filter(
    (s) => s.kind === "kan" && s.origin === "meld" && !s.isOpen
  );
  if (closedTrips.length + concealedKans.length >= 3) add("Sanankou", 2);

  /* shousangen */
  const dragonTrips = dragonIndices().filter((d) => tm[d]);
  if (
    dragonTrips.length === 2 &&
    ctx.decomp.pair !== null &&
    dragonIndices().includes(ctx.decomp.pair)
  ) {
    add("Shousangen", 2);
  }

  /* chanta / junchan — every set and the pair must contain yaochu */
  if (ctx.decomp.pair !== null) {
    const allHaveYaochu =
      sets.every((s) => s.tiles.some((t) => isTerminalOrHonor(t))) &&
      isTerminalOrHonor(ctx.decomp.pair);
    if (allHaveYaochu) {
      const noHonorsAnywhere = !hasHonorTile &&
        sets.every((s) => s.tiles.every((t) => !isHonor(t)));
      if (noHonorsAnywhere && isTerminal(ctx.decomp.pair)) {
        // junchan: honors nowhere, every group holds a terminal number
        const everySetTerminal = sets.every((s) =>
          s.tiles.some((t) => isTerminal(t))
        );
        if (everySetTerminal) add("Junchan", ctx.isMenzen ? 3 : 2);
        else add("Chanta", ctx.isMenzen ? 2 : 1);
      } else {
        add("Chanta", ctx.isMenzen ? 2 : 1);
      }
    }
  }

  /* sanshoku doujun: three same-number runs, one per suit */
  {
    const byNumber = {};
    for (const k of Object.keys(rm)) {
      const start = Number(k);
      byNumber[start % 9] = (byNumber[start % 9] || 0) + 1;
    }
    if (Object.values(byNumber).some((v) => v >= 3)) {
      add("Sanshoku Doujun", ctx.isMenzen ? 2 : 1);
    }
  }

  /* sanshoku doukou */
  {
    const byNumber = {};
    for (const k of Object.keys(tm)) {
      const idx = Number(k);
      byNumber[idx % 9] = (byNumber[idx % 9] || 0) + 1;
    }
    if (Object.values(byNumber).some((v) => v >= 3)) add("Sanshoku Doukou", 2);
  }

  /* ittsu: 1-2-3 + 4-5-6 + 7-8-9 in one suit */
  for (let base = 0; base < 27; base += 9) {
    if (rm[base] && rm[base + 3] && rm[base + 6]) {
      add("Ittsu", ctx.isMenzen ? 2 : 1);
      break;
    }
  }

  /* iipeikou / ryanpeikou (closed only); ryanpeikou supersedes iipeikou */
  if (ctx.isMenzen) {
    const dups = Object.values(rm);
    if (dups.some((v) => v >= 4)) {
      if (!y.some((e) => e.name === "Ryanpeikou")) add("Ryanpeikou", 3);
    } else if (dups.some((v) => v >= 2)) {
      add("Iipeikou", 1);
    }
  }

  /* pinfu: closed, four runs, non-yakuhai pair, ryanmen wait */
  if (
    ctx.isMenzen &&
    ctx.melds.length === 0 &&
    ctx.decomp.groups.length === 4 &&
    ctx.decomp.groups.every((g) => g.kind === "run") &&
    ctx.decomp.pair !== null &&
    !isYakuhaiPair(ctx.decomp.pair, ctx) &&
    ctx.waitType === "ryanmen"
  ) {
    add("Pinfu", 1);
  }

  return y;
}
