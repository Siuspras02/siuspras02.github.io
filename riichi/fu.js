/**
 * fu.js — fu calculation for one candidate decomposition.
 *
 * Returns { fu, breakdown: [{label, fu}] }. Labels are ready-to-render
 * sentences ("+10 fu for a closed hand ron").
 *
 * Rule notes:
 *  - base 20 fu; chiitoitsu fixed 25 fu
 *  - +10 closed ron; +2 tsumo (skipped for pinfu tsumo, which stays 20)
 *  - triplet fu: simple 2/4, terminal/honor 4/8 (open/closed); kans ×4
 *  - triplets formed from hand tiles are concealed; a triplet completed by
 *    the win (ron claim / completing the last two tiles) counts open
 *  - triplet fu applies in open hands too (hand-formed triplets still
 *    count concealed)
 *  - pair: dragon/round/seat wind +2; double wind pairs +4 (config:
 *    doubleWindPairFu4) or 2 under the alternative common rule
 *  - wait: tanki/kanchan/penchan +2 (shanpon and ryanmen give 0)
 *  - round up to the nearest 10 (except chiitoitsu)
 */
import { isHonor, isTerminal, suitOf } from "./tiles.js";

const HONOR_NAMES = [
  "East", "South", "West", "North",
  "White Dragon", "Green Dragon", "Red Dragon",
];

function tileName(i, kind) {
  if (i >= 27) return HONOR_NAMES[i - 27];
  const n = (i % 9) + 1;
  const suit = suitOf(i).toUpperCase();
  return kind === "kan" ? `${n}${suit} kan` : `${n}${suit} triplet`;
}

/**
 * Compute fu for a candidate.
 * @param {object} ctx candidate context; ctx.allSets resolved set list and
 *   ctx.waitType are required
 * @param {boolean} pinfuCandidate whether this decomposition qualifies pinfu
 * @returns {{fu:number, breakdown:{label:string,fu:number}[]}}
 */
export function calculateFu(ctx, pinfuCandidate) {
  const parts = [];

  /* --- fixed-fu shapes --- */
  if (ctx.shape === "chiitoitsu") {
    return { fu: 25, breakdown: [{ label: "base fu for chiitoitsu", fu: 25 }] };
  }
  if (ctx.shape === "kokushi") {
    return { fu: 20, breakdown: [{ label: "base fu", fu: 20 }] };
  }

  /* --- base + win-type fu --- */
  const pinfuTsumo = pinfuCandidate && ctx.winType === "tsumo";
  const closedRon = ctx.isMenzen && ctx.winType === "ron";

  parts.push({ label: "base fu", fu: 20 });
  let fu = 20;

  if (closedRon) {
    parts.push({ label: "+10 fu for a closed hand ron", fu: 10 });
    fu += 10;
  } else if (ctx.winType === "tsumo" && !pinfuTsumo) {
    parts.push({ label: "+2 fu for tsumo", fu: 2 });
    fu += 2;
  } else if (pinfuTsumo) {
    parts.push({ label: "pinfu tsumo: no fu added (stays 20)", fu: 0 });
  }

  /* --- triplet / kan fu --- */
  for (const s of ctx.allSets) {
    if (s.kind !== "triplet" && s.kind !== "kan") continue;
    const idx = s.tiles[0];
    const isYaochu = isTerminal(idx) || isHonor(idx);
    // concealed when melded closed (ankan) or formed from hand; a tsumo
    // claim keeps hand triplets concealed
    const concealed =
      s.origin === "meld" ? s.isClosedMeld : ctx.winType === "tsumo" ? true : !s.claimedByWin;
    let v;
    if (s.kind === "kan") {
      v = concealed ? (isYaochu ? 32 : 16) : isYaochu ? 16 : 8;
    } else {
      v = concealed ? (isYaochu ? 8 : 4) : isYaochu ? 4 : 2;
    }
    parts.push({
      label: `+${v} fu for a ${concealed ? "concealed" : "open"} ${isYaochu ? "terminal/honor" : "simple"} ${tileName(idx, s.kind).toLowerCase()}`,
      fu: v,
    });
    fu += v;
  }

  /* --- pair fu --- */
  if (ctx.decomp && ctx.decomp.pair !== null) {
    const p = ctx.decomp.pair;
    const isRound = p === ctx.roundWindIndex;
    const isSeat = p === ctx.seatWindIndex;
    if (p >= 31) {
      parts.push({ label: `+2 fu for a ${HONOR_NAMES[p - 27]} pair`, fu: 2 });
      fu += 2;
    } else if (isRound && isSeat) {
      const v = ctx.config.doubleWindPairFu4 ? 4 : 2;
      parts.push({
        label: `+${v} fu for a double ${HONOR_NAMES[p - 27]} wind pair`,
        fu: v,
      });
      fu += v;
    } else if (isRound || isSeat) {
      parts.push({
        label: `+2 fu for a ${isRound ? "round wind" : "seat wind"} pair`,
        fu: 2,
      });
      fu += 2;
    }
  }

  /* --- wait fu --- */
  if (["tanki", "kanchan", "penchan"].includes(ctx.waitType)) {
    const labels = {
      tanki: "+2 fu for a pair wait (tanki)",
      kanchan: "+2 fu for a closed wait (kanchan)",
      penchan: "+2 fu for an edge wait (penchan)",
    };
    parts.push({ label: labels[ctx.waitType], fu: 2 });
    fu += 2;
  }

  /* --- round up to the nearest 10 --- */
  const rounded = Math.ceil(fu / 10) * 10;
  if (rounded !== fu) {
    parts.push({ label: `rounded up to the nearest 10`, fu: rounded - fu });
  }
  return { fu: rounded, breakdown: parts };
}
