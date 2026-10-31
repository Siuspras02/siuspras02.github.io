const TILE_FACES = {
  "1m": { sym: "🀇", color: "text-amber-800" },
  "2m": { sym: "🀈", color: "text-amber-800" },
  "3m": { sym: "🀉", color: "text-amber-800" },
  "4m": { sym: "🀊", color: "text-amber-800" },
  "0m": { sym: "🀋", color: "text-red-600" },
  "5m": { sym: "🀋", color: "text-amber-800" },
  "6m": { sym: "🀌", color: "text-amber-800" },
  "7m": { sym: "🀍", color: "text-amber-800" },
  "8m": { sym: "🀎", color: "text-amber-800" },
  "9m": { sym: "🀏", color: "text-amber-800" },

  "1p": { sym: "🀙", color: "text-blue-700" },
  "2p": { sym: "🀚", color: "text-blue-700" },
  "3p": { sym: "🀛", color: "text-blue-700" },
  "4p": { sym: "🀜", color: "text-blue-700" },
  "0p": { sym: "🀝", color: "text-red-600" },
  "5p": { sym: "🀝", color: "text-blue-700" },
  "6p": { sym: "🀞", color: "text-blue-700" },
  "7p": { sym: "🀟", color: "text-blue-700" },
  "8p": { sym: "🀠", color: "text-blue-700" },
  "9p": { sym: "🀡", color: "text-blue-700" },

  "1s": { sym: "🀐", color: "text-emerald-800" },
  "2s": { sym: "🀑", color: "text-emerald-800" },
  "3s": { sym: "🀒", color: "text-emerald-800" },
  "4s": { sym: "🀓", color: "text-emerald-800" },
  "0s": { sym: "🀔", color: "text-red-600" },
  "5s": { sym: "🀔", color: "text-emerald-800" },
  "6s": { sym: "🀕", color: "text-emerald-800" },
  "7s": { sym: "🀖", color: "text-emerald-800" },
  "8s": { sym: "🀗", color: "text-emerald-800" },
  "9s": { sym: "🀘", color: "text-emerald-800" },

  "1z": { sym: "東", color: "text-slate-800" },
  "2z": { sym: "南", color: "text-slate-800" },
  "3z": { sym: "西", color: "text-slate-800" },
  "4z": { sym: "北", color: "text-slate-800" },
  "5z": { sym: "白", color: "text-blue-700" },
  "6z": { sym: "發", color: "text-emerald-600" },
  "7z": { sym: "中", color: "text-red-600" },
};

import { calculateScore } from "./riichi/score.js";
window.RiichiScore = { calculateScore };
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const _p = ["0", "2", "0", "2"];

const WINDS = ["East", "South", "West", "North"];
const WIND_BADGES = {
  East: {
    bg: "bg-red-50 border border-red-200",
    text: "text-red-700",
    label: "East · Dealer",
    kanji: "東",
  },
  South: {
    bg: "bg-jade-50 border border-jade-200",
    text: "text-jade-700",
    label: "South",
    kanji: "南",
  },
  West: {
    bg: "bg-indigo-50 border border-indigo-200",
    text: "text-indigo-700",
    label: "West",
    kanji: "西",
  },
  North: {
    bg: "bg-slate-100 border border-slate-200",
    text: "text-slate-600",
    label: "North",
    kanji: "北",
  },
};

function getPlayerWind(playerIndex, dealerIndex, totalPlayers) {
  const relativePos = (playerIndex - dealerIndex + totalPlayers) % totalPlayers;
  return WINDS[relativePos];
}

const appId = typeof __app_id !== "undefined" ? __app_id : "mahjong-tracker-v1";
let firebaseConfig = {
  apiKey: "AIzaSyD7J9TzZ5vrAD4nr29gX2xk-HwTQPTnYKg",
  authDomain: "mahjong-a5267.firebaseapp.com",
  projectId: "mahjong-a5267",
  storageBucket: "mahjong-a5267.firebasestorage.app",
  messagingSenderId: "379699137048",
  appId: "1:379699137048:web:8d2c997bb7fbba87d1116d",
  measurementId: "G-5SJV6D4R91",
};

let app, auth, db, currentUser;
let currentRoomCode = null;
let unsubscribeRoom = null;
let localRoomState = null;
let currentMelds = [];
let pendingMeldType = null;
let pendingMeldTiles = [];
let lastCalcResult = null;

const DOM = {
  lobby: document.getElementById("lobby-section"),
  setup: document.getElementById("setup-section"),
  game: document.getElementById("game-section"),
  scoreDashboard: document.getElementById("score-dashboard"),
  inputContainer: document.getElementById("input-container"),
  historyHeader: document.getElementById("history-header"),
  historyBody: document.getElementById("history-body"),
  sumIndicator: document.getElementById("sum-indicator"),
  submitBtn: document.getElementById("submit-btn"),
  displayRoomCode: document.getElementById("display-room-code"),
  roundCount: document.getElementById("round-count"),
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
};
window.openPayoutCalculator = openPayoutCalculator;
window.closePayoutCalculator = closePayoutCalculator;
window.verifyToPin = verifyToPin;
window.updatePayoutCalc = updatePayoutCalc;
window.adjustPlayers = adjustPlayers;

async function init() {
  try {
    if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
      updateStatus(false, "Config Missing");
      return;
    }

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
      await signInWithCustomToken(auth, __initial_auth_token);
    } else {
      await signInAnonymously(auth);
    }

    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        updateStatus(true, "Online");
      } else {
        updateStatus(false, "Offline");
      }
    });

    window.showSetup = () => {
      DOM.lobby.classList.add("hidden");
      DOM.setup.classList.remove("hidden");
    };
    window.cancelSetup = () => {
      DOM.setup.classList.add("hidden");
      DOM.lobby.classList.remove("hidden");
    };
    window.createRoom = handleCreateRoom;
    window.joinRoom = handleJoinRoom;
    window.submitRound = handleSubmitRound;
    window.clearInputs = clearInputs;
    window.leaveRoomPrompt = handleLeaveRoom;
    window.undoPrompt = handleUndo;
    window.openCalculator = handleOpenCalculator;
    window.toggleGameMode = handleToggleGameMode;
    window.declareRiichi = handleDeclareRiichi;
    window.claimPot = handleClaimPot;
    window.validateSum = validateSum;
    window.copyRoomCode = copyRoomCode;

    window.openPayoutCalculator = openPayoutCalculator;
    window.closePayoutCalculator = closePayoutCalculator;
    window.verifyToPin = verifyToPin;
    window.updatePayoutCalc = updatePayoutCalc;
    window.adjustPlayers = adjustPlayers;

    updatePayoutCalc();
    initAutoCalculation();
  } catch (err) {
    console.error("Init Error:", err);
    updateStatus(false, "Connection Error");
  }
}

function openPayoutCalculator() {
  document.getElementById("payout-modal").classList.remove("hidden");
  document.getElementById("to-pin-screen").classList.remove("hidden");
  document.getElementById("to-calc-content").classList.add("hidden");
  document.getElementById("to-pin-input").value = "";
}

