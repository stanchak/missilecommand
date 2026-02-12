import * as Tone from 'tone';

const MISSION_TEMPO = 136;

export class AudioManager {
  constructor() {
    this.ready = false;
    this.muted = false;
    this.masterLevel = 0.82;
    this.lastEventTime = 0;
    this.resumePromise = null;
    this.initPromise = null;
    this.musicEnabled = false;
  }

  async init() {
    if (this.ready) {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      await Tone.start();
      await Tone.getContext().resume();
      Tone.getContext().lookAhead = 0.03;

      this.master = new Tone.Gain(this.masterLevel).toDestination();
      this.musicBus = new Tone.Gain(0.66).connect(this.master);
      this.fxBus = new Tone.Gain(0.82).connect(this.master);

      this.reverb = new Tone.Reverb({
        decay: 4.8,
        preDelay: 0.05,
        wet: 0.34,
      }).connect(this.master);

      this.delay = new Tone.PingPongDelay({
        delayTime: '8n',
        feedback: 0.26,
        wet: 0.28,
      }).connect(this.reverb);

      this.musicFilter = new Tone.Filter({
        type: 'lowpass',
        frequency: 14500,
        Q: 1,
      }).connect(this.musicBus);

      this._createInstruments();
      this._createMusicLoops();

      Tone.Transport.bpm.value = MISSION_TEMPO;
      this.lastEventTime = Tone.now();
      this.ready = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  _createInstruments() {
    this.launchNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: {
        attack: 0.001,
        decay: 0.12,
        sustain: 0,
        release: 0.05,
      },
    }).connect(this.delay);

    this.launchTone = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: {
        attack: 0.001,
        decay: 0.08,
        sustain: 0,
        release: 0.08,
      },
    }).connect(this.fxBus);

    this.interceptSynth = new Tone.MetalSynth({
      frequency: 240,
      envelope: {
        attack: 0.001,
        decay: 0.22,
        release: 0.08,
      },
      harmonicity: 5.1,
      modulationIndex: 28,
      resonance: 7000,
      octaves: 1.5,
    }).connect(this.delay);

    this.enemyImpactSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 7,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.65,
        sustain: 0,
        release: 0.2,
      },
    }).connect(this.reverb);

    this.cityFallSynth = new Tone.FMSynth({
      harmonicity: 1.2,
      modulationIndex: 12,
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.001,
        decay: 0.5,
        sustain: 0.12,
        release: 0.4,
      },
      modulation: { type: 'sawtooth' },
      modulationEnvelope: {
        attack: 0.01,
        decay: 0.25,
        sustain: 0,
        release: 0.1,
      },
    }).connect(this.reverb);

    this.uiSynth = new Tone.PluckSynth({
      attackNoise: 0.4,
      dampening: 3600,
      resonance: 0.92,
    }).connect(this.fxBus);

    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.25,
        sustain: 0,
        release: 0.02,
      },
    }).connect(this.musicBus);

    this.hat = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: {
        attack: 0.001,
        decay: 0.09,
        sustain: 0,
        release: 0.03,
      },
    }).connect(this.musicBus);

    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'square2' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.16,
        sustain: 0.24,
        release: 0.18,
        baseFrequency: 80,
        octaves: 2.3,
      },
      envelope: {
        attack: 0.005,
        decay: 0.12,
        sustain: 0.22,
        release: 0.1,
      },
    }).connect(this.musicFilter);

    this.arp = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'pulse' },
      envelope: {
        attack: 0.003,
        decay: 0.08,
        sustain: 0.04,
        release: 0.1,
      },
    }).connect(this.delay);

    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: {
        attack: 0.2,
        decay: 0.3,
        sustain: 0.25,
        release: 1.2,
      },
    }).connect(this.reverb);

    this.stageBell = new Tone.FMSynth({
      harmonicity: 2.4,
      modulationIndex: 22,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.35,
        sustain: 0.08,
        release: 0.8,
      },
      modulation: { type: 'triangle' },
      modulationEnvelope: {
        attack: 0.002,
        decay: 0.16,
        sustain: 0.03,
        release: 0.38,
      },
    }).connect(this.reverb);

    this.stageShimmer = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle4' },
      envelope: {
        attack: 0.005,
        decay: 0.09,
        sustain: 0.05,
        release: 0.25,
      },
    }).connect(this.delay);
  }

  _createMusicLoops() {
    const bassPattern = [
      'C2', null, 'C2', null,
      'G1', null, 'A1', null,
      'Bb1', null, 'G1', null,
      'C2', null, 'D2', null,
    ];

    this.bassSeq = new Tone.Sequence((time, note) => {
      if (note) {
        this.bass.triggerAttackRelease(note, '8n', time, 0.85);
      }
    }, bassPattern, '8n').start(0);

    this.kickLoop = new Tone.Loop((time) => {
      this.kick.triggerAttackRelease('C1', '8n', time, 0.95);
    }, '4n').start(0);

    this.hatLoop = new Tone.Loop((time) => {
      this.hat.triggerAttackRelease('16n', time, 0.22);
    }, '8n').start('0:0:2');

    const arpPattern = ['G4', 'Bb4', 'C5', 'D5', 'F5', 'D5', 'C5', 'Bb4'];
    this.arpSeq = new Tone.Sequence((time, note) => {
      this.arp.triggerAttackRelease(note, '16n', time, 0.22);
    }, arpPattern, '16n').start('0:2:0');

    this.padLoop = new Tone.Loop((time) => {
      this.pad.triggerAttackRelease(['C4', 'Eb4', 'G4'], '1m', time, 0.14);
    }, '2m').start(0);

    Tone.Transport.swing = 0.08;
    Tone.Transport.swingSubdivision = '8n';
  }

  _nextEventTime(minSpacing = 0.0015) {
    const now = Tone.now();
    const safeTime = Math.max(now, this.lastEventTime + minSpacing);
    this.lastEventTime = safeTime;
    return safeTime;
  }

  _triggerSafe(fn) {
    try {
      fn();
    } catch (_error) {
      // Never allow audio scheduling errors to interrupt gameplay.
    }
  }

  _startTransportIfNeeded() {
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start();
    }
  }

  warmup() {
    if (this.ready) {
      this.resumeIfSuspended();
      return Promise.resolve();
    }

    return this.init().catch(() => {});
  }

  resumeIfSuspended() {
    if (!this.ready) {
      return;
    }

    const context = Tone.getContext();
    if (context.state === 'running') {
      return;
    }

    if (this.resumePromise) {
      return;
    }

    this.resumePromise = context.resume()
      .then(() => {
        if (this.musicEnabled) {
          this._triggerSafe(() => {
            this._startTransportIfNeeded();
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        this.resumePromise = null;
      });
  }

  _canPlay() {
    if (!this.ready || this.muted) {
      return false;
    }

    if (Tone.getContext().state !== 'running') {
      this.resumeIfSuspended();
      return false;
    }

    return true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.master) {
      return;
    }
    this.master.gain.rampTo(muted ? 0 : this.masterLevel, 0.05);
  }

  newMission() {
    if (!this.ready) {
      return;
    }

    this.musicEnabled = true;
    this.resumeIfSuspended();
    this._triggerSafe(() => {
      this._startTransportIfNeeded();
      Tone.Transport.bpm.rampTo(MISSION_TEMPO, 0.2);
      this.musicFilter.frequency.rampTo(14500, 0.2);
    });
  }

  playerLaunch() {
    if (!this._canPlay()) {
      return;
    }
    const now = this._nextEventTime(0.0015);
    this._triggerSafe(() => {
      this.launchNoise.triggerAttackRelease('16n', now, 0.32);
      this.launchTone.triggerAttackRelease('G4', '16n', now + 0.001, 0.18);
    });
  }

  enemyLaunch() {
    if (!this._canPlay()) {
      return;
    }
    const now = this._nextEventTime(0.0015);
    this._triggerSafe(() => {
      this.launchTone.triggerAttackRelease('C3', '32n', now, 0.11);
    });
  }

  intercept() {
    if (!this._canPlay()) {
      return;
    }
    const now = this._nextEventTime(0.0015);
    this._triggerSafe(() => {
      this.interceptSynth.triggerAttackRelease('16n', now, 0.2);
      this.arp.triggerAttackRelease('D5', '32n', now + 0.001, 0.11);
    });
  }

  enemyImpact() {
    if (!this._canPlay()) {
      return;
    }
    const now = this._nextEventTime(0.0015);
    this._triggerSafe(() => {
      this.enemyImpactSynth.triggerAttackRelease('A1', '8n', now, 0.6);
    });
  }

  cityDestroyed() {
    if (!this._canPlay()) {
      return;
    }
    const now = this._nextEventTime(0.0015);
    this._triggerSafe(() => {
      this.cityFallSynth.triggerAttackRelease('C3', '8n', now, 0.38);
      this.cityFallSynth.triggerAttackRelease('G2', '8n', now + 0.08, 0.32);
    });
  }

  waveStart(waveNumber) {
    if (!this._canPlay()) {
      return;
    }
    const root = ['C4', 'D4', 'Eb4', 'F4'][waveNumber % 4];
    const now = this._nextEventTime(0.0015);
    this._triggerSafe(() => {
      this.arp.triggerAttackRelease([root, 'G4', 'C5'], '16n', now, 0.2);
    });
  }

  stageClear(waveNumber, bonusScore) {
    if (!this._canPlay()) {
      return;
    }

    const now = this._nextEventTime(0.0025);
    const rootNotes = ['C4', 'D4', 'Eb4', 'G4'];
    const root = rootNotes[(waveNumber - 1) % rootNotes.length];
    const intensity = Math.min(1, 0.45 + (bonusScore / 900));

    this._triggerSafe(() => {
      this.stageBell.triggerAttackRelease('C6', '8n', now, 0.24 + (intensity * 0.16));
      this.stageBell.triggerAttackRelease('G6', '8n', now + 0.075, 0.2 + (intensity * 0.15));

      this.stageShimmer.triggerAttackRelease([`${root}`, 'G4', 'C5'], '16n', now + 0.03, 0.22 + (intensity * 0.16));
      this.stageShimmer.triggerAttackRelease(['D5', 'G5', 'C6'], '16n', now + 0.14, 0.18 + (intensity * 0.14));

      this.pad.triggerAttackRelease(['C4', 'Eb4', 'G4', 'Bb4'], '2n', now + 0.015, 0.12 + (intensity * 0.12));
      this.interceptSynth.triggerAttackRelease('8n', now + 0.025, 0.16 + (intensity * 0.1));
      this.launchNoise.triggerAttackRelease('8n', now + 0.03, 0.09 + (intensity * 0.07));
    });
  }

  noAmmo() {
    if (!this._canPlay()) {
      return;
    }
    const now = this._nextEventTime(0.0015);
    this._triggerSafe(() => {
      this.uiSynth.triggerAttackRelease('C4', '32n', now, 0.3);
    });
  }

  gameOver() {
    if (!this._canPlay()) {
      return;
    }
    const now = this._nextEventTime(0.002);
    this._triggerSafe(() => {
      this.pad.triggerAttackRelease(['C3', 'Eb3', 'Bb3'], '2n', now, 0.16);
      this.musicFilter.frequency.rampTo(2100, 1.8);
      Tone.Transport.bpm.rampTo(110, 2.2);
    });
  }
}
