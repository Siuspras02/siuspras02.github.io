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

console.log(`\n${passed} test(s) passed`);