function verifyToPin() {
  const inputField = document.getElementById("to-pin-input");
  const enteredPin = inputField.value.trim();
  if (!enteredPin) return;

  const correctPin = _p.join("");
  if (enteredPin === correctPin) {
    document.getElementById("to-pin-screen").classList.add("hidden");
    document.getElementById("to-calc-content").classList.remove("hidden");
    updatePayoutCalc();
  } else {
    showModal("Incorrect PIN", "The code you entered is incorrect.", "error");
    inputField.value = "";
  }
}

function closePayoutCalculator() {
  document.getElementById("payout-modal").classList.add("hidden");
}

function adjustPlayers(delta) {
  const input = document.getElementById("calc-players");
  let val = parseInt(input.value) || 4;

  if (val === 4 && delta === -1) {
    val = 3;
  } else if (val === 3 && delta === 1) {
    val = 4;
  } else if (val === 4 && delta === 1) {
    val = 6;
  } else if (val === 6 && delta === -1) {
    val = 4;
  } else {
    val += delta;
  }

  input.value = val;
  updatePayoutCalc();
}

function updatePayoutCalc() {
  const input = document.getElementById("calc-players");
  let players = parseInt(input.value) || 4;

  if (players === 5) players = 6;
  if (players < 3) players = 3;
  if (players > 12) players = 12;

  input.value = players;

  document.getElementById("btn-minus-player").style.visibility =
    players <= 3 ? "hidden" : "visible";
  document.getElementById("btn-plus-player").style.visibility =
    players >= 12 ? "hidden" : "visible";

  const totalIn = players * 50000;
  const tableFund = players * 22500;
  const storeCut = players * 7500;
  const prizePool = players * 20000;

const predefined = {
    3: [30000, 20000, 10000], 
    4: [35000, 25000, 15000, 5000],
    6: [50000, 35000, 20000, 15000],
    7: [60000, 40000, 25000, 15000],
    8: [70000, 45000, 30000, 15000],
    9: [70000, 45000, 35000, 20000, 10000],
    10: [75000, 50000, 35000, 25000, 15000],
    11: [75000, 50000, 40000, 25000, 20000, 10000],
    12: [75000, 55000, 42000, 32000, 22000, 14000],
  };

  let payouts = predefined[players];
  let payoutHTML = "";

  if (payouts) {
    payouts.forEach((amount, index) => {
      payoutHTML += `
        <div class="flex items-center justify-between rounded-xl border border-ink/10 bg-white px-4 py-2.5">
          <span class="flex items-center gap-2 text-sm font-bold text-ink-soft">
            <span class="grid h-6 w-6 place-items-center rounded-md bg-jade-50 text-[11px] font-extrabold text-jade-700">${index + 1}</span>
            Place ${index + 1}
          </span>
          <span class="font-extrabold tabular-nums text-jade-700">${amount.toLocaleString()} SC</span>
        </div>
      `;
    });
  }

  const resultsDiv = document.getElementById("calc-results");
  if (resultsDiv) {
    resultsDiv.innerHTML = `
      <div class="mb-6 space-y-3 rounded-2xl border border-ink/10 bg-white p-5">
        <div class="flex items-center justify-between text-sm">
          <span class="font-semibold text-ink-mute">Total event cash</span>
          <span class="text-lg font-extrabold tabular-nums text-ink">Rp ${totalIn.toLocaleString()}</span>
        </div>
        <hr class="border-ink/10">
        <div class="flex items-center justify-between text-sm">
          <span class="font-semibold text-ink-mute">Table fund <span class="text-ink-mute">45%</span></span>
          <span class="font-extrabold tabular-nums text-jade-700">Rp ${tableFund.toLocaleString()}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="font-semibold text-ink-mute">LGS cut <span class="text-ink-mute">15%</span></span>
          <span class="font-extrabold tabular-nums text-gold-600">Rp ${storeCut.toLocaleString()}</span>
        </div>
      </div>

      <div class="mb-3 flex items-center justify-between">
        <h4 class="font-display text-lg font-semibold text-ink">Prize pool</h4>
        <span class="font-extrabold tabular-nums text-jade-700">${prizePool.toLocaleString()} SC</span>
      </div>
      <div class="space-y-2">
        ${payoutHTML}
      </div>
    `;
  }
}

function copyRoomCode() {
  if (!currentRoomCode) return;
  const btn = document.getElementById("copy-room-btn");
  const showCopied = () => {
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-jade-600">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>`;
    btn.setAttribute("aria-label", "Room code copied");
    setTimeout(() => {
      btn.innerHTML = original;
      btn.setAttribute("aria-label", "Copy room code");
    }, 1500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentRoomCode).then(showCopied);
  }
}

function updateStatus(isOnline, text) {
  DOM.statusText.textContent = text;
  if (isOnline) {
    DOM.statusDot.className = "h-2 w-2 rounded-full bg-jade-500 pulse-dot";
    DOM.statusText.className = "text-jade-700";
  } else {
    DOM.statusDot.className = "h-2 w-2 rounded-full bg-red-500";
    DOM.statusText.className = "text-red-700";
  }
}

function showModal(title, message, type = "info", onConfirm = null) {
  const overlay = document.getElementById("modal-overlay");
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-message").textContent = message;

  const icon = document.getElementById("modal-icon");
  const cancelBtn = document.getElementById("modal-cancel-btn");
  const confirmBtn = document.getElementById("modal-confirm-btn");

  icon.className =
    "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl";
  confirmBtn.className = "btn flex-1 px-4 py-3 text-sm text-white shadow-md";
  cancelBtn.className = "btn btn-soft flex-1 px-4 py-3 text-sm";

  if (type === "error") {
    icon.classList.add("bg-red-100", "text-red-700");
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    confirmBtn.classList.add("bg-red-600", "hover:bg-red-700");
    cancelBtn.classList.add("hidden");
  } else if (type === "confirm") {
    icon.classList.add("bg-amber-100", "text-amber-600");
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    confirmBtn.classList.add("bg-amber-500", "hover:bg-amber-600");
    cancelBtn.classList.remove("hidden");
  } else {
    icon.classList.add("bg-jade-100", "text-jade-700");
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    confirmBtn.classList.add("btn-primary");
    cancelBtn.classList.add("hidden");
  }

  overlay.classList.remove("hidden");

  confirmBtn.onclick = () => {
    overlay.classList.add("hidden");
    if (onConfirm) onConfirm();
  };
  cancelBtn.onclick = () => overlay.classList.add("hidden");
}

