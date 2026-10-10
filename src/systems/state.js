// The shared game state: every system reads and writes it (G.round, G.paused, ...). The objects
// (renderer, player, guard, round ...) are set once by the system that builds them, in the order of
// src/systems/index.js; the values below change while playing.
export const G = {
  MODE: null,              // vr / phone / pc (platform/mode.js); refined once the report data is ready
  PHONE: false, IOS: false,
  // messages (systems/messages.js)
  flashText: '', flashT: 0, flashColor: '#ffd166', wristTimer: 0,
  // contract and difficulty (systems/contract.js)
  contractId: 'first', difficulty: 'medium', contract: null, verdict: null,
  guardLine: '', guardLineT: 0,          // the guard's spoken lines: subtitles on the wrist / HUD
  // the round's frame logic
  simT: 0, lastPop: -1,
  boardDirty: true, boardT: 0, caughtT: -1, heartT: 0, voiceT: 0, speakT: 0, quietT: 0,
  resultT: -1, autoPlayed: false, wasHidden: false, heightMsg: false, breathDown: false, active: false,
  boardPage: 'contract', calib: null, calibNotes: '', lastBoardSig: '',
  snapDeg: 45,
  lightK: 1,               // display brightness: every light x this (systems/brightness.js); the game never reads it
  // VR session (systems/vr.js)
  inVR: false, firstRecenter: false, vrStart: 0, autoHzDone: false,
  // flat screen: playing on a laptop (mouse captured) or a phone (touch)
  playingDesktop: false,
  // phone pause (systems/phone.js)
  paused: false, lastRender: 0, graceUntil: 0, gyroReady: false, holdDoor: null, feedback: null,
  // everybody in the round (game/players.js): [G.player] offline; the remote players and the bot join it
  players: [],
  // the frame loop (main.js)
  last: 0, lampT: 0,
};

export const $ = (id) => document.getElementById(id);
export const params = new URLSearchParams(location.search);
