// Regression tests. Run with: node riichi/tests.mjs
import assert from "node:assert/strict";
import { calculateScore } from "./score.js";

const BASE = {
  winType: "ron",
  roundWind: "1z",
  seatWind: "2z",
};

// Closed part of a hand that pairs with an open pon of 5m/5p/5s:
// 7z triplet (Red Dragon yaku), 123s run, 456s run, 66z pair.
const CLOSED_PART = [
  "7z", "7z", "7z", "6z", "6z", "1s", "2s", "3s", "4s", "5s", "6s",
];
const WIN_TILE = "6s";

const akaYaku = (result) =>
  (result.yaku || []).filter((y) => y.name.includes("Aka Dora"));

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

test("pon meld holding one aka five counts exactly 1 red dora", () => {
  const r = calculateScore({
    ...BASE,
    hand: CLOSED_PART,
    winTile: WIN_TILE,
    melds: [{ type: "pon", tiles: ["0p", "5p", "5p"] }],
    doraIndicators: [],
  });
  const aka = akaYaku(r);
  assert.equal(aka.length, 1, "one red-dora yaku entry");
  assert.equal(aka[0].han, 1, "red dora worth 1 han, not 3");
});

test("fish-equivalent: no aka in meld means no red dora", () => {
  const r = calculateScore({
    ...BASE,
    hand: CLOSED_PART,
    winTile: WIN_TILE,
    melds: [{ type: "pon", tiles: ["5p", "5p", "5p"] }],
    doraIndicators: [],
  });
  assert.equal(akaYaku(r).length, 0);
});

test("meld with 3 aka fives of one suit is rejected (only 1 aka exists per suit)", () => {
  assert.throws(
    () =>
      calculateScore({
        ...BASE,
        hand: CLOSED_PART,
        winTile: WIN_TILE,
        melds: [{ type: "pon", tiles: ["0p", "0p", "0p"] }],
      }),
    /red five/i,
  );
});

test("hand + melds together may not hold 2 aka fives of one suit", () => {
  assert.throws(
    () =>
      calculateScore({
        ...BASE,
        hand: ["7z", "7z", "7z", "6z", "1s", "2s", "3s", "4s", "5s", "6s", "0p"],
        winTile: WIN_TILE,
        melds: [{ type: "pon", tiles: ["0p", "5p", "5p"] }],
      }),
    /red five/i,
  );
});

test("closed kan of an aka five counts exactly 1 red dora", () => {
  const r = calculateScore({
    ...BASE,
    hand: CLOSED_PART,
    winTile: WIN_TILE,
    melds: [{ type: "closed_kan", tiles: ["0m", "5m", "5m", "5m"] }],
    doraIndicators: [],
  });
  const aka = akaYaku(r);
  assert.equal(aka.length, 1);
  assert.equal(aka[0].han, 1);
});

/* ------------------------------------------------------------------ *
 * Sanma (3-player) tests
 * ------------------------------------------------------------------ */

const SANMA_BASE = {
  winType: "ron",
  roundWind: "1z",
  seatWind: "2z",
  players: 3,
};

// Closed, all-simples tsumo hand used for several sanma tests:
// 333p + 777s triplets, 345p + 678p runs, 4s4s pair completed by 4s (tanki).
// Yaku: Riichi + Menzen Tsumo + Tanyao = 3 han.
// Fu: 20 base + 2 tsumo + 4 + 4 concealed simple triplets + 2 tanki = 32 → 40.
const SANMA_TSUMO_HAND = {
  hand: ["3p", "3p", "3p", "7s", "7s", "7s", "3p", "4p", "5p", "6p", "7p", "8p", "4s", "4s"],
  winTile: "4s",
  winType: "tsumo",
  riichi: true,
  melds: [],
};

test("sanma: non-dealer 3 han 40 fu tsumo (tsumo loss — missing seat doesn't pay)", () => {
  const r = calculateScore({
    ...SANMA_BASE,
    ...SANMA_TSUMO_HAND,
    seatWind: "2z",
  });
  assert.equal(r.han, 3);
  assert.equal(r.fu, 40);
  assert.equal(r.seatIsDealer, false);
  assert.equal(r.tsumoLoss, "skip");
  // base = 40 × 2^5 = 1280 → dealer 2× (rounded to 100) = 2600, other 1300
  assert.equal(r.payments.dealer, 2600);
  assert.equal(r.payments.nonDealer, 1300);
  assert.equal(r.points, 3900);
});

test("sanma: tsumo redistribution splits the missing seat's share", () => {
  const r = calculateScore({
    ...SANMA_BASE,
    ...SANMA_TSUMO_HAND,
    seatWind: "2z",
    tsumoLoss: "redistribute",
  });
  // dealer 2.5× = 3200, other player 1.5× = 1920 → rounded to 100
  assert.equal(r.payments.dealer, 3200);
  assert.equal(r.payments.nonDealer, 2000);
  assert.equal(r.points, 5200);
});