function handleToggleGameMode() {
  const mode = document.querySelector('input[name="gameMode"]:checked').value;
  const p4Wrap = document.getElementById("setup-p4-wrap");
  const startScoreInput = document.getElementById("setup-start-score");

  if (mode === "3") {
    p4Wrap.classList.add("hidden");
    startScoreInput.value = "35000";
  } else {
    p4Wrap.classList.remove("hidden");
    startScoreInput.value = "25000";
  }
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function handleCreateRoom() {
  if (!currentUser)
    return showModal("Error", "Not connected to server.", "error");

  const mode = document.querySelector('input[name="gameMode"]:checked').value;
  const numPlayers = parseInt(mode);
  const startScore =
    parseInt(document.getElementById("setup-start-score").value) ||
    (numPlayers === 3 ? 35000 : 25000);

  const players = [];
  for (let i = 1; i <= numPlayers; i++) {
    const name =
      document.getElementById(`setup-p${i}`).value.trim() || `Player ${i}`;
    players.push({ id: `p${i}`, name: name, currentScore: startScore });
  }

  const btn = document.getElementById("create-btn");
  btn.disabled = true;
  btn.innerHTML = "Creating...";

  try {
    let code;
    let isUnique = false;
    let roomRef;

    while (!isUnique) {
      code = generateRoomCode();
      roomRef = doc(db, "artifacts", appId, "public", "data", "rooms", code);
      const docSnap = await getDoc(roomRef);
      if (!docSnap.exists()) isUnique = true;
    }

    const initialData = {
      createdAt: new Date().toISOString(),
      startingScore: startScore,
      players: players,
      dealerIndex: 0,
      pot: 0,
      history: [],
    };

    await setDoc(roomRef, initialData);
    DOM.setup.classList.add("hidden");
    enterRoom(code);
  } catch (err) {
    console.error("Create room error:", err);
    showModal("Error", "Failed to create room.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Start Match";
  }
}

async function handleJoinRoom() {
  if (!currentUser)
    return showModal("Error", "Not connected to server.", "error");

  const codeInput = document
    .getElementById("join-room-code")
    .value.toUpperCase()
    .trim();
  if (codeInput.length !== 4) {
    return showModal(
      "Invalid Code",
      "Please enter a 4-letter room code.",
      "error",
    );
  }

  try {
    const roomRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "rooms",
      codeInput,
    );
    const docSnap = await getDoc(roomRef);

    if (docSnap.exists()) {
      enterRoom(codeInput);
    } else {
      showModal(
        "Not Found",
        `No active room found with code ${codeInput}.`,
        "error",
      );
    }
  } catch (err) {
    console.error("Join room error:", err);
    showModal("Error", "Failed to join room.", "error");
  }
}

function enterRoom(code) {
  currentRoomCode = code;
  DOM.lobby.classList.add("hidden");
  DOM.game.classList.remove("hidden");
  DOM.displayRoomCode.textContent = code;

  const roomRef = doc(db, "artifacts", appId, "public", "data", "rooms", code);

  unsubscribeRoom = onSnapshot(
    roomRef,
    (docSnap) => {
      if (docSnap.exists()) {
        localRoomState = docSnap.data();
        renderGameUI();
      } else {
        showModal(
          "Room Closed",
          "This room has been deleted or closed.",
          "error",
          handleLeaveRoom,
        );
      }
    },
    (error) => {
      console.error("Snapshot error:", error);
      showModal("Sync Error", "Lost connection to the room.", "error");
    },
  );
}

function handleLeaveRoom() {
  showModal(
    "Leave Room?",
    "Are you sure you want to exit? You can rejoin later using the code.",
    "confirm",
    () => {
      if (unsubscribeRoom) {
        unsubscribeRoom();
        unsubscribeRoom = null;
      }
      currentRoomCode = null;
      localRoomState = null;
      DOM.game.classList.add("hidden");
      DOM.lobby.classList.remove("hidden");
      document.getElementById("join-room-code").value = "";
    },
  );
}

async function handleDeclareRiichi(playerId) {
  if (!currentUser || !currentRoomCode || !localRoomState) return;

  const deltas = { [playerId]: -1000, pot: 1000 };
  const updatedPlayers = localRoomState.players.map((p) => {
    if (p.id === playerId) return { ...p, currentScore: p.currentScore - 1000 };
    return p;
  });
  const updatedPot = (localRoomState.pot || 0) + 1000;

  const player = localRoomState.players.find((p) => p.id === playerId);
  const newRecord = {
    timestamp: new Date().toISOString(),
    deltas: deltas,
    note: `🔴 ${player.name} Riichi`,
  };

  const updatedHistory = [...localRoomState.history, newRecord];

  try {
    const roomRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "rooms",
      currentRoomCode,
    );
    await updateDoc(roomRef, {
      players: updatedPlayers,
      pot: updatedPot,
      history: updatedHistory,
    });
  } catch (err) {
    console.error(err);
    showModal("Error", "Failed to declare Riichi.", "error");
  }
}

function handleClaimPot(playerId) {
  if (!localRoomState || !localRoomState.pot) {
    return showModal("Notice", "The pot is currently empty.");
  }

  const potAmount = localRoomState.pot;
  const player = localRoomState.players.find((p) => p.id === playerId);

  showModal(
    "Claim Pot",
    `Give ${potAmount.toLocaleString()} points from the Pot to ${player.name}?`,
    "confirm",
    async () => {
      const deltas = { [playerId]: potAmount, pot: -potAmount };
      const updatedPlayers = localRoomState.players.map((p) => {
        if (p.id === playerId)
          return { ...p, currentScore: p.currentScore + potAmount };
        return p;
      });

      const newRecord = {
        timestamp: new Date().toISOString(),
        deltas: deltas,
        note: `🏆 ${player.name} claimed Pot`,
      };
      const updatedHistory = [...localRoomState.history, newRecord];

      try {
        const roomRef = doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "rooms",
          currentRoomCode,
        );
        await updateDoc(roomRef, {
          players: updatedPlayers,
          pot: 0,
          history: updatedHistory,
        });
      } catch (err) {
        console.error(err);
        showModal("Error", "Failed to claim pot.", "error");
      }
    },
  );
}

