const fs = require('fs');
let s = fs.readFileSync('Mahjong.html', 'utf8');
const start = s.indexOf('<div class="space-y-4 pr-1">');
const end = s.indexOf('<!-- Payout Calculator Modal -->');
console.log('Indices:', start, end);

const newContent = `        <!-- Shared tile palette (fixed to bottom thumb zone) -->
        <div
          id="calc-palette"
          class="calc-palette hidden border-t border-ink/10 bg-parchment p-3"
        >
          <div class="flex items-center justify-between mb-2 px-2">
            <p class="label mb-0">Tile palette</p>
            <button
              type="button"
              onclick="clearCalcHand()"
              class="text-[10px] font-extrabold text-ink-mute uppercase tracking-wider"
              title="Clear hand"
            >
              Clear all
            </button>
          </div>
          <div class="flex items-center justify-between gap-2 px-2 mb-1">
            <button
              type="button"
              onclick="switchSuit('m')"
              class="calc-suit-btn active rounded-full border border-ink/10 px-3 py-1 text-[10px] font-extrabold text-ink-mute uppercase tracking-wider"
            >
              Manzu
            </button>
            <button
              type="button"
              onclick="switchSuit('p')"
              class="calc-suit-btn rounded-full border border-ink/10 px-3 py-1 text-[10px] font-extrabold text-ink-mute uppercase tracking-wider"
            >
              Pinzu
            </button>
            <button
              type="button"
              onclick="switchSuit('s')"
              class="calc-suit-btn rounded-full border border-ink/10 px-3 py-1 text-[10px] font-extrabold text-ink-mute uppercase tracking-wider"
            >
              Souzu
            </button>
            <button
              type="button"
              onclick="switchSuit('z')"
              class="calc-suit-btn rounded-full border border-ink/10 px-3 py-1 text-[10px] font-extrabold text-ink-mute uppercase tracking-wider"
            >
              Honors
            </button>
          </div>
          <div id="calc-palette-grid" class="calc-palette-grid px-2"></div>
        </div>

        <!-- Sticky live result bar -->
        <div
          id="calc-live-result"
          class="calc-live-result hidden rounded-2xl border border-ink/10 bg-white p-3 shadow-lg"
        >
          <div class="flex items-center justify-between gap-2 mb-1">
            <span id="calc-live-tier" class="font-bold text-jade-700 text-sm">—</span>
            <span id="calc-live-hanfu"
              class="text-[11px] font-extrabold text-ink-mute uppercase tracking-wider"
            >
              Han / Fu
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <span id="calc-live-points"
              class="font-display text-xl font-bold text-ink">0</span>
            <span id="calc-live-payments" class="text-xs text-ink-mute">—</span>
          </div>
          <button
            type="button"
            onclick="runCalculation()"
            class="text-[10px] font-extrabold text-jade-600 uppercase tracking-wider flex items-center gap-1"
            title="Recalculate"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Recalc
          </button>
        </div>

        <div class="space-y-4 pr-1">
          <!-- 1. Repeat sticks (honba) -->
          <div
            class="calc-section rounded-2xl border border-ink/10 bg-white p-4 space-y-3"
          >
            <div class="flex items-center justify-between cursor-pointer" onclick="setActiveTarget('honba')">
              <div class="flex items-center gap-2">
                <p class="calc-section-title label mb-0 flex items-center gap-1">Repeat sticks (honba)</p>
                <span class="calc-active-dot"></span>
              </div>
              <p class="text-[10px] font-semibold text-ink-mute">+300 ron · +100 per payer tsumo</p>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick="adjustHonba(-1)"
                aria-label="Remove one repeat stick"
                class="btn btn-soft h-8 w-8 p-0 text-sm font-bold"
              >
                −
              </button>
              <input
                type="number"
                id="calc-honba-value"
                value="0"
                min="0"
                max="30"
                class="field w-16 text-center py-1 text-sm font-bold"
              />
              <button
                type="button"
                onclick="adjustHonba(1)"
                aria-label="Add one repeat stick"
                class="btn btn-soft h-8 w-8 p-0 text-sm font-bold"
              >
                ＋
              </button>
            </div>
          </div>

          <!-- 2. Seat wind + 3. Table wind (segmented side-by-side) -->
          <div class="calc-section rounded-2xl border border-ink/10 bg-white p-4 space-y-3" id="winds-section">
            <div class="flex items-center justify-between cursor-pointer" onclick="setActiveTarget('winds')">
              <div class="flex items-center gap-2">
                <p class="calc-section-title label mb-0 flex items-center gap-1">Winds</p>
                <span class="calc-active-dot"></span>
              </div>
              <p class="text-[10px] font-semibold text-ink-mute">Seat · Table</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="min-w-0">
                <label class="label mb-1">Seat wind</label>
                <div class="calc-segmented" role="radiogroup" aria-label="Seat wind">
                  <button type="button" onclick="setWind(this,'1z')" class="calc-seg active" data-val="1z">東</button>
                  <button type="button" onclick="setWind(this,'2z')" class="calc-seg" data-val="2z">南</button>
                  <button type="button" onclick="setWind(this,'3z')" class="calc-seg" data-val="3z">西</button>
                  <button type="button" onclick="setWind(this,'4z')" class="calc-seg" data-val="4z">北</button>
                </div>
                <input type="hidden" id="calc-seatwind" value="1z" />
              </div>
              <div class="min-w-0">
                <label class="label mb-1">Table wind</label>
                <div class="calc-segmented" role="radiogroup" aria-label="Table wind">
                  <button type="button" onclick="setRoundWind(this,'1z')" class="calc-seg active" data-val="1z">東</button>
                  <button type="button" onclick="setRoundWind(this,'2z')" class="calc-seg" data-val="2z">南</button>
                  <button type="button" onclick="setRoundWind(this,'3z')" class="calc-seg" data-val="3z">西</button>
                  <button type="button" onclick="setRoundWind(this,'4z')" class="calc-seg" data-val="4z">北</button>
                </div>
                <input type="hidden" id="calc-roundwind" value="1z" />
              </div>
            </div>
          </div>

          <!-- 4. Dora indicators -->
          <div
            id="dora-section"
            class="calc-section rounded-2xl border border-ink/10 bg-white p-4 space-y-3"
          >
            <div class="flex items-center justify-between cursor-pointer" onclick="setActiveTarget('dora')">
              <div class="flex items-center gap-2">
                <p class="calc-section-title label mb-0 flex items-center gap-1">Dora indicators</p>
                <span class="calc-active-dot"></span>
              </div>
              <button type="button" onclick="clearDoraIndicators()" class="text-[10px] font-extrabold text-ink-mute uppercase tracking-wider px-2 py-1 rounded hover:bg-ink/5">Clear</button>
            </div>
            <div id="calc-dora-display" class="calc-tiles-row flex flex-wrap gap-1.5 items-start min-h-[3.2rem] rounded-xl border border-ink/10 bg-white p-2"></div>
            <input type="hidden" id="calc-dora" value="" />
          </div>

          <!-- 5. Melds (inline step) -->
          <div
            id="melds-section"
            class="calc-section rounded-2xl border border-ink/10 bg-white p-4 space-y-3"
          >
            <div class="flex items-center justify-between cursor-pointer" onclick="setActiveTarget('meld')">
              <div class="flex items-center gap-2">
                <p class="calc-section-title label mb-0 flex items-center gap-1">Melds</p>
                <span class="calc-active-dot"></span>
              </div>
              <button type="button" onclick="clearAllMelds()" class="text-[10px] font-extrabold text-ink-mute uppercase tracking-wider px-2 py-1 rounded hover:bg-ink/5">Clear</button>
            </div>
            <div id="calc-melds-list" class="flex flex-wrap gap-2 min-h-[4.2rem]">
              <span class="text-ink-mute italic text-xs pl-1">No melds — fully closed hand</span>
            </div>
            <div class="grid grid-cols-4 gap-2 mt-3">
              <button type="button" onclick="beginMeld('chi')" class="calc-meld-btn" title="Chi (run)">Chi</button>
              <button type="button" onclick="beginMeld('pon')" class="calc-meld-btn" title="Pon (triplet)">Pon</button>
              <button type="button" onclick="beginMeld('kan')" class="calc-meld-btn" title="Open Kan">Open Kan</button>
              <button type="button" onclick="beginMeld('closed_kan')" class="calc-meld-btn" title="Ankan (closed kan)">Ankan</button>
            </div>
            <div id="calc-meld-hint" class="text-[11px] text-ink-mute italic mt-1.5"></div>
          </div>

          <!-- 6. Hand tiles (with win tile) -->
          <div
            id="hand-section"
            class="calc-section rounded-2xl border border-ink/10 bg-white p-4 space-y-3"
          >
            <div class="flex items-center justify-between cursor-pointer" onclick="setActiveTarget('hand')">
              <div class="flex items-center gap-2">
                <p class="calc-section-title label mb-0 flex items-center gap-1">Hand tiles</p>
                <span class="calc-active-dot"></span>
              </div>
              <button type="button" onclick="clearCalcHand()" class="text-[10px] font-extrabold text-ink-mute uppercase tracking-wider px-2 py-1 rounded hover:bg-ink/5">Clear</button>
            </div>
            <div id="calc-hand-display" class="calc-tiles-row flex flex-wrap gap-1.5 items-start min-h-[3.2rem] rounded-xl border border-ink/10 bg-white p-2">
              <span id="calc-hand-placeholder" class="text-xs text-ink-mute italic pl-1 leading-9">Tap tiles to build your hand…</span>
            </div>
            <input type="hidden" id="calc-hand" value="" />
            <div class="flex items-center gap-2 mt-2">
              <span id="calc-hand-count" class="text-xs font-bold text-ink-mute">0 tiles</span>
              <div id="calc-wintile-display" class="w-10 h-10 flex items-center justify-center rounded-xl border border-ink/20 bg-white shadow-xs text-[8px] font-bold text-ink-mute uppercase tracking-wider" title="Win tile (auto-set when hand is complete)">Win</div>
              <input type="hidden" id="calc-wintile" value="" />
            </div>
          </div>

          <!-- 7. Win type (Ron / Tsumo toggle) -->
          <div
            class="calc-section rounded-2xl border border-ink/10 bg-white p-4 space-y-3"
          >
            <div class="flex items-center justify-between">
              <p class="calc-section-title label mb-0">Win type</p>
            </div>
            <div class="calc-segmented calc-toggle-2" role="radiogroup" aria-label="Win type">
              <button type="button" onclick="setWinType(this,'ron')" class="calc-seg active" data-val="ron">Ron</button>
              <button type="button" onclick="setWinType(this,'tsumo')" class="calc-seg" data-val="tsumo">Tsumo</button>
            </div>
            <input type="hidden" id="calc-wintype" value="ron" />
          </div>

          <!-- 8. Special hand flags (toggle chips, wrapping) -->
          <div
            class="calc-section rounded-2xl border border-ink/10 bg-white p-4 space-y-3"
          >
            <div class="flex items-center justify-between">
              <p class="calc-section-title label mb-0">Special hand flags</p>
            </div>
            <div class="calc-flag-grid flex flex-wrap gap-2" id="calc-flags-grid">
              <label class="calc-chip">
                <input type="checkbox" id="calc-riichi" onchange="handleFlagChange()" />
                <span class="calc-chip-label">Riichi</span>
              </label>
              <label class="calc-chip">
                <input type="checkbox" id="calc-doubleriichi" onchange="handleFlagChange()" />
                <span class="calc-chip-label">Double Riichi</span>
              </label>
              <label class="calc-chip">
                <input type="checkbox" id="calc-ippatsu" onchange="handleFlagChange()" />
                <span class="calc-chip-label">Ippatsu</span>
              </label>
              <label class="calc-chip">
                <input type="checkbox" id="calc-afterkan" onchange="handleFlagChange()" />
                <span class="calc-chip-label">After Kan (Rinshan)</span>
              </label>
              <label class="calc-chip">
                <input type="checkbox" id="calc-robbingkan" onchange="handleFlagChange()" />
                <span class="calc-chip-label">Robbing Kan (Chankan)</span>
              </label>
              <label class="calc-chip">
                <input type="checkbox" id="calc-lasttile" onchange="handleFlagChange()" />
                <span class="calc-chip-label">Haitei / Houtei</span>
              </label>
              <label class="calc-chip">
                <input type="checkbox" id="calc-tenhou" onchange="handleFlagChange()" />
                <span class="calc-chip-label">Tenhou</span>
              </label>
              <label class="calc-chip">
                <input type="checkbox" id="calc-chiihou" onchange="handleFlagChange()" />
                <span class="calc-chip-label">Chiihou</span>
              </label>
              <label class="calc-chip">
                <input type="checkbox" id="calc-nagashi" onchange="handleFlagChange()" title="Optional table rule: ten tiles of every kind in your river at the round's end" />
                <span class="calc-chip-label">Nagashi Mangan</span>
              </label>
            </div>
          </div>

          <!-- Sanma-only settings -->
          <div id="calc-sanma-settings" class="hidden rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <label class="label mb-1" for="calc-nukidora-value">Nukidora (declare North à 1 han)</label>
                <div class="flex items-center gap-2">
                  <button type="button" onclick="adjustNukidora(-1)" aria-label="Remove one nukidora" class="btn btn-soft h-8 w-8 p-0 text-sm">−</button>
                  <input type="number" id="calc-nukidora-value" value="0" min="0" max="4" class="field w-16 text-center py-1 text-sm font-bold" />
                  <button type="button" onclick="adjustNukidora(1)" aria-label="Add one nukidora" class="btn btn-soft h-8 w-8 p-0 text-sm">＋</button>
                </div>
              </div>
              <div class="min-w-0">
                <label class="label mb-1" for="calc-ron-split">Ron payment (double ron)</label>
                <select id="calc-ron-split" class="field px-3 py-2 text-sm min-w-[14rem]">
                  <option value="all">Both losers pay (double ron)</option>
                  <option value="headbump">Head bump — closest loser only</option>
                </select>
              </div>
            </div>
            <div>
              <label class="label mb-1" for="calc-tsumo-loss">Missing 4th seat on tsumo</label>
              <select id="calc-tsumo-loss" class="field px-3 py-2 text-sm w-full">
                <option value="skip">Tsumo loss — not paid (Tenhou default)</option>
                <option value="redistribute">Redistribute — share split between the two payers</option>
              </select>
            </div>
          </div>

          <div id="calc-output" class="hidden mt-4 rounded-2xl border border-ink/10 bg-white p-4 space-y-2 text-sm"></div>
        </div>`;

fs.writeFileSync('Mahjong.html', s.slice(0, start) + newContent + s.slice(end));
console.log('Successfully updated Mahjong.html via update.js!');