// Open dealer-ron sanma hand: a melded White Dragon pon, a concealed 2s
// triplet (unclaimed), two plain pin runs, and a plain 3s pair completed
// by 3s on a tanki wait. A 1s indicator gives 3 dora on the 2s triplet.
// Yaku: White Dragon (1) + Dora (3) = 4 han.
// Fu: 20 base + 4 open honor pon + 4 concealed simple triplet + 2 tanki
// = 30 fu exactly.
const SANMA_DEALER_HAND = {
  hand: ["2s", "2s", "2s", "3p", "4p", "5p", "6p", "7p", "8p", "3s", "3s"],
  winTile: "3s",
  winType: "ron",
  seatWind: "1z",
  roundWind: "1z",
  melds: [{ type: "pon", tiles: ["6z", "6z", "6z"] }],
  doraIndicators: ["1s"],
};

test("sanma: dealer 4 han 30 fu ron pays 6× base to a single loser", () => {
  const r = calculateScore({
    ...SANMA_BASE,
    ...SANMA_DEALER_HAND,
    config: { kiriageMangan: false },
  });
  assert.equal(r.han, 4);
  assert.equal(r.fu, 30);
  assert.equal(r.seatIsDealer, true);
  // base = 30 × 2^6 = 1920 → dealer ron = 6 × 1920 = 11,520 → 11,600
  assert.equal(r.payments.ron, 11600);
  assert.equal(r.payments.ronPerPayer, 11600);
  assert.equal(r.payments.ronPayers, 2, "double ron: both losers pay");
  assert.equal(r.points, 11600);
});

test("sanma: dealer tsumo — each of the 2 other players pays 2× base", () => {
  // Closed dealer tsumo: White Dragon triplet + Menzen Tsumo = 2 han.
  // Fu: 20 base + 2 tsumo + 8 concealed honor triplet = 30 → base 480
  // → each payer round100(960) = 1000, total 2000.
  const r = calculateScore({
    ...SANMA_BASE,
    seatWind: "1z",
    winType: "tsumo",
    hand: [
      "6z", "6z", "6z", "2p", "2p", "3p", "4p", "5p",
      "6p", "7p", "8p", "3s", "4s", "5s",
    ],
    winTile: "5s",
    riichi: false,
  });
  assert.equal(r.han, 2);
  assert.equal(r.fu, 30);
  assert.equal(r.seatIsDealer, true);
  assert.equal(r.payments.nonDealer, 1000);
  assert.equal(r.points, 2000);
});

test("sanma: mangan with 2 nukidora (nukidora adds 1 han each)", () => {
  const r = calculateScore({
    ...SANMA_BASE,
    ...SANMA_TSUMO_HAND,
    seatWind: "2z",
    nukidora: 2,
  });
  assert.equal(r.han, 5, "3 han hand + 2 nukidora = 5 (mangan)");
  assert.equal(r.tier, "Mangan");
  const nuki = (r.yaku || []).find((y) => y.name === "Nukidora");
  assert.ok(nuki, "nukidora listed as its own yaku entry");
  assert.equal(nuki.han, 2);
  // mangan base 2000 → dealer 4000, other player 2000
  assert.equal(r.payments.dealer, 4000);
  assert.equal(r.payments.nonDealer, 2000);
  assert.equal(r.points, 6000);
});

test("sanma: a 1m indicator reveals 9m as dora", () => {
  const r = calculateScore({
    ...SANMA_BASE,
    seatWind: "3z",
    hand: ["7z", "7z", "7z", "3s", "3p", "4p", "5p", "6p", "7p", "8p", "3s"],
    winTile: "3s",
    melds: [{ type: "pon", tiles: ["9m", "9m", "9m"] }],
    doraIndicators: ["1m"],
  });
  assert.ok(r.yaku.some((y) => y.name === "Dora" && y.han === 3));
});

test("sanma: a 9m indicator reveals 1m as dora", () => {
  const r = calculateScore({
    ...SANMA_BASE,
    seatWind: "3z",
    hand: ["7z", "7z", "7z", "3s", "3p", "4p", "5p", "6p", "7p", "8p", "3s"],
    winTile: "3s",
    melds: [{ type: "pon", tiles: ["1m", "1m", "1m"] }],
    doraIndicators: ["9m"],
  });
  assert.ok(r.yaku.some((y) => y.name === "Dora" && y.han === 3));
});

test("4-player: a 1m indicator still reveals 2m as dora (unchanged)", () => {
  const r = calculateScore({
    ...BASE,
    seatWind: "3z",
    hand: ["7z", "7z", "7z", "3s", "3p", "4p", "5p", "6p", "7p", "8p", "3s"],
    winTile: "3s",
    melds: [{ type: "pon", tiles: ["2m", "2m", "2m"] }],
    doraIndicators: ["1m"],
  });
  assert.ok(r.yaku.some((y) => y.name === "Dora" && y.han === 3));
  assert.equal(r.players, 4);
});

