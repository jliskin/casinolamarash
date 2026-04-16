// ─── Casino La Marash – Elevator Music Engine ───────────────────
'use strict';

// ── Note frequency table ─────────────────────────────────────────
// Returns Hz for a note string like 'C4', 'Bb3', 'F#5'
function noteHz(note) {
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
                E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
                A: 9, 'A#': 10, Bb: 10, B: 11 };
  const m = note.match(/^([A-G][b#]?)(\d)$/);
  if (!m) return 0;
  const semitones = map[m[1]] + (parseInt(m[2]) + 1) * 12;
  return 440 * Math.pow(2, (semitones - 69) / 12);
}

// ── Track definitions ─────────────────────────────────────────────
// Each track: name, bpm, chords (4-note voicings), melody, bass line
const TRACKS = [
  {
    name: 'Velvet Lounge',
    bpm: 68,
    chords: [
      ['C4','E4','G4','B4'],  // Cmaj7
      ['A3','C4','E4','G4'],  // Am7
      ['F3','A3','C4','E4'],  // Fmaj7
      ['G3','B3','D4','F4'],  // G7
    ],
    melody:  ['E5','D5','C5','B4','C5','A4','G4','A4','B4','C5','D5','E5'],
    bass:    ['C3','A2','F2','G2'],
  },
  {
    name: 'Casino Nights',
    bpm: 84,
    chords: [
      ['F3','A3','C4','E4'],   // Fmaj7
      ['D3','F3','A3','C4'],   // Dm7
      ['G3','Bb3','D4','F4'],  // Gm7
      ['C3','E3','G3','Bb3'],  // C7
    ],
    melody:  ['A4','C5','F5','E5','D5','C5','Bb4','A4','G4','F4','G4','A4'],
    bass:    ['F2','D2','G2','C2'],
  },
  {
    name: 'Golden Hour',
    bpm: 58,
    chords: [
      ['G3','B3','D4','F#4'], // Gmaj7
      ['E3','G3','B3','D4'],  // Em7
      ['C3','E3','G3','B3'],  // Cmaj7
      ['D3','F#3','A3','C4'], // D7
    ],
    melody:  ['D5','B4','G4','A4','B4','D5','E5','D5','B4','A4','G4','B4'],
    bass:    ['G2','E2','C2','D2'],
  },
  {
    name: 'Midnight Blue',
    bpm: 72,
    chords: [
      ['A3','C4','E4','G4'],   // Am7
      ['D3','F3','A3','C4'],   // Dm7
      ['E3','G#3','B3','D4'],  // E7
      ['A3','C4','E4','G4'],   // Am7
    ],
    melody:  ['A4','E4','C5','B4','A4','G4','F4','E4','G4','A4','B4','C5'],
    bass:    ['A2','D2','E2','A2'],
  },
  {
    name: 'Silk & Gold',
    bpm: 76,
    chords: [
      ['Bb3','D4','F4','A4'],  // Bbmaj7
      ['G3','Bb3','D4','F4'],  // Gm7
      ['Eb3','G3','Bb3','D4'], // Ebmaj7
      ['F3','A3','C4','Eb4'],  // F7
    ],
    melody:  ['D5','F5','Bb5','A5','G5','F5','D5','C5','Bb4','C5','D5','F5'],
    bass:    ['Bb2','G2','Eb2','F2'],
  },
];

// ── Player state ──────────────────────────────────────────────────
let ctx = null;
let masterGain = null;
let reverbNode = null;
let scheduledNodes = [];
let isPlaying = false;
let trackIdx = 0;
let scheduleTimer = null;
let nextNoteTime = 0;
let beatIdx = 0;
let volume = 0.3;

// ── Init AudioContext (must be on user gesture) ───────────────────
function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume, ctx.currentTime);

  // Simple reverb: two parallel delay lines with feedback
  reverbNode = buildReverb();
  reverbNode.connect(masterGain);
  masterGain.connect(ctx.destination);
}

function buildReverb() {
  const mix = ctx.createGain();
  mix.gain.setValueAtTime(0.18, ctx.currentTime);

  // Two comb filter delays for a lush room feel
  [[0.061, 0.35], [0.083, 0.30]].forEach(([delayTime, feedback]) => {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = delayTime;
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 3200;
    delay.connect(fb);
    fb.connect(lpf);
    lpf.connect(delay);
    mix.connect(delay);
    delay.connect(ctx.destination); // dry+wet both flow out
  });

  return mix;
}

// ── Tone helpers ──────────────────────────────────────────────────
function playNote(hz, type, startTime, duration, gainPeak, dest) {
  if (!hz) return;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, startTime);

  // Soft attack/decay envelope
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(gainPeak * 0.6, startTime + duration * 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.95);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration);
  scheduledNodes.push(osc);
}

