/**
 * score.js — the entry point: `calculateScore(input)` → full result JSON.
 *
 * Pipeline:
 *  1. Validate & parse input (tiles.m/p/s/z notation, counts, melds).
 *  2. Enumerate every decomposition of the closed part + win-tile
 *     assignment (which set/pair the claim completes) → candidates.
 *  3. For each candidate: detect yakuman, detect 1–6 han yaku, dora,
 *     ura-dora, aka-dora and compute fu.
 *  4. Pick the best-scoring candidate (score → han → fu).
 *  5. Tier + payments (ron / tsumo, dealer / non-dealer, honba, riichi sticks).
 */
import {
  parseTile, buildCounts, mergeCounts, assertMaxPerTile, codeOf,
  isHonor, isTerminal, isTerminalOrHonor, suitOf, dragonIndices,
  doraFromIndicator, countRedFives, windIndices,
} from "./tiles.js";
import {
  findStandardDecompositions, findChiitoitsu, findKokushi, runWaitType,
} from "./decompose.js";
import {
  detectKokushi, detectSuuankou, detectDaisangen, detectSuushi,
  detectTsuuiisou, detectChinroutou, detectRyuuiisou, detectChuuren,
  allSets, detectSitHanYaku,
} from "./yaku.js";
import { calculateFu } from "./fu.js";

/** Default configuration — every documented assumption is a flag here. */
export const DEFAULT_CONFIG = {
  /** double wind pair fu: 4 (most common) or treat as 2 */
  doubleWindPairFu4: true,
  /** kiriage mangan: 4 han 30 fu / 3 han 60 fu count as mangan */
  kiriageMangan: true,
  /** renhou rules: "yakuman" | "double" | "none" — varies by ruleset */
  renhouMode: "yakuman",
  /** 13-way kokushi wait counts as double yakuman */
  doubleKokushiWait: true,
  /** suuankou tanki wait counts as double yakuman */
  doubleSuuankouTanki: true,
  /** daisuushii counts as double yakuman */
  doubleDaisuushii: true,
  /** junsei chuuren (pure nine-gates) counts as double yakuman */
  doubleJunseiChuuren: true,
  /** counted (kazoe) yakuman payments: "yakuman" | "sanbaiman" */
  kazoePayment: "yakuman",
  /** minimum 20 fu never displayed as 19 (kept for parity) */
  honorFuText: true,
};

/**
 * Validate and normalize the whole input. Throws Error with a clear
 * message on any invalid value.
 * @param {object} input
 * @returns {object} normalized ctx pieces
 */
function parseInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("input must be an object");
  }
  const cfg = { ...DEFAULT_CONFIG, ...(input.config || {}) };

  const handCodes = [...(input.hand || [])].map(String);
  const meldsIn = [...(input.melds || [])];
  const doraIn = [...(input.doraIndicators || [])];
  const uraIn = [...(input.uraDoraIndicators || [])];

  // winType
  const winType = input.winType || "ron";
  if (!["ron", "tsumo"].includes(winType)) {
    throw new Error(`winType must be "ron" or "tsumo" (got "${input.winType}")`);
  }

  // winds
  const roundWindIndex = parseWind(input.roundWind);
  const seatWindIndex = parseWind(input.seatWind);

  // tiles
  const hand = buildCounts(handCodes);
  for (const c of handCodes) parseTile(c); // throws on bad notation
  if (hand.red[4] > 1 || hand.red[13] > 1 || hand.red[22] > 1) {
    throw new Error("There cannot be more than one red five of the same suit");
  }

  // resolve melds
  const melds = meldsIn.map((m) => resolveMeld(m));
  const meldSetCount = melds.length;

  // expected closed tile-count shape: 14 incl win - 3 per meld (kans = one set)
  const handLen = 14 - 3 * meldSetCount;
  const gotLen = handCodes.length;
  if (gotLen !== handLen) {
    throw new Error(
      `with ${meldSetCount} meld(s), "hand" must hold exactly ${handLen} tiles including the win tile (got ${gotLen})`
    );
  }

  // win tile
  if (!input.winTile) throw new Error(`"winTile" is required`);
  const { index: winIndex } = parseTile(String(input.winTile));
  if (hand.counts[winIndex] < 1) {
    throw new Error(`winTile "${input.winTile}" is not in the hand`);
  }

  // max 4 copies when hand + melds are combined; meld-4th tiles also counted
  const meldTiles = melds.reduce((acc, m) => acc + m.counts, buildCounts([]));
  const combined = mergeCounts(hand, meldTiles);
  assertMaxPerTile(combined.counts, 4, "combined hand + melds");

  // flag validation
  const menzen = melds.every((m) => m.type === "closed_kan");
  const riichi = !!input.riichi;
  const doubleRiichi = !!input.doubleRiichi;
  if ((riichi || doubleRiichi) && !menzen) {
    throw new Error("riichi/double riichi require a fully concealed hand (closed kans are fine)");
  }
  if (riichi || doubleRiichi || input.ippatsu) {
    if (doubleRiichi && !riichi) {
      throw new Error("doubleRiichi implies riichi — set riichi:true as well");
    }
    if (input.ippatsu && !riichi && !doubleRiichi) {
      throw new Error("ippatsu requires riichi (or double riichi)");
    }
  }
  const robbingKan = !!input.robbingKan;
  const afterKan = !!input.afterKan;
  if (robbingKan && winType !== "ron") {
    throw new Error(`robbingKan is only valid with winType "ron"`);
  }
  if (afterKan && winType !== "tsumo") {
    throw new Error(`afterKan is only valid with winType "tsumo"`);
  }
  if (afterKan && melds.every((m) => m.type !== "kan" && m.type !== "closed_kan")) {
    throw new Error("afterKan (rinshan) requires at least one kan");
  }

  // dora indicators
  for (const d of doraIn) parseTile(String(d));
  for (const d of uraIn) parseTile(String(d));
  // ura dora only counts under riichi (silently ignored otherwise — documented)
  const uraValid = riichi; // doubleRiichi implies riichi

  const redEnabled = input.redFives ? input.redFives.enabled !== false : true;

  // blessing sanity checks
  const blessing = input.blessing || null;
  if (blessing) {
    if (!["tenhou", "chiihou", "renhou"].includes(String(blessing))) {
      throw new Error(`blessing must be "tenhou", "chiihou" or "renhou" (got "${blessing}")`);
    }
    if (blessing === "tenhou" && (winType !== "tsumo" || parseWind(input.seatWind) !== 27)) {
      throw new Error(`tenhou requires a dealer (East seat) tsumo win`);
    }
    if (blessing === "chiihou" && (winType !== "tsumo" || parseWind(input.seatWind) === 27)) {
      throw new Error(`chiihou requires a non-dealer tsumo win`);
    }
    if (blessing === "renhou" && winType !== "ron") {
      throw new Error(`renhou requires winType "ron"`);
    }
  }

  return {
    cfg, winType, roundWindIndex, seatWindIndex, hand, melds,
    meldTiles, combined, winIndex, menzen,
    riichi, doubleRiichi: doubleRiichi && riichi ? true : false,
    ippatsu: !!input.ippatsu,
    lastTile: !!input.lastTile,
    robbingKan, afterKan,
    doraIn, uraIn, uraValid, redEnabled,
    honba: Number.isFinite(+input.honba) ? Math.max(0, Math.floor(+input.honba)) : 0,
    riichiSticks: Number.isFinite(+input.riichiSticks) ? Math.max(0, Math.floor(+input.riichiSticks)) : 0,
    blessing: input.blessing || null,
  };
}

function parseWind(w) {
  const { index } = parseTile(String(w ?? "1z"));
  if (!windIndices().includes(index)) {
    throw new Error(`wind must be one of "1z"–"4z" (East–North), got "${w}"`);
  }
  return index;
}