test("sanma rejects chi melds", () => {
  assert.throws(
    () =>
      calculateScore({
        ...SANMA_BASE,
        hand: ["7z", "7z", "7z", "3s", "3p", "4p", "5p", "6p", "7p", "8p", "3s"],
        winTile: "3s",
        melds: [{ type: "chii", tiles: ["3p", "4p", "5p"] }],
      }),
    /chi is not allowed/i,
  );
});

test("sanma rejects 2m–8m tiles", () => {
  assert.throws(
    () =>
      calculateScore({
        ...SANMA_BASE,
        hand: [
          "7z", "7z", "7z", "3s", "3s", "3p", "4p", "5p",
          "6p", "7p", "8p", "9p", "5m", "1s",
        ],
        winTile: "1s",
      }),
    /not used in 3-player/i,
  );
});

test("sanma rejects North as seat or round wind", () => {
  const hand = {
    hand: SANMA_TSUMO_HAND.hand,
    winTile: SANMA_TSUMO_HAND.winTile,
    winType: "tsumo",
  };
  assert.throws(
    () => calculateScore({ ...SANMA_BASE, ...hand, seatWind: "4z" }),
    /North is not a seat wind/i,
  );
  assert.throws(
    () => calculateScore({ ...SANMA_BASE, ...hand, roundWind: "4z" }),
    /North is not a round wind/i,
  );
});

/* ------------------------------------------------------------------ *
 * Yaku-pattern regressions
 * ------------------------------------------------------------------ */

test("ryanpeikou: two different doubled runs, not just 4-of-a-kind runs", () => {
  // 123m 123m 456m 456m 77m — two identical-run pairs of DIFFERENT runs.
  // Menzen tsumo, no dora: Ryanpeikou 3 + Chinitsu 6 + Menzen Tsumo 1 = 10 han.
  const r = calculateScore({
    hand: ["1m", "2m", "3m", "1m", "2m", "3m", "4m", "5m", "6m", "4m", "5m", "6m", "7m", "7m"],
    winTile: "7m",
    winType: "tsumo",
    roundWind: "1z",
    seatWind: "2z",
    doraIndicators: [],
  });
  const yp = (r.yaku || []).find((y) => y.name === "Ryanpeikou");
  assert.ok(yp, `expected Ryanpeikou in ${r.yaku.map((y) => y.name).join(", ")}`);
  assert.equal(yp.han, 3);
  assert.ok(!r.yaku.some((y) => y.name === "Iipeikou"), "iipeikou superseded");
});

test("ryanpeikou + pinfu: the reference 11-han sanbaiman hand", () => {
  // 11223344556677, tanki on 7m — pinfu (tanki counts) + ryanpeikou stack.
  // Menzen tsumo: Ryanpeikou 3 + Chinitsu 6 + Menzen Tsumo 1 + Pinfu 1 = 11 han
  // → Sanbaiman. Fu: 20 base, +0 for pinfu tsumo.
  const r = calculateScore({
    hand: ["1m", "1m", "2m", "2m", "3m", "3m", "4m", "4m", "5m", "5m", "6m", "6m", "7m", "7m"],
    winTile: "7m",
    winType: "tsumo",
    roundWind: "1z",
    seatWind: "1z",
    doraIndicators: [],
  });
  assert.equal(r.han, 11, `han: ${r.han} [${r.yaku.map((y) => y.name).join(", ")}]`);
  assert.equal(r.fu, 20);
  assert.equal(r.tier, "Sanbaiman");
  assert.ok(r.yaku.some((y) => y.name === "Ryanpeikou"));
  assert.ok(r.yaku.some((y) => y.name === "Pinfu"));
  // Dealer tsumo sanbaiman: 12,000 from each of the 3 others → 36,000.
  assert.equal(r.payments.nonDealer, 12000);
  assert.equal(r.points, 36000);
});

test("four identical runs still count as ryanpeikou (2 identical pairs)", () => {
  const r = calculateScore({
    hand: ["1m", "2m", "3m", "1m", "2m", "3m", "1m", "2m", "3m", "1m", "2m", "3m", "6z", "6z"],
    winTile: "6z",
    winType: "ron",
    roundWind: "1z",
    seatWind: "2z",
    doraIndicators: [],
  });
  assert.ok(r.yaku.some((y) => y.name === "Ryanpeikou"));
});

test("single doubled run stays iipeikou (1 han)", () => {
  // iipeikou, tsumo: 123m 123m 456m + concealed 999m + 2z pair (tanki).
  const r = calculateScore({
    hand: ["1m", "2m", "3m", "1m", "2m", "3m", "4m", "5m", "6m", "9m", "9m", "9m", "2z", "2z"],
    winTile: "2z",
    winType: "tsumo",
    roundWind: "1z",
    seatWind: "1z",
    doraIndicators: [],
  });
  assert.ok(r.yaku.some((y) => y.name === "Iipeikou"),
    `expected Iipeikou in ${r.yaku.map((y) => y.name).join(", ")}`);
  assert.ok(!r.yaku.some((y) => y.name === "Ryanpeikou"));
});

console.log(`\n${passed} test(s) passed`);
