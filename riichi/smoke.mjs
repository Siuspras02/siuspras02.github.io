// temporary smoke test
import { calculateScore } from "./score.js";

try {
  const r = calculateScore({
    hand: ["3p","3p","4p","4p","5p","5p","6p","7p","8p","7z","7z","7z","6z","6z"],
    winTile: "6z",
    winType: "ron",
    roundWind: "1z", seatWind: "2z",
    doraIndicators: ["4p"],
  });
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error("ERROR:", e.message, "\n", e.stack);
}