/** Resolve a meld descriptor into tiles + counts. */
function resolveMeld(m) {
  const type = m.type;
  if (!["chii", "pon", "kan", "closed_kan"].includes(type)) {
    throw new Error(`meld.type must be chii|pon|kan|closed_kan (got "${type}")`);
  }
  const codes = m.tiles.map(String);
  const parsed = codes.map(parseTile);
  const tiles = parsed.map((p) => p.index);
  if (type === "chii") {
    if (codes.length !== 3) throw new Error("chii meld needs exactly 3 tiles");
    const suit = suitOf(tiles[0]);
    if (suit === "z" || tiles.some((t) => suitOf(t) !== suit)) {
      throw new Error("chii meld tiles must be a run in one numbered suit");
    }
    const sorted = tiles.slice().sort((a, b) => a - b);
    if (sorted[1] !== sorted[0] + 1 || sorted[2] !== sorted[0] + 2) {
      throw new Error(`chii meld ${codes.join(",")} is not a consecutive run`);
    }
    tiles.length = 0;
    tiles.push(...sorted);
  } else {
    if (codes.length !== (type === "pon" ? 3 : 4)) {
      throw new Error(`${type} meld needs exactly ${type === "pon" ? 3 : 4} tiles`);
    }
    const uniq = [...new Set(tiles)];
    if (uniq.length !== 1) throw new Error(`${type} meld tiles must be identical`);
  }
  const counts = new Array(34).fill(0);
  for (const t of tiles) counts[t] += 1;
  return {
    type, tiles, counts,
    isClosedMeld: type === "closed_kan", ankan: type === "closed_kan",
  };
}

/* ------------------------------------------------------------------ *
 * Candidate generation
 * ------------------------------------------------------------------ */

/**
 * Build all candidates. A candidate includes the decomposition, the
 * win-assignment (which group the claim completes) and the wait type.
 */
function buildCandidates(state) {
  const { hand, melds, winIndex, menzen } = state;
  const candidates = [];

  /* standard decompositions */
  for (const d of findStandardDecompositions(hand.counts.slice(), melds.length)) {
    const options = [];
    d.groups.forEach((g, gi) => {
      if (g.tiles.includes(winIndex)) options.push({ groupIdx: gi });
    });
    if (d.pair === winIndex) options.push({ asPair: true });
    if (options.length === 0) continue; // claim must complete a closed group
    for (const opt of options) {
      candidates.push(makeStandardCandidate(state, d, opt));
    }
  }

  /* chiitoitsu */
  if (melds.length === 0 && menzen) {
    for (const chi of findChiitoitsu(hand.counts.slice())) {
      candidates.push(makeChiitoitsuCandidate(state, chi));
    }
  }

  /* kokushi */
  if (melds.length === 0) {
    const kok = detectKokushi(hand.counts.slice(), winIndex);
    if (kok) candidates.push(makeKokushiCandidate(state, kok));
  }

  return candidates;
}

function makeStandardCandidate(state, decomp, opt) {
  // annotate which closed group holds the claimed copy
  const groups = decomp.groups.map((g, gi) => ({
    ...g, origin: "hand",
    claimedByWin: opt.groupIdx === gi,
  }));
  const mergedGroups = [...groups];
  for (let gi = 0; gi < (opt.asPair ? 0 : 0); gi++) { /* noop placeholder */ }

  let waitType;
  if (opt.asPair) {
    waitType = "tanki";
  } else {
    const g = decomp.groups[opt.groupIdx];
    waitType = g.kind === "triplet" ? "shanpon" : runWaitType(g, state.winIndex);
  }
  // pair reference: decomp.pair (may equal winIndex)
  const pairIndex = decomp.pair;
  return { shape: "standard", decomp: { pair: pairIndex, groups }, waitType, opt };
}