function renderGameUI() {
  if (!localRoomState) return;
  const players = localRoomState.players;
  const history = localRoomState.history;
  const currentPot = localRoomState.pot || 0;

  const gridClass =
    players.length === 3 ? "player-grid player-grid--three" : "player-grid";
  DOM.scoreDashboard.className = gridClass;
  DOM.inputContainer.className = `${gridClass} mt-6`;

  let dashHTML = `
          <div class="relative col-span-full mb-2 overflow-hidden rounded-2xl bg-felt p-5 text-white shadow-lift sm:p-6">
            <div class="relative flex items-center justify-between gap-4">
              <div>
                <p class="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/70">Table pot</p>
                <p class="text-xs text-white/65">Riichi sticks in play</p>
              </div>
              <div class="text-right">
                <span class="font-display text-3xl font-semibold tabular-nums text-gold-200">${currentPot.toLocaleString()}</span>
                <span class="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">points</span>
              </div>
            </div>
          </div>
        `;

  const maxScore = Math.max(...players.map((p) => p.currentScore));
  const dealerIndex = localRoomState.dealerIndex || 0;

  players.forEach((p, idx) => {
    const isLeader =
      p.currentScore === maxScore &&
      p.currentScore > localRoomState.startingScore;
    const scoreColor =
      p.currentScore < 0
        ? "text-red-700"
        : isLeader
          ? "text-gold-600"
          : "text-ink";
    const diff = p.currentScore - localRoomState.startingScore;
    const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? "0" : `${diff}`;
    const diffChip =
      diff > 0
        ? "border-jade-200 bg-jade-50 text-jade-700"
        : diff < 0
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-ink/10 bg-ink/5 text-ink-mute";

    const wind = getPlayerWind(idx, dealerIndex, players.length);
    const badge = WIND_BADGES[wind];
    const cardClass = isLeader
      ? "leader-card relative flex flex-col overflow-hidden rounded-2xl p-4 sm:p-5"
      : "card-surface relative flex flex-col overflow-hidden rounded-2xl p-4 transition-shadow hover:shadow-lift sm:p-5";

    dashHTML += `
            <div class="${cardClass}">
              <div class="relative z-10 flex items-center justify-between gap-2">
                <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${badge.bg} ${badge.text}">
                  <span class="font-display text-[13px] leading-none">${badge.kanji}</span>
                  ${badge.label}
                </span>
              </div>
              <p class="relative z-10 mt-3 truncate text-sm font-bold text-ink-soft">${p.name}</p>
              <p class="font-display relative z-10 mt-0.5 text-3xl font-semibold tabular-nums tracking-tight ${scoreColor}">${p.currentScore.toLocaleString()}</p>
              <span class="relative z-10 mt-2 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${diffChip}">
                Net ${diffStr}
              </span>
              <div class="relative z-10 mt-4 flex gap-2">
                <button onclick="declareRiichi('${p.id}')" class="flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-100">Riichi</button>
                <button onclick="claimPot('${p.id}')" class="flex flex-1 items-center justify-center gap-1 rounded-xl border border-jade-200 bg-jade-50 px-2 py-2 text-xs font-bold text-jade-700 transition-colors hover:bg-jade-100">Win pot</button>
              </div>
            </div>
          `;
  });
  DOM.scoreDashboard.innerHTML = dashHTML;
  if (DOM.roundCount) DOM.roundCount.textContent = history.length;

  if (DOM.inputContainer.children.length !== players.length) {
    let inputHTML = "";
    players.forEach((p, idx) => {
      const wind = getPlayerWind(idx, dealerIndex, players.length);
      const badge = WIND_BADGES[wind];
      inputHTML += `
              <div>
                <label data-input-label="${p.id}" for="input-${p.id}" class="mb-2 flex items-center gap-2 text-sm font-bold text-ink-soft">
                  <span class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-jade-50 text-[11px] font-extrabold text-jade-700">${badge.kanji}</span>
                  <span class="truncate">${p.name}</span>
                </label>
                <div class="relative">
                  <input type="number" id="input-${p.id}" oninput="window.validateSum()" placeholder="0" class="field score-input py-3 pr-12 text-center text-lg font-bold tabular-nums">
                  <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-extrabold uppercase text-ink-mute">pts</span>
                </div>
              </div>
            `;
    });
    DOM.inputContainer.innerHTML = inputHTML;
  }

  let headerHTML = `<th class="w-14 px-4 py-4 text-center font-extrabold">#</th>`;
  players.forEach((p) => {
    headerHTML += `<th class="px-4 py-4 text-right font-extrabold">${p.name}</th>`;
  });
  headerHTML += `<th class="px-4 py-4 text-right font-extrabold text-jade-700">Pot</th><th class="px-6 py-4 text-left font-extrabold">Note</th>`;
  DOM.historyHeader.innerHTML = headerHTML;

  let bodyHTML = "";
  if (history.length === 0) {
    bodyHTML = `<tr><td colspan="7" class="px-6 py-14 text-center text-ink-mute">No rounds recorded yet</td></tr>`;
  } else {
    [...history].reverse().forEach((record, index) => {
      const roundNum = history.length - index;
      let rowHTML = `<tr><td class="px-4 py-3 text-center"><span class="inline-grid h-7 w-7 place-items-center rounded-lg bg-ink/5 text-[11px] font-extrabold text-ink-mute">${roundNum}</span></td>`;
      players.forEach((p) => {
        const delta = record.deltas[p.id] || 0;
        const colorClass =
          delta > 0
            ? "bg-jade-50 text-jade-700"
            : delta < 0
              ? "bg-red-50 text-red-700"
              : "text-ink-mute";
        rowHTML += `<td class="px-4 py-3 text-right"><span class="inline-block rounded-lg px-2 py-1 text-sm font-bold tabular-nums ${colorClass}">${delta === 0 ? "–" : (delta > 0 ? "+" : "") + delta.toLocaleString()}</span></td>`;
      });
      rowHTML += `<td class="border-l border-ink/5 px-4 py-3 text-right text-xs text-ink-mute">${record.deltas.pot || "–"}</td><td class="px-6 py-3 text-left text-xs font-medium text-ink-mute">${record.note || "–"}</td></tr>`;
      bodyHTML += rowHTML;
    });
  }
  DOM.historyBody.innerHTML = bodyHTML;
}

function validateSum() {
  if (!localRoomState) return;
  let sum = 0;
  let hasInput = false;

  localRoomState.players.forEach((p) => {
    const val = document.getElementById(`input-${p.id}`)?.value;
    if (val !== undefined && val !== "") {
      sum += parseInt(val) || 0;
      hasInput = true;
    }
  });

  DOM.sumIndicator.textContent = `Sum: ${sum}`;
  if (!hasInput) {
    DOM.sumIndicator.className =
      "rounded-xl border-2 border-ink/10 bg-white px-5 py-2.5 text-lg font-extrabold tabular-nums text-ink-mute transition-colors";
    DOM.submitBtn.disabled = true;
    DOM.submitBtn.classList.add("opacity-50", "cursor-not-allowed");
  } else if (sum === 0) {
    DOM.sumIndicator.className =
      "rounded-xl border-2 border-jade-200 bg-jade-50 px-5 py-2.5 text-lg font-extrabold tabular-nums text-jade-700 transition-colors";
    DOM.submitBtn.disabled = false;
    DOM.submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
  } else {
    DOM.sumIndicator.className =
      "rounded-xl border-2 border-red-100 bg-red-50 px-5 py-2.5 text-lg font-extrabold tabular-nums text-red-700 transition-colors";
    DOM.submitBtn.disabled = true;
    DOM.submitBtn.classList.add("opacity-50", "cursor-not-allowed");
  }
}

function clearInputs() {
  if (!localRoomState) return;
  localRoomState.players.forEach((p) => {
    const el = document.getElementById(`input-${p.id}`);
    if (el) el.value = "";
  });
  const noteInput = document.getElementById("input-note");
  if (noteInput) noteInput.value = "";
  validateSum();
}

