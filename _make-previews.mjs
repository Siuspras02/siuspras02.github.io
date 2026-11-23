import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("Mahjong.html", "utf8").replace(
  /<script type="module" src="app\.js"><\/script>/,
  "",
);

const hideLobby = src.replace(
  'id="lobby-section" class="fade-in mx-auto w-full max-w-6xl"',
  'id="lobby-section" class="fade-in mx-auto hidden w-full max-w-6xl"',
);

const setup = hideLobby.replace(
  'id="setup-section" class="fade-in mx-auto hidden w-full max-w-3xl"',
  'id="setup-section" class="fade-in mx-auto w-full max-w-3xl"',
);
writeFileSync("_preview-setup.html", setup);

const card = ({ wind, kanji, name, score, rank, dealer, leader, net, gap }) => `
  <div class="score-card wind-${wind}${dealer ? " is-dealer" : ""}${leader ? " is-leader" : ""}" style="--card-index:0">
    <div class="seat-top">
      <span class="wind-badge"><span class="wind-kanji">${kanji}</span>${dealer ? "Dealer" : wind[0].toUpperCase() + wind.slice(1)}</span>
      <span class="rank-badge${rank === 1 ? " is-first" : ""}">${rank}</span>
    </div>
    <p class="seat-name">${name}</p>
    <div class="score-row"><span class="score-value">${score}</span><span class="score-pts">pts</span></div>
    <div class="seat-meta"><span class="net-chip ${net > 0 ? "is-up" : net < 0 ? "is-down" : "is-even"}"><span class="net-label">Net</span>${net > 0 ? "+" : ""}${net.toLocaleString()}</span><span class="seat-gap">${gap}</span></div>
    <div class="seat-actions">
      <button type="button" class="seat-btn seat-btn-riichi"><span class="riichi-dot"></span>Riichi</button>
      <button type="button" class="seat-btn seat-btn-pot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg>Pot</button>
    </div>
  </div>`;

const cards = [
  { wind: "east", kanji: "東", name: "Yuki", score: "31,200", rank: 1, dealer: true, leader: true, net: 6200, gap: "Leading" },
  { wind: "south", kanji: "南", name: "Mei", score: "26,800", rank: 2, net: 1800, gap: "4,400 back" },
  { wind: "west", kanji: "西", name: "Ren", score: "24,500", rank: 3, net: -500, gap: "6,700 back" },
  { wind: "north", kanji: "北", name: "Aki", score: "17,500", rank: 4, net: -7500, gap: "13,700 back" },
].map(card).join("");

const entry = [
  ["east", "東", "Yuki", "East"],
  ["south", "南", "Mei", "South"],
  ["west", "西", "Ren", "West"],
  ["north", "北", "Aki", "North"],
]
  .map(
    ([w, k, name, label]) => `
  <div class="entry-item wind-${w}">
    <label class="entry-label"><span class="entry-wind">${k}</span><span class="entry-name">${name}</span><span class="entry-wind-text">${label}</span></label>
    <div class="relative entry-control">
      <input type="number" placeholder="0" aria-label="Point change for ${name}" class="field score-input py-3 pr-12 text-center text-lg font-bold tabular-nums">
      <span class="entry-pts">pts</span>
    </div>
  </div>`,
  )
  .join("");

const rows = [
  [5, ["+12,000", "-4,000", "-4,000", "-4,000"], "–", "Tsumo, dealer repeat"],
  [4, ["-8,000", "+11,000", "-2,000", "-1,000"], "+1,000", "Ron, riichi"],
  [3, ["+7,700", "-3,900", "-3,900", "0"], "–", "Haneman"],
]
  .map(
    ([n, cells, pot, note]) => `
  <tr class="ledger-row">
    <td class="px-4 py-3 text-center"><span class="inline-grid">${n}</span></td>
    ${cells.map((v) => `<td class="px-4 py-3 text-right"><span class="inline-block">${v}</span></td>`).join("")}
    <td class="px-4 py-3 text-right">${pot}</td>
    <td class="px-6 py-3 text-left">${note}</td>
  </tr>`,
  )
  .join("");

const game = hideLobby
  .replace(
    'id="lobby-section" class="fade-in mx-auto w-full max-w-6xl"',
    'id="lobby-section" class="fade-in mx-auto hidden w-full max-w-6xl"',
  )
  .replace(
    'class="fade-in hidden flex flex-1 flex-col space-y-6"',
    'class="fade-in flex flex-1 flex-col space-y-6"',
  )
  .replace(
    /<div id="score-dashboard" class="grid gap-4">[\s\S]*?<!-- Cards injected dynamically -->\s*<\/div>/,
    `<div id="score-dashboard" class="match-arena">
          <div class="arena-bar">
            <div class="arena-meta">
              <span class="live-pill"><span class="live-dot"></span>Live</span>
              <div class="arena-round">
                <span class="arena-round-label">Hand</span>
                <span class="arena-round-value">6</span>
                <span class="arena-round-sub">Dealer Yuki</span>
              </div>
            </div>
            <div class="pot-tank" role="status" aria-label="Riichi pot 3000 points">
              <div class="pot-sticks" aria-hidden="true"><span class="pot-stick" style="--i:0"></span><span class="pot-stick" style="--i:1"></span><span class="pot-stick" style="--i:2"></span></div>
              <div class="pot-copy">
                <span class="pot-label">Riichi pot</span>
                <span class="pot-value"><span>3,000</span> <span class="pot-unit">pts</span></span>
              </div>
            </div>
          </div>
          <div class="score-grid">${cards}</div>
        </div>`,
  )
  .replace(
    '<div id="input-container" class="mt-6 grid gap-4">',
    '<div id="input-container" class="player-grid mt-6">',
  )
  .replace(' disabled\n              class="btn btn-primary flex-1', ' class="btn btn-primary flex-1')
  .replace('data-state="empty"', 'data-state="valid"')
  .replace(/(id="round-count"[\s\S]{0,80}?)>0</, "$1>5<")
  .replace("<!-- Inputs injected dynamically -->", entry)
  .replace("<!-- Headers injected dynamically -->", `
      <th class="px-4 py-4 text-center">#</th>
      <th class="px-4 py-4 text-right">Yuki</th>
      <th class="px-4 py-4 text-right">Mei</th>
      <th class="px-4 py-4 text-right">Ren</th>
      <th class="px-4 py-4 text-right">Aki</th>
      <th class="px-4 py-4 text-right">Pot</th>
      <th class="px-6 py-4 text-left">Note</th>`)
  .replace("<!-- History rows injected dynamically -->", rows);

writeFileSync("_preview-game.html", game);

const calc = src
  .replace(
    'id="calculator-modal"\n      class="fixed inset-0 z-[70] hidden items-center justify-center bg-ink/50 p-4 backdrop-blur-md flex"',
    'id="calculator-modal"\n      class="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-md"',
  )
  .replace(
    'id="lobby-section" class="fade-in mx-auto w-full max-w-6xl"',
    'id="lobby-section" class="fade-in mx-auto hidden w-full max-w-6xl"',
  );
writeFileSync("_preview-calc.html", calc);
console.log("previews written");