function makeChiitoitsuCandidate(state, chi) {
  return {
    shape: "chiitoitsu",
    decomp: { pair: state.winIndex, groups: [] },
    waitType: "tanki",
    chiPairs: chi.pairs,
  };
}

function makeKokushiCandidate(state, kok) {
  return {
    shape: "kokushi",
    decomp: null,
    waitType: kok.isDoubleWait ? "tanki" : "single",
    kokushi: kok,
  };
}

/* ------------------------------------------------------------------ *
 * Scoring one candidate → {han, fu, yaku, isYakuman} or null when no yaku
 * ------------------------------------------------------------------ */

function scoreCandidate(state, cand) {
  const cfg = state.cfg;
  const ctx = {
    counts: state.combined.counts,
    decomp: cand.decomp,
    shape: cand.shape,
    melds: state.melds,
    kanCount: state.melds.filter((m) => m.type === "kan" || m.type === "closed_kan").length,
    winIndex: state.winIndex,
    winType: state.winType,
    waitType: cand.waitType,
    isMenzen: state.menzen,
    riichi: state.riichi,
    doubleRiichi: state.doubleRiichi,
    ippatsu: state.ippatsu,
    lastTile: state.lastTile,
    afterKan: state.afterKan,
    robbingKan: state.robbingKan,
    roundWindIndex: state.roundWindIndex,
    seatWindIndex: state.seatWindIndex,
    config: cfg,
  };

  /* --- yakuman detection --- */
  const sets = allSets({ ...ctx, decomp: cand.decomp });
  const yakuman = [];
  const addYakuman = (name, units = 1) => {
    for (let u = 0; u < units; u++) yakuman.push({ name: u === 0 ? name : `${name} (double yakuman)`, han: 1, isYakuman: true });
  };

  if (cand.shape === "kokushi") {
    addYakuman("Kokushi");
    if (cand.kokushi.isDoubleWait && cfg.doubleKokushiWait) addYakuman("Kokushi (13-way wait)");
  } else if (cand.shape === "standard" || cand.shape === "chiitoitsu") {
    // chuuren does not need a decomposition — check combined counts
    if (state.melds.length === 0) {
      const chuu = detectChuuren(state.combined.counts, state.winIndex);
      if (chuu) {
        addYakuman("Chuuren Poutou");
        if (chuu.pure && cfg.doubleJunseiChuuren) addYakuman("Junsei Chuuren (pure nine gates)");
      }
    }
    const tm = {};
    for (const s of sets) {
      if (s.kind === "triplet" || s.kind === "kan") tm[s.tiles[0]] = (tm[s.tiles[0]] || 0) + 1;
    }
    if (cand.shape === "standard") {
      // suuankou: 4 concealed triplet-equivalents; tanki wait keeps them concealed
      if (cand.waitType === "tanki") {
        const closed = sets.filter(
          (s) => (s.kind === "triplet" || s.kind === "kan") && !s.claimedByWin &&
            (s.origin === "hand" || s.isClosedMeld)
        );
        if (closed.length >= 4) {
          addYakuman("Suuankou");
          if (cfg.doubleSuuankouTanki) addYakuman("Suuankou Tanki (pair wait)");
        }
      }
      if (detectDaisangen(tm)) addYakuman("Daisangen");
      const suu = detectSuushi(tm, cand.decomp.pair);
      if (suu) {
        addYakuman(suu.type);
        if (suu.type === "Daisuushii" && cfg.doubleDaisuushii) addYakuman("Daisuushii (double yakuman form)");
      }
    }
    if (detectTsuuiisou(state.combined.counts)) addYakuman("Tsuuiisou");
    if (detectChinroutou(state.combined.counts)) addYakuman("Chinroutou");
    if (detectRyuuiisou(state.combined.counts)) addYakuman("Ryuuiisou");
    if (ctx.kanCount === 4) addYakuman("Suuankantsu");
  }

  /* --- blessing yakuman --- */
  if (state.blessing === "tenhou" || state.blessing === "chiihou") {
    addYakuman(state.blessing === "tenhou" ? "Tenhou" : "Chiihou");
  }
  if (state.blessing === "renhou" && state.cfg.renhouMode !== "none") {
    addYakuman("Renhou", state.cfg.renhouMode === "double" ? 2 : 1);
  }

  if (yakuman.length > 0) {
    return {
      han: yakuman.length * 13,
      fu: null,
      yaku: yakuman,
      isYakuman: true,
      yakumanUnits: yakuman.length,
      fuBreakdown: [],
      candidate: cand,
    };
  }

  /* --- sit-han yaku --- */
  const sitHan = detectSitHanYaku(ctx);
  const composition = sitHan.filter(
    (y) => !["Riichi", "Double Riichi", "Ippatsu", "Menzen Tsumo", "Haitei", "Houtei", "Rinshan", "Chankan", "Sankantsu"].includes(y.name)
  );
  if (sitHan.length === 0) return null; // dora alone is not a win

  /* --- dora / ura / aka --- */
  const doraList = [];
  for (const ind of state.doraIn) {
    const d = doraFromIndicator(String(ind));
    doraList.push({ name: "Dora", index: d });
  }
  let doraCount = 0;
  for (const d of doraList) doraCount += state.combined.counts[d.index];

  let uraCount = 0;
  if (state.uraValid) {
    for (const ind of state.uraIn) {
      const d = doraFromIndicator(String(ind));
      uraCount += state.combined.counts[d.index];
    }
  }

  const akaCount = state.redEnabled ? countRedFives(state.combined.red) : 0;

  const yaku = [...sitHan];
  if (doraCount > 0) yaku.push({ name: "Dora", han: doraCount, isYakuman: false });
  if (uraCount > 0) yaku.push({ name: "Ura Dora", han: uraCount, isYakuman: false });
  if (akaCount > 0) yaku.push({ name: "Aka Dora (Red Five)", han: akaCount, isYakuman: false });

  /* --- fu --- */
  const pinfuCandidate = sitHan.some((y) => y.name === "Pinfu");
  const fuResult = calculateFu(
    { ...ctx, allSets: sets },
    pinfuCandidate
  );

  const han = sitHan.reduce((a, y) => a + y.han, 0) + doraCount + uraCount + akaCount;

  return {
    han,
    fu: fuResult.fu,
    yaku,
    isYakuman: false,
    yakumanUnits: 0,
    fuBreakdown: fuResult.breakdown,
    candidate: cand,
    compositionYakuCount: composition.length,
  };
}