async function handleSubmitRound() {
  if (!currentUser || !currentRoomCode || !localRoomState) return;
  const deltas = {};
  let sum = 0;

  localRoomState.players.forEach((p) => {
    const val = parseInt(document.getElementById(`input-${p.id}`).value) || 0;
    deltas[p.id] = val;
    sum += val;
  });

  if (sum !== 0)
    return showModal("Error", "Sum of points must be exactly 0.", "error");

  const currentDealerIdx = localRoomState.dealerIndex || 0;
  const currentDealer = localRoomState.players[currentDealerIdx];
  const dealerDelta = deltas[currentDealer.id] || 0;

  let nextDealerIdx = currentDealerIdx;
  if (dealerDelta <= 0) {
    nextDealerIdx = (currentDealerIdx + 1) % localRoomState.players.length;
  }

  const updatedPlayers = localRoomState.players.map((p) => ({
    ...p,
    currentScore: p.currentScore + deltas[p.id],
  }));

  const noteVal = document.getElementById("input-note").value.trim();
  const newHistoryRecord = {
    timestamp: new Date().toISOString(),
    deltas: deltas,
    prevDealerIndex: currentDealerIdx,
    note: noteVal,
  };

  const updatedHistory = [...localRoomState.history, newHistoryRecord];
  DOM.submitBtn.disabled = true;

  try {
    const roomRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "rooms",
      currentRoomCode,
    );
    await updateDoc(roomRef, {
      players: updatedPlayers,
      dealerIndex: nextDealerIdx,
      history: updatedHistory,
    });
    clearInputs();
  } catch (err) {
    console.error("Submit error:", err);
    showModal("Error", "Failed to submit round.", "error");
  } finally {
    DOM.submitBtn.disabled = false;
    validateSum();
  }
}

function handleUndo() {
  if (!localRoomState || localRoomState.history.length === 0) {
    return showModal("Notice", "No rounds to undo.");
  }

  showModal(
    "Undo Round",
    "Are you sure you want to delete the last recorded round?",
    "confirm",
    async () => {
      try {
        const lastRecord =
          localRoomState.history[localRoomState.history.length - 1];
        const deltasToRevert = lastRecord.deltas;

        const revertedPlayers = localRoomState.players.map((p) => ({
          ...p,
          currentScore: p.currentScore - (deltasToRevert[p.id] || 0),
        }));

        const revertedPot =
          (localRoomState.pot || 0) - (deltasToRevert.pot || 0);
        const revertedHistory = localRoomState.history.slice(0, -1);
        const revertedDealerIndex =
          lastRecord.prevDealerIndex !== undefined
            ? lastRecord.prevDealerIndex
            : localRoomState.dealerIndex || 0;

        const roomRef = doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "rooms",
          currentRoomCode,
        );
        await updateDoc(roomRef, {
          players: revertedPlayers,
          dealerIndex: revertedDealerIndex,
          pot: revertedPot,
          history: revertedHistory,
        });
      } catch (err) {
        console.error("Undo error:", err);
        showModal("Error", "Failed to undo round.", "error");
      }
    },
  );
}

function handleOpenCalculator() {
  window.open("https://riichi.onecomp.one/#/calculator", "_blank");
}

window.openCalculatorModal = () => {
  document.getElementById("calculator-modal").classList.remove("hidden");
  initTilePicker();
  renderHandTiles();
  renderMelds();
  renderDoraTiles();
  runCalculation();
};

window.closeCalculatorModal = () => {
  document.getElementById("calculator-modal").classList.add("hidden");
};