// ── Scheduler ─────────────────────────────────────────────────────
const LOOK_AHEAD   = 0.15; // seconds to schedule ahead
const SCHEDULE_INT = 80;   // ms between scheduler calls

function scheduleAhead() {
  const track  = TRACKS[trackIdx];
  const beatDur = 60 / track.bpm;       // one beat in seconds
  const barDur  = beatDur * 4;          // one bar = 4 beats
  const numBars = track.chords.length;  // usually 4

  while (nextNoteTime < ctx.currentTime + LOOK_AHEAD) {
    const barNum  = beatIdx % numBars;
    const chord   = track.chords[barNum];
    const bassNote = track.bass[barNum];
    const melNote  = track.melody[beatIdx % track.melody.length];

    // Bass note: triangle, one beat
    playNote(noteHz(bassNote), 'triangle', nextNoteTime, beatDur * 0.9, 0.22, masterGain);

    // Chord pad: all 4 notes, sine, last for full bar duration
    // Only play chord on beat 1 of each bar (beatIdx % 4 === 0) plus beat 3
    if (beatIdx % 4 === 0 || beatIdx % 4 === 2) {
      const chordDur = (beatIdx % 4 === 0) ? barDur * 0.95 : beatDur * 2 * 0.95;
      chord.forEach((n, i) => {
        playNote(noteHz(n), 'sine', nextNoteTime + i * 0.006, chordDur, 0.06, masterGain);
        // add to reverb send too
        playNote(noteHz(n), 'sine', nextNoteTime + i * 0.006, chordDur, 0.025, reverbNode);
      });
    }

    // Melody: sine, eighth-note rhythm (half a beat per note)
    const melDur = beatDur * 0.45;
    playNote(noteHz(melNote), 'sine', nextNoteTime + beatDur * 0.25, melDur, 0.09, masterGain);
    playNote(noteHz(melNote), 'sine', nextNoteTime + beatDur * 0.25, melDur, 0.03, reverbNode);

    nextNoteTime += beatDur;
    beatIdx++;
  }
}

// ── Transport controls ────────────────────────────────────────────
function startPlayback() {
  initAudio();
  if (ctx.state === 'suspended') ctx.resume();
  isPlaying    = true;
  beatIdx      = 0;
  nextNoteTime = ctx.currentTime + 0.1;
  scheduleAhead();
  scheduleTimer = setInterval(scheduleAhead, SCHEDULE_INT);
  updateUI();
}

function stopPlayback() {
  isPlaying = false;
  clearInterval(scheduleTimer);
  scheduleTimer = null;
  // Cancel all scheduled oscillators cleanly
  scheduledNodes.forEach(n => { try { n.stop(0); } catch (_) {} });
  scheduledNodes = [];
  updateUI();
}

function togglePlayback() {
  if (isPlaying) stopPlayback();
  else startPlayback();
}

function prevTrack() {
  const wasPlaying = isPlaying;
  if (isPlaying) stopPlayback();
  trackIdx = (trackIdx - 1 + TRACKS.length) % TRACKS.length;
  updateUI();
  if (wasPlaying) startPlayback();
}

function nextTrack() {
  const wasPlaying = isPlaying;
  if (isPlaying) stopPlayback();
  trackIdx = (trackIdx + 1) % TRACKS.length;
  updateUI();
  if (wasPlaying) startPlayback();
}

function setVolume(v) {
  volume = v;
  if (masterGain) masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

// ── UI sync ───────────────────────────────────────────────────────
function updateUI() {
  const nameEl = document.getElementById('music-track-name');
  const numEl  = document.getElementById('music-track-num');
  const togEl  = document.getElementById('music-toggle');
  if (nameEl) nameEl.textContent = TRACKS[trackIdx].name;
  if (numEl)  numEl.textContent  = `${trackIdx + 1} / ${TRACKS.length}`;
  if (togEl)  togEl.textContent  = isPlaying ? '■' : '♪';
}

// ── Wire up controls ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateUI();

  const tog = document.getElementById('music-toggle');
  const prv = document.getElementById('music-prev');
  const nxt = document.getElementById('music-next');
  const vol = document.getElementById('music-volume');

  if (tog) tog.addEventListener('click', togglePlayback);
  if (prv) prv.addEventListener('click', prevTrack);
  if (nxt) nxt.addEventListener('click', nextTrack);
  if (vol) {
    vol.value = Math.round(volume * 100);
    vol.addEventListener('input', () => setVolume(parseInt(vol.value, 10) / 100));
  }
});