/* ------------------------------------------------------------------ *
 * Attribution: basic points, tier, payments
 * ------------------------------------------------------------------ */

const TIER_BANDS = [
  { minHan: 11, basic: 6000, tier: "Sanbaiman" },
  { minHan: 8, basic: 4000, tier: "Baiman" },
  { minHan: 6, basic: 3000, tier: "Haneman" },
  { minHan: 5, basic: 2000, tier: "Mangan" },
];

function basicPoints(fu, han, cfg) {
  // counted yakuman handled by callers; here han ≤ 12
  if (han <= 4) {
    const raw = fu * Math.pow(2, han + 2);
    if (raw >= 1920 && cfg.kiriageMangan) return 2000;
    return Math.min(raw, 2000);
  }
  for (const band of TIER_BANDS) {
    if (han >= band.minHan) return band.basic;
  }
  return 2000; // unreachable
}

function round100(n) {
  return Math.ceil(n / 100) * 100;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Score a winning riichi hand.
 * @param {object} input see project README/tests
 * @returns {{
 *   han:number, fu:number|null, yaku:{name:string,han:number}[],
 *   tier:string|null, points:number, payments:object,
 *   fuBreakdown:{label:string,fu:number}[], isYakuman:boolean,
 *   winningDecomp?:object, seatIsDealer?:boolean
 * }}
 */
export function calculateScore(input) {
  const state = parseInput(input);
  const candidates = buildCandidates(state);
  if (candidates.length === 0) {
    throw new Error("Hand is not a winning hand — no valid decomposition (4 sets + pair, chiitoitsu or kokushi) exists");
  }

  const scored = [];
  for (const cand of candidates) {
    const sc = scoreCandidate(state, cand);
    if (sc) scored.push(sc);
  }
  if (scored.length === 0) {
    throw new Error("No yaku detected — dora alone is not a win");
  }

  // pick the highest score (score → then han → then fu)
  scored.sort((a, b) => pickValue(b) - pickValue(a) || b.han - a.han || (b.fu ?? 0) - (a.fu ?? 0));
  const best = scored[0];

  /* tier & basic points */
  let isYakuman = best.isYakuman;
  let yakUnits = best.yakumanUnits;
  let tier = null;
  let basic;

  if (isYakuman) {
    basic = 8000 * yakUnits;
    tier = yakUnits > 1 ? `Yakuman (×${yakUnits})` : "Yakuman";
  } else if (best.han >= 13) {
    // counted (kazoe) yakuman — pay at yakuman scale (assumption, config)
    isYakuman = true;
    yakUnits = 1;
    basic = 8000;
    tier = "Kazoe Yakuman";
  } else if (best.han >= 5) {
    const band = TIER_BANDS.find((b) => best.han >= b.minHan);
    basic = band.basic;
    tier = band.tier;
  } else {
    basic = basicPoints(best.fu, best.han, state.cfg);
    if (basic >= 2000) tier = "Mangan";
  }

  /* payments */
  const dealer = state.seatWindIndex === 27;
  let payments = {};
  let points;

  if (state.winType === "ron") {
    const main = isYakuman ? basic * (dealer ? 6 : 4) : basic * (dealer ? 6 : 4);
    const pay = round100(main) + state.honba * 300;
    payments.ron = pay;
    points = pay;
  } else if (dealer) {
    const each = round100(basic * 2);
    payments.nonDealer = each + state.honba * 100;
    points = payments.nonDealer * 3;
  } else {
    const dealerPays = round100(basic * 2);
    const othersPays = round100(basic);
    payments.dealer = dealerPays + state.honba * 200;
    payments.nonDealer = othersPays + state.honba * 100;
    points = payments.dealer + payments.nonDealer * 2;
  }
  if (state.riichiSticks > 0) {
    payments.riichiSticks = state.riichiSticks * 1000;
    points += payments.riichiSticks;
  }

  return {
    han: best.han,
    fu: best.fu,
    yaku: best.yaku,
    tier,
    points,
    payments,
    fuBreakdown: best.fuBreakdown,
    isYakuman,
    seatIsDealer: dealer,
    winTile: input.winTile,
    winType: state.winType,
    winningDecomp: describeDecomp(best.candidate),
  };
}

function pickValue(sc) {
  return sc.isYakuman ? 1e9 + sc.yakumanUnits * 1e6 : sc.han * 10000 + (sc.fu ?? 0);
}

/** Human-readable decomposition for the result payload. */
function describeDecomp(cand) {
  if (!cand) return null;
  if (cand.shape === "kokushi") return { shape: "kokushi", wait: cand.waitType };
  if (cand.shape === "chiitoitsu") return { shape: "chiitoitsu", wait: "tanki" };
  return {
    shape: "standard",
    pair: cand.decomp.pair,
    sets: cand.decomp.groups.map((g) => (g.kind === "triplet" ? codeOf(g.tiles[0]) + "×3" : g.tiles.map((t) => codeOf(t)).join(""))),
    wait: cand.waitType,
  };
}

/* Browser fallback for non-module pages */
if (typeof window !== "undefined") {
  window.RiichiScore = { calculateScore, DEFAULT_CONFIG };
}