// SINGLE UNIFIED score calculation function
// SINGLE UNIFIED score calculation function
window.runCalculation = () => {
  const out = document.getElementById("calc-output");
  if (!out) return;

  try {
    const rawHand = document
      .getElementById("calc-hand")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const winTileRaw = document
      .getElementById("calc-wintile")
      .value.trim();
    const winType = document.getElementById("calc-wintype").value;
    const seatWind = document.getElementById("calc-seatwind").value;
    const roundWind = document.getElementById("calc-roundwind").value;

    const meldCount =
      typeof currentMelds !== "undefined" ? currentMelds.length : 0;
    const expectedHandSize = 14 - 3 * meldCount;

    if (rawHand.length < expectedHandSize) {
      out.classList.add("hidden");
      return;
    }

    const hand = [...rawHand];
    const winTile = winTileRaw || hand[hand.length - 1];

    const melds = (currentMelds || []).map((m) => ({
      ...m,
      tiles: [...m.tiles],
    }));

    const doubleRiichi =
      document.getElementById("calc-doubleriichi")?.checked || false;
    const riichi =
      doubleRiichi ||
      document.getElementById("calc-riichi")?.checked ||
      false;
    const ippatsu =
      document.getElementById("calc-ippatsu")?.checked || false;
    const afterKan =
      document.getElementById("calc-afterkan")?.checked || false;
    const robbingKan =
      document.getElementById("calc-robbingkan")?.checked || false;
    const lastTile =
      document.getElementById("calc-lasttile")?.checked || false;

    const blessing = document.getElementById("calc-tenhou")?.checked
      ? "tenhou"
      : document.getElementById("calc-chiihou")?.checked
        ? "chiihou"
        : null;

    const doraIndicators = document
      .getElementById("calc-dora")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const result = RiichiScore.calculateScore({
      hand,
      melds,
      winTile,
      winType,
      seatWind,
      roundWind,
      riichi,
      isRiichi: riichi,
      doubleRiichi,
      isDoubleRiichi: doubleRiichi,
      ippatsu,
      isIppatsu: ippatsu,
      afterKan,
      isAfterKan: afterKan,
      robbingKan,
      isRobbingKan: robbingKan,
      lastTile,
      isLastTile: lastTile,
      blessing,
      doraIndicators,
      config: { kiriageMangan: false },
    });
    lastCalcResult = result;

    const players = (localRoomState && localRoomState.players) ? localRoomState.players : [];
    const is3Player = players.length === 3;
    const isDealer = result.seatIsDealer;
    const payments = result.payments || {};

    // --- PAYMENT BREAKDOWN DISPLAY FORMATTING ---
    let paymentDetail = "";

    if (result.winType === "tsumo") {
      if (isDealer) {
        const nonDealerPay = payments.nonDealer ? payments.nonDealer.toLocaleString() : "0";
        paymentDetail = is3Player
          ? `<b>${nonDealerPay}</b> each from 2 players (Dealer Tsumo)`
          : `<b>${nonDealerPay}</b> from all (Dealer Tsumo)`;
      } else {
        const dealerPay = payments.dealer ? payments.dealer.toLocaleString() : "0";
        const nonDealerPay = payments.nonDealer ? payments.nonDealer.toLocaleString() : "0";
        paymentDetail = is3Player
          ? `Dealer: <b>${dealerPay}</b> · Other Player: <b>${nonDealerPay}</b>`
          : `Dealer: <b>${dealerPay}</b> · Others: <b>${nonDealerPay}</b> each`;
      }
    } else {
      const ronPay = payments.ron ? payments.ron.toLocaleString() : "0";
      paymentDetail = isDealer
        ? `Dealer Ron: <b>${ronPay}</b> from target player`
        : `Ron: <b>${ronPay}</b> from target player`;
    }

    const totalPointsFormatted = result.points ? result.points.toLocaleString() : "0";

    // Auto-detect winner based on Seat Wind matching active room seats
    const dealerIdx = (localRoomState && localRoomState.dealerIndex !== undefined) ? localRoomState.dealerIndex : 0;
    const seatMap = { "1z": "East", "2z": "South", "3z": "West", "4z": "North" };
    const targetSeatName = seatMap[seatWind] || "East";

    const inferredWinner = players.find((p, idx) => {
      const wind = getPlayerWind(idx, dealerIdx, players.length);
      return wind === targetSeatName;
    }) || players[0];

    // Render Loser/Target picker ONLY if winType === "ron"
    let targetSectionHTML = "";
    if (winType === "ron" && players.length > 0) {
      const otherPlayers = players.filter((p) => p.id !== (inferredWinner ? inferredWinner.id : ""));
      const targetOptions = otherPlayers.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
      
      targetSectionHTML = `
        <div class="mt-3 pt-2 border-t border-ink/10 flex items-center justify-between gap-3">
          <label for="calc-target-player" class="text-xs font-bold text-ink-soft shrink-0">
            Dealt-in by (Loser):
          </label>
          <select id="calc-target-player" class="field px-3 py-1 text-xs max-w-[12rem]">
            ${targetOptions}
          </select>
        </div>`;
    }

    out.classList.remove("hidden");
    out.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 pb-3">
        <div class="min-w-0 space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-jade-700 text-base">${result.tier || "Hand Score"} · ${result.han} Han ${result.fu} Fu</span>
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-jade-100 text-jade-800 text-xs font-extrabold shadow-xs">
              Total: ${totalPointsFormatted} pts
            </span>
          </div>
          <p class="text-ink text-xs">${paymentDetail}</p>
          <p class="text-[11px] text-jade-700 font-semibold mt-0.5">Winner: <b>${inferredWinner ? inferredWinner.name : "Unknown"}</b> (${targetSeatName} Seat)</p>
        </div>
        <button
          type="button"
          onclick="applyCalcToNote()"
          class="btn btn-primary shrink-0 px-3 py-1.5 text-xs shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Apply to Form
        </button>
      </div>

      ${targetSectionHTML}

      <ul class="list-disc pl-4 text-xs text-ink-mute mt-2.5">${result.yaku ? result.yaku.map((y) => `<li>${y.name} (${y.han} han)</li>`).join("") : ""}</ul>
    `;
  } catch (err) {
    console.error("Score Calc Error:", err);
    out.classList.remove("hidden");
    out.innerHTML = `
      <p class="text-xs font-semibold text-red-700">⚠ ${err.message}</p>
      <p class="text-xs text-ink-mute mt-1">Fix the hand or meld above and recalculate.</p>
    `;
  }
};

function initTilePicker() {
  const suits = {
    m: ["1m", "2m", "3m", "4m", "0m", "5m", "6m", "7m", "8m", "9m"],
    p: ["1p", "2p", "3p", "4p", "0p", "5p", "6p", "7p", "8p", "9p"],
    s: ["1s", "2s", "3s", "4s", "0s", "5s", "6s", "7s", "8s", "9s"],
    z: ["1z", "2z", "3z", "4z", "5z", "6z", "7z"],
  };

  for (const [suit, codes] of Object.entries(suits)) {
    const container = document.getElementById(`picker-${suit}`);
    if (!container) continue;
    container.innerHTML = "";
    codes.forEach((code) => {
      const face = TILE_FACES[code] || {
        sym: code,
        color: "text-slate-800",
      };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker-tile";
      btn.innerHTML = `
              <span class="text-base leading-tight ${face.color}">${face.sym}</span>
              <span class="text-[9px] font-bold text-slate-500 leading-none mt-0.5">${code}</span>
            `;
      btn.onclick = () => addTileToHand(code);
      container.appendChild(btn);
    });
  }
}

function addTileToHand(code) {
  const hiddenInput = document.getElementById("calc-hand");
  let tiles = hiddenInput.value
    ? hiddenInput.value.split(",").filter(Boolean)
    : [];
  if (tiles.length >= 14) return;

  tiles.push(code);
  hiddenInput.value = tiles.join(",");
  renderHandTiles();
  runCalculation();
}

window.clearCalcHand = () => {
  document.getElementById("calc-hand").value = "";
  currentMelds = [];
  renderMelds();
  renderHandTiles();
  renderDoraTiles();
  runCalculation();
};

window.addMeldPrompt = (type) => {
  pendingMeldType = type === "chi" || type === "chii" ? "chii" : type;
  pendingMeldTiles = [];

  const modal = document.getElementById("meld-builder-modal");
  const title = document.getElementById("meld-modal-title");
  const requiredCount =
    pendingMeldType === "chii" || pendingMeldType === "pon" ? 3 : 4;
  title.textContent = `Select ${requiredCount} tiles for ${pendingMeldType.toUpperCase()}`;

  renderMeldPicker();
  updateMeldPreview();
  modal.classList.remove("hidden");
};

window.closeMeldBuilder = () => {
  document.getElementById("meld-builder-modal").classList.add("hidden");
};

window.clearMeldSelection = () => {
  pendingMeldTiles = [];
  updateMeldPreview();
};

function updateMeldPreview() {
  const container = document.getElementById("meld-selected-tiles");
  if (!container) return;

  container.innerHTML = pendingMeldTiles.length
    ? pendingMeldTiles
        .map(
          (code) => `
                  <div class="inline-flex flex-col items-center justify-center w-12 h-16 bg-white border border-jade-300 rounded-md shadow-xs">
                    <span class="text-[3rem] leading-none font-serif font-bold text-jade-800">${(TILE_FACES[code] && TILE_FACES[code].sym) || code}</span>
                    <span class="text-[9px] font-bold text-slate-500 leading-none -mt-1 mb-0.5">${code}</span>
                  </div>`,
        )
        .join("")
    : `<span class="text-ink-mute italic font-normal text-xs">Click tiles below...</span>`;
}

function renderMeldPicker() {
  const suits = {
    m: ["1m", "2m", "3m", "4m", "0m", "5m", "6m", "7m", "8m", "9m"],
    p: ["1p", "2p", "3p", "4p", "0p", "5p", "6p", "7p", "8p", "9p"],
    s: ["1s", "2s", "3s", "4s", "0s", "5s", "6s", "7s", "8s", "9s"],
    z: ["1z", "2z", "3z", "4z", "5z", "6z", "7z"],
  };

  for (const [suit, codes] of Object.entries(suits)) {
    const container = document.getElementById(`meld-picker-${suit}`);
    if (!container) continue;
    container.innerHTML = "";
    codes.forEach((code) => {
      const face = TILE_FACES[code] || {
        sym: code,
        color: "text-slate-800",
      };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker-tile";
      btn.innerHTML = `
              <span class="text-[3rem] leading-none ${face.color}">${face.sym}</span>
              <span class="text-[9px] font-bold text-slate-500 leading-none mt-0.5">${code}</span>
            `;
      btn.onclick = () => selectTileForMeld(code);
      container.appendChild(btn);
    });
  }
}

function selectTileForMeld(code) {
  const maxCount =
    pendingMeldType === "chii" || pendingMeldType === "pon" ? 3 : 4;
  if (
    pendingMeldType === "pon" ||
    pendingMeldType === "kan" ||
    pendingMeldType === "closed_kan"
  ) {
    // Only one aka five exists per suit, so the meld can hold at most
    // one "0X" — prefer normal copies and keep the aka variant only
    // for the tile that was actually picked (aka shown last).
    const normal = code.startsWith("0") ? "5" + code.slice(1) : code;
    pendingMeldTiles = Array.from({ length: maxCount }, (_, i) =>
      i === maxCount - 1 ? code : normal,
    );
  } else if (pendingMeldType === "chii") {
    // A run can't repeat a rank, and an aka five ("0X") is the same
    // rank as its normal five ("5X") — ignore re-selection instead of
    // building an impossible meld with two "same-number" copies.
    const rankOf = (c) => (c.startsWith("0") ? "5" + c.slice(1) : c);
    const rank = rankOf(code);
    if (
      pendingMeldTiles.length < 3 &&
      !pendingMeldTiles.some((t) => rankOf(t) === rank)
    ) {
      pendingMeldTiles.push(code);
    }
  }
  updateMeldPreview();
}

window.confirmMeldSelection = () => {
  const requiredCount =
    pendingMeldType === "chii" || pendingMeldType === "pon" ? 3 : 4;
  if (pendingMeldTiles.length !== requiredCount) {
    alert(`Please select exactly ${requiredCount} tiles for this meld.`);
    return;
  }
  if (pendingMeldType === "chii") {
    // Defensive check: the run must be one suit, consecutive ranks —
    // with an aka five ("0X") counting as its normal five ("5X").
    const norm = (c) => (c.startsWith("0") ? "5" + c.slice(1) : c);
    const suits = new Set(pendingMeldTiles.map((c) => norm(c).slice(-1)));
    const digits = pendingMeldTiles
      .map((c) => parseInt(c.startsWith("0") ? "5" + c.slice(1) : c, 10))
      .sort((a, b) => a - b);
    if (
      suits.size !== 1 ||
      digits[1] !== digits[0] + 1 ||
      digits[2] !== digits[0] + 2
    ) {
      alert(
        "That chi is not a valid consecutive run in one suit (an aka five counts as a five).",
      );
      return;
    }
  }
  currentMelds.push({
    type: pendingMeldType,
    tiles: [...pendingMeldTiles],
  });
  renderMelds();
  closeMeldBuilder();
  runCalculation();
};

window.removeMeld = (index) => {
  currentMelds.splice(index, 1);
  renderMelds();
  runCalculation();
};

function renderMelds() {
  const container = document.getElementById("calc-melds-list");
  if (!container) return;

  if (currentMelds.length === 0) {
    container.innerHTML = `<span class="text-ink-mute italic">No melds added (Fully closed hand)</span>`;
    return;
  }

  container.innerHTML = currentMelds
    .map((m, idx) => {
      const tilesHTML = m.tiles
        .map((code) => {
          const face = TILE_FACES[code] || {
            sym: code,
            color: "text-slate-800",
          };
          return `
                  <div class="inline-flex flex-col items-center justify-center w-12 h-16 bg-white border border-ink/20 rounded-md shadow-xs">
                    <span class="text-[3rem] leading-none font-serif font-bold ${face.color}">${face.sym}</span>
                    <span class="text-[9px] font-bold text-slate-500 leading-none -mt-1 mb-0.5">${code}</span>
                  </div>`;
        })
        .join("");

      return `
              <span class="inline-flex items-center gap-2 rounded-xl border border-ink/15 bg-slate-100/80 p-2 shadow-sm">
                <span class="uppercase text-[11px] text-jade-700 font-extrabold tracking-wider">[${m.type}]</span>
                <div class="flex gap-1">${tilesHTML}</div>
                <button type="button" onclick="removeMeld(${idx})" class="text-red-600 hover:text-red-800 font-bold text-base leading-none p-1">✕</button>
              </span>`;
    })
    .join("");
}

function renderHandTiles() {
  const hiddenInput = document.getElementById("calc-hand");
  const displayContainer = document.getElementById("calc-hand-display");
  const winTileHidden = document.getElementById("calc-wintile");
  const winTileDisplay = document.getElementById("calc-wintile-display");
  if (!displayContainer) return;

  const tiles = hiddenInput.value
    ? hiddenInput.value.split(",").filter(Boolean)
    : [];

  if (tiles.length === 0) {
    displayContainer.innerHTML = `<span id="calc-hand-placeholder" class="text-xs text-ink-mute italic pl-1">Click tiles below to build hand...</span>`;
    if (winTileHidden) winTileHidden.value = "";
    if (winTileDisplay)
      winTileDisplay.innerHTML = `<span class="text-xs text-ink-mute italic">Auto</span>`;
    return;
  }

  const meldCount =
    typeof currentMelds !== "undefined" ? currentMelds.length : 0;
  const expectedHandSize = 14 - 3 * meldCount;
  const lastTile = tiles[tiles.length - 1];

  if (winTileHidden && winTileDisplay && tiles.length === expectedHandSize) {
    winTileHidden.value = lastTile;
    const face = TILE_FACES[lastTile] || {
      sym: lastTile,
      color: "text-slate-800",
    };
    winTileDisplay.innerHTML = `
            <div class="inline-flex flex-col items-center justify-center w-full h-full bg-amber-50 border border-amber-300 rounded-2xl">
              <span class="text-[3rem] leading-none font-serif font-bold ${face.color}">${face.sym}</span>
              <span class="text-[9px] font-bold text-slate-500 leading-none -mt-1 mb-0.5">${lastTile}</span>
            </div>`;
  }

  displayContainer.innerHTML = tiles
    .map((code, idx) => {
      const face = TILE_FACES[code] || {
        sym: code,
        color: "text-slate-800",
      };
      const isWinTile =
        idx === tiles.length - 1 && tiles.length === expectedHandSize;
      return `
              <div class="inline-flex flex-col items-center justify-center w-12 h-16 bg-white border ${isWinTile ? "border-amber-400 ring-2 ring-amber-300" : "border-ink/20"} rounded-2xl shadow-xs relative group cursor-pointer" onclick="removeHandTile(${idx})">
                ${isWinTile ? `<span class="absolute -top-2 -right-1.5 bg-amber-500 text-white text-[8px] font-extrabold px-1 rounded-full uppercase">Win</span>` : ""}
                <span class="text-[3rem] leading-none font-serif font-bold ${face.color}">${face.sym}</span>
                <span class="text-[9px] font-bold text-slate-500 leading-none -mt-1 mb-0.5">${code}</span>
              </div>`;
    })
    .join("");
}

window.removeHandTile = (index) => {
  const hiddenInput = document.getElementById("calc-hand");
  let tiles = hiddenInput.value
    ? hiddenInput.value.split(",").filter(Boolean)
    : [];
  tiles.splice(index, 1);
  hiddenInput.value = tiles.join(",");
  renderHandTiles();
  runCalculation();
};

window.openDoraPicker = () => {
  renderDoraPickerBoard();
  const modal = document.getElementById("dora-builder-modal");
  if (modal) {
    modal.classList.remove("hidden");

    // Auto-focus the first tile button once rendered
    setTimeout(() => {
      const firstTileBtn = modal.querySelector(".picker-tile");
      if (firstTileBtn) {
        firstTileBtn.focus();
      } else {
        modal.focus();
      }
    }, 50);
  }
};

window.closeDoraPicker = () => {
  const modal = document.getElementById("dora-builder-modal");
  if (modal) modal.classList.add("hidden");
};

function renderDoraPickerBoard() {
  const suits = {
    m: ["1m", "2m", "3m", "4m", "0m", "5m", "6m", "7m", "8m", "9m"],
    p: ["1p", "2p", "3p", "4p", "0p", "5p", "6p", "7p", "8p", "9p"],
    s: ["1s", "2s", "3s", "4s", "0s", "5s", "6s", "7s", "8s", "9s"],
    z: ["1z", "2z", "3z", "4z", "5z", "6z", "7z"],
  };

  for (const [suit, codes] of Object.entries(suits)) {
    const container = document.getElementById(`dora-picker-${suit}`);
    if (!container) continue;
    container.innerHTML = "";
    codes.forEach((code) => {
      const face = TILE_FACES[code] || {
        sym: code,
        color: "text-slate-800",
      };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker-tile";
      btn.innerHTML = `
              <span class="text-[3rem] leading-none ${face.color}">${face.sym}</span>
              <span class="text-[9px] font-bold text-slate-500 leading-none mt-0.5">${code}</span>
            `;
      btn.onclick = () => window.selectDoraTile(code);
      container.appendChild(btn);
    });
  }
}

window.selectDoraTile = (code) => {
  const hiddenInput = document.getElementById("calc-dora");
  let doras = hiddenInput.value
    ? hiddenInput.value.split(",").filter(Boolean)
    : [];
  doras.push(code);
  hiddenInput.value = doras.join(",");
  renderDoraTiles();
  closeDoraPicker();
  runCalculation();
};

function renderDoraTiles() {
  const hiddenInput = document.getElementById("calc-dora");
  const displayContainer = document.getElementById("calc-dora-display");
  if (!displayContainer || !hiddenInput) return;

  const doras = hiddenInput.value
    ? hiddenInput.value.split(",").filter(Boolean)
    : [];

  if (doras.length === 0) {
    displayContainer.innerHTML = `<span class="text-xs text-ink-mute italic pl-1">Click + Add Dora to select indicators...</span>`;
    return;
  }

  displayContainer.innerHTML = doras
    .map((code, idx) => {
      const face = TILE_FACES[code] || {
        sym: code,
        color: "text-slate-800",
      };
      return `
              <div class="inline-flex flex-col items-center justify-center w-10 h-14 bg-white border border-ink/20 rounded-xl shadow-xs relative group cursor-pointer" onclick="removeDoraTile(${idx})">
                <span class="text-[2.5rem] leading-none ${face.color}">${face.sym}</span>
                <span class="text-[8px] font-bold text-slate-500 leading-none -mt-1 mb-0.5">${code}</span>
              </div>`;
    })
    .join("");
}

window.removeDoraTile = (index) => {
  const hiddenInput = document.getElementById("calc-dora");
  let doras = hiddenInput.value
    ? hiddenInput.value.split(",").filter(Boolean)
    : [];
  doras.splice(index, 1);
  hiddenInput.value = doras.join(",");
  renderDoraTiles();
  runCalculation();
};

window.clearDoraIndicators = () => {
  document.getElementById("calc-dora").value = "";
  renderDoraTiles();
  runCalculation();
};

function initAutoCalculation() {
  const triggers = [
    "calc-wintype",
    "calc-seatwind",
    "calc-roundwind",
    "calc-riichi",
    "calc-doubleriichi",
    "calc-ippatsu",
    "calc-afterkan",
    "calc-robbingkan",
    "calc-lasttile",
    "calc-tenhou",
    "calc-chiihou",
  ];

  triggers.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => runCalculation());
      el.addEventListener("click", () => runCalculation());
    }
  });

  const doubleRiichiEl = document.getElementById("calc-doubleriichi");
  if (doubleRiichiEl) {
    doubleRiichiEl.addEventListener("change", (e) => {
      if (e.target.checked) {
        const riichiEl = document.getElementById("calc-riichi");
        if (riichiEl) riichiEl.checked = true;
      }
      runCalculation();
    });
  }
}

window.applyCalcToNote = () => {
  const noteInput = document.getElementById("input-note");
  if (!lastCalcResult || !localRoomState) return;

  const players = localRoomState.players;
  const dealerIdx = localRoomState.dealerIndex || 0;
  const seatWind = document.getElementById("calc-seatwind")?.value || "1z";
  
  const seatMap = { "1z": "East", "2z": "South", "3z": "West", "4z": "North" };
  const targetSeatName = seatMap[seatWind] || "East";

  // Resolve winner matching seat wind
  const winnerPlayer = players.find((p, idx) => {
    const wind = getPlayerWind(idx, dealerIdx, players.length);
    return wind === targetSeatName;
  }) || players[0];

  const winnerId = winnerPlayer.id;
  const targetId = document.getElementById("calc-target-player")?.value;

  if (lastCalcResult.winType === "ron" && (!targetId || winnerId === targetId)) {
    alert("Please select a valid target player who dealt in!");
    return;
  }

  const dealerId = players[dealerIdx]?.id;
  const payments = lastCalcResult.payments || {};

  // Calculate score deltas for each active player
  const deltas = {};
  players.forEach((p) => (deltas[p.id] = 0));

  if (lastCalcResult.winType === "ron") {
    const amount = payments.ron || 0;
    deltas[winnerId] = amount;
    deltas[targetId] = -amount;
  } else if (lastCalcResult.winType === "tsumo") {
    if (winnerId === dealerId) {
      // Dealer Tsumo: All non-dealers pay payments.nonDealer
      const payEach = payments.nonDealer || 0;
      let totalGained = 0;
      players.forEach((p) => {
        if (p.id !== winnerId) {
          deltas[p.id] = -payEach;
          totalGained += payEach;
        }
      });
      deltas[winnerId] = totalGained;
    } else {
      // Non-Dealer Tsumo: Dealer pays payments.dealer, other non-dealer(s) pay payments.nonDealer
      const dealerPay = payments.dealer || 0;
      const nonDealerPay = payments.nonDealer || 0;
      let totalGained = 0;

      players.forEach((p) => {
        if (p.id === winnerId) return;
        if (p.id === dealerId) {
          deltas[p.id] = -dealerPay;
          totalGained += dealerPay;
        } else {
          deltas[p.id] = -nonDealerPay;
          totalGained += nonDealerPay;
        }
      });
      deltas[winnerId] = totalGained;
    }
  }

  // Populate input fields for active players
  players.forEach((p) => {
    const inputEl = document.getElementById(`input-${p.id}`);
    if (inputEl) {
      inputEl.value = deltas[p.id];
    }
  });

  // Format and attach Note text
  const winTypeStr = lastCalcResult.winType.toUpperCase();
  const summary = `${lastCalcResult.tier || "Hand Score"} · ${lastCalcResult.han} Han ${lastCalcResult.fu} Fu`;
  const yakuList = (lastCalcResult.yaku || []).map((y) => y.name).join(", ");

  let noteString = `${winTypeStr}: ${winnerPlayer.name} (${summary})`;
  if (yakuList) noteString += ` [${yakuList}]`;

  if (noteInput) {
    const existing = noteInput.value.trim();
    noteInput.value = existing ? `${existing} · ${noteString}` : noteString;
  }

  // Close calculator modal and auto-validate
  window.closeCalculatorModal();
  if (typeof window.validateSum === "function") {
    window.validateSum();
  }
};

window.addEventListener("DOMContentLoaded", init);
