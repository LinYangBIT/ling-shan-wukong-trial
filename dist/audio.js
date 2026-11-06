/**
 * Original procedural score: "Mist at the Mountain Gate".
 * A newly composed, sparse D-minor pentatonic sequence, with synthesized
 * plucked strings, inharmonic bronze bells, a low fifth drone and soft frame
 * drums. No game recordings, copyrighted melodies or external audio are used.
 * A locally imported track replaces the procedural score for this session.
 */
const SCORE = {
  mountain: { pulse: 0.42, melody: 1, bells: 1, drums: 0.65, drone: 1, answer: 0.045 },
  moon: { pulse: 0.47, melody: 0.7, bells: 1.35, drums: 0.3, drone: 0.8, answer: 0.035 },
  danger: { pulse: 0.37, melody: 0.85, bells: 0.65, drums: 1, drone: 1.05, answer: 0.04 },
  battle: { pulse: 0.34, melody: 0.9, bells: 0.7, drums: 1.25, drone: 1.1, answer: 0.055 },
};

export class GameAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.effectsBus = null;
    this.volume = 0.8;
    this.musicVolume = 1;
    this.sfxVolume = 1;
    this.scene = 'menu';
    this._score = SCORE.mountain;
    this.muted = false;
    this.paused = true;
    this.disposed = false;
    this.error = null;
    this._timer = null;
    this._voices = new Set();
    this._step = 0;
    this._nextBeat = 0;
    this._customBuffer = null;
    this._customSource = null;
    this._customOffset = 0;
    this._customStartedAt = 0;
    this._loadVersion = 0;
    this._playbackVersion = 0;
  }

  _createContext() {
    if (this.context) return true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || this.disposed) return false;
    const ctx = this.context = new AudioContextClass({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.effectsBus = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.musicBus.gain.value = 0.8 * this.musicVolume;
    this.effectsBus.gain.value = 0.9 * this.sfxVolume;
    this.musicBus.connect(this.master);
    this.effectsBus.connect(this.master);

    // A limiter keeps simultaneously triggered impacts comfortable on phones.
    this._limiter = ctx.createDynamicsCompressor();
    this._limiter.threshold.value = -9;
    this._limiter.knee.value = 6;
    this._limiter.ratio.value = 12;
    this._limiter.attack.value = 0.002;
    this._limiter.release.value = 0.14;
    // The compressor shapes impacts; this transparent-until-loud last stage
    // also bounds pathological simultaneous hits and full-scale local files.
    this._safety = ctx.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = i * 2 / (curve.length - 1) - 1;
      const magnitude = Math.abs(x);
      curve[i] = Math.sign(x) * (magnitude <= 0.8 ? magnitude : 0.8 + 0.19 * (1 - Math.exp(-(magnitude - 0.8) / 0.19)));
    }
    this._safety.curve = curve;
    this._safety.oversample = '2x';
    this.master.connect(this._limiter);
    this._limiter.connect(this._safety);
    this._safety.connect(ctx.destination);

    // Short, dark stereo room response. It is generated once, not per note.
    this._reverb = ctx.createConvolver();
    const length = Math.floor(ctx.sampleRate * 2.2);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        smooth = smooth * 0.68 + (Math.random() * 2 - 1) * 0.32;
        samples[i] = smooth * Math.pow(1 - i / length, 3.5);
      }
    }
    this._reverb.buffer = impulse;
    this._reverbFilter = ctx.createBiquadFilter();
    this._reverbFilter.type = 'lowpass';
    this._reverbFilter.frequency.value = 2800;
    this._reverbGain = ctx.createGain();
    this._reverbGain.gain.value = 0.18;
    this._reverb.connect(this._reverbFilter);
    this._reverbFilter.connect(this._reverbGain);
    this._reverbGain.connect(this.musicBus);

    this._noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const noise = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
    return true;
  }

  async start() {
    if (this.disposed) return false;
    const version = ++this._playbackVersion;
    try {
      if (!this._createContext()) return false;
      await this.context.resume();
      // A pause/visibility change can arrive while mobile audio is unlocking.
      // An obsolete resume must not start a score behind the pause screen.
      if (this.disposed || version !== this._playbackVersion || this.context.state !== 'running') return false;
      this.error = null;
      const needsSchedule = this.paused || (!this._timer && !this._customSource);
      this.paused = false;
      if (needsSchedule) this._beginMusic();
      return true;
    } catch (error) {
      // Gesture restrictions or unavailable output must never break the game.
      this.error = error;
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._updateVolume();
  }

  setVolume(volume) {
    const value = Number(volume);
    if (Number.isFinite(value)) this.volume = Math.max(0, Math.min(1, value));
    this._updateVolume();
  }

  setMusicVolume(volume) {
    const value = Number(volume);
    if (Number.isFinite(value)) this.musicVolume = Math.max(0, Math.min(1, value));
    this._updateBus(this.musicBus, 0.8 * this.musicVolume);
  }

  setSfxVolume(volume) {
    const value = Number(volume);
    if (Number.isFinite(value)) this.sfxVolume = Math.max(0, Math.min(1, value));
    this._updateBus(this.effectsBus, 0.9 * this.sfxVolume);
  }

  // Keep one musical clock. A chapter changes the next notes and pulse, never
  // starts another loop or cuts off a ringing string from the previous scene.
  setScene(scene) {
    this.scene = scene;
    this._score = scene === 'moonwood' ? SCORE.moon
      : scene === 'emberpass' ? SCORE.danger
      : ['guardian', 'spirit', 'stoneking'].includes(scene) ? SCORE.battle : SCORE.mountain;
  }

  _updateBus(bus, value) {
    if (!bus || this.disposed) return;
    const now = this.context.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(value, now, 0.025);
  }

  _updateVolume() {
    if (!this.master || this.disposed) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.025);
  }

  _track(source, nodes, kind) {
    const voice = { source, nodes, kind };
    this._voices.add(voice);
    source.onended = () => {
      for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
      this._voices.delete(voice);
    };
    return voice;
  }

  _stopVoice(voice) {
    // Suspended contexts may defer onended. Release owned nodes immediately so
    // repeated pause/resume cannot retain stopped voices until audio returns.
    try { voice.source.stop(); } catch (_) {}
    for (const node of voice.nodes) { try { node.disconnect(); } catch (_) {} }
    this._voices.delete(voice);
  }

  _tone(frequency, time, duration, level, kind = 'music', wave = 'sine', endFrequency, attackTime = 0.012) {
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    // Keep not-yet-started notes silent if a skip cancels future automation.
    gain.gain.value = 0;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + Math.min(attackTime, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(kind === 'music' ? this.musicBus : this.effectsBus);
    if (kind === 'music') gain.connect(this._reverb);
    this._track(oscillator, [oscillator, gain], kind);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
  }

  _bell(frequency, time, level = 0.07, kind = 'music', duration = 1.8) {
    this._tone(frequency, time, duration, level, kind);
    this._tone(frequency * 2.005, time, duration * 0.56, level * 0.27, kind);
    this._tone(frequency * 2.76, time, duration * 0.28, level * 0.09, kind);
  }

  _pluck(frequency, time, level) {
    this._tone(frequency, time, 1.45, level);
    this._tone(frequency * 2, time, 0.47, level * 0.24);
    this._tone(frequency * 3, time, 0.16, level * 0.07);
  }

  _noise(time, duration, level, frequency, endFrequency, kind = 'effect', attackTime = 0.018, resonance = 0.65) {
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = resonance;
    filter.frequency.setValueAtTime(frequency, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), time + duration);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + Math.min(attackTime, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(kind === 'music' ? this.musicBus : this.effectsBus);
    this._track(source, [source, filter, gain], kind);
    source.start(time, Math.random() * 0.3, duration);
  }

  _beginMusic() {
    if (this._customBuffer) {
      this._playCustom();
      return;
    }
    this._nextBeat = this.context.currentTime + 0.08;
    this._schedule();
    this._timer = window.setInterval(() => this._schedule(), 100);
  }

  _schedule() {
    if (this.paused || this.disposed || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // Do not queue an entire missed song after returning from a hidden tab.
    if (this._nextBeat < now - 0.4) this._nextBeat = now + 0.04;
    const notes = [146.8324, 174.6141, 195.9977, 220, 261.6256];
    const melody = [0, -1, -1, 3, -1, -1, 2, -1, 1, -1, -1, -1, 2, -1, 0, -1,
      -1, -1, 4, -1, -1, 3, -1, -1, 2, -1, 1, -1, -1, -1, 0, -1];
    while (this._nextBeat < now + 0.25) {
      const time = this._nextBeat;
      const index = this._step % melody.length;
      const score = this._score;
      // Muting keeps the phrase clock but does not synthesize inaudible notes.
      if (this.muted || this.volume === 0 || this.musicVolume === 0) {
        this._step++;
        this._nextBeat += score.pulse;
        continue;
      }
      if (melody[index] >= 0) this._pluck(notes[melody[index]] * 2, time, 0.13 * score.melody);
      if (index === 4 || index === 20) this._bell(notes[index === 4 ? 3 : 0], time, 0.035 * score.bells, 'music', 3.1);
      // A quieter answering string phrase and half-bar taps add motion while
      // leaving plenty of space around staff transients and combat warnings.
      if (index === 22 || index === 28) this._pluck(notes[index === 22 ? 2 : 3], time + 0.06, score.answer);
      if (index % 8 === 0) {
        this._tone(95, time, 0.6, 0.11 * score.drums, 'music', 'sine', 47);
        this._tone(190, time, 0.18, 0.026 * score.drums, 'music', 'sine', 105);
        this._noise(time, 0.13, 0.035 * score.drums, 500, 90, 'music');
      } else if (index % 8 === 4) {
        this._tone(125, time, 0.24, 0.042 * score.drums, 'music', 'sine', 72);
        this._noise(time, 0.055, 0.018 * score.drums, 720, 280, 'music', 0.003);
      } else if (score === SCORE.battle && index % 4 === 2) {
        this._noise(time, 0.045, 0.018, 1500, 700, 'music', 0.003);
      }
      if (index === 0 || index === 16) {
        // Smooth long bass tones provide the drone without permanent nodes.
        this._softDrone(73.4162, time, score.pulse * 16 + 0.4, 0.025 * score.drone);
        this._softDrone(110, time, score.pulse * 16 + 0.4, 0.014 * score.drone);
      }
      this._step++;
      this._nextBeat += score.pulse;
    }
  }

  _softDrone(frequency, time, duration, level) {
    const ctx = this.context;
    const source = ctx.createOscillator();
    const gain = ctx.createGain();
    source.type = 'sine';
    source.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 1.2);
    gain.gain.setValueAtTime(level, time + duration - 1.4);
    gain.gain.linearRampToValueAtTime(0.0001, time + duration);
    source.connect(gain);
    gain.connect(this.musicBus);
    this._track(source, [source, gain], 'music');
    source.start(time);
    source.stop(time + duration + 0.03);
  }

  _staffSwing(time, combo = 0, heavy = false) {
    const variation = 0.97 + Math.random() * 0.06;
    if (heavy) {
      // A broad air sweep, deliberately without a hit transient. The actual
      // wood/bronze impact is emitted only when combat confirms a collision.
      this._noise(time, 0.36, 0.3, 1150 * variation, 180, 'effect', 0.065, 0.8);
      this._noise(time + 0.06, 0.22, 0.095, 2600, 650, 'effect', 0.04);
      this._tone(112, time + 0.045, 0.25, 0.055, 'effect', 'sine', 68, 0.035);
      return;
    }
    const durations = [0.18, 0.22, 0.27];
    const starts = [1900, 900, 1500];
    const ends = [540, 2100, 310];
    this._noise(time, durations[combo], 0.23 + combo * 0.025, starts[combo] * variation, ends[combo], 'effect', 0.026 + combo * 0.008, 0.85);
    this._noise(time + 0.025, 0.11, 0.055, 3300, 900, 'effect', 0.012);
    if (combo === 2) this._tone(150, time + 0.025, 0.15, 0.055, 'effect', 'sine', 90, 0.028);
  }

  _staffImpact(time, heavy = false, combo = 0) {
    const pitch = (0.97 + Math.random() * 0.06) * (1 + combo * 0.055);
    // Four perceptual layers: a short wood crack, resonating shaft, body thud,
    // and a restrained bronze ring. The upper body partial reads on speakers
    // too small to reproduce the sub-bass; no sustained distortion is used.
    this._noise(time, heavy ? 0.068 : 0.042, heavy ? 0.47 : 0.34, 2700 * pitch, 780, 'effect', 0.0015, 0.9);
    this._tone(430 * pitch, time, heavy ? 0.13 : 0.085, heavy ? 0.19 : 0.135, 'effect', 'triangle', 330 * pitch, 0.0015);
    this._tone(840 * pitch, time + 0.004, 0.058, heavy ? 0.075 : 0.045, 'effect', 'sine', 690 * pitch, 0.001);
    this._tone(heavy ? 170 : 145, time + 0.004, heavy ? 0.4 : 0.22, heavy ? 0.4 : 0.26, 'effect', 'sine', heavy ? 42 : 62, 0.004);
    this._tone(245 * pitch, time + 0.003, heavy ? 0.2 : 0.12, heavy ? 0.14 : 0.09, 'effect', 'sine', 112, 0.002);
    this._tone(690 * pitch, time + 0.01, heavy ? 0.43 : 0.22, heavy ? 0.047 : 0.026, 'effect', 'sine', undefined, 0.002);
    this._tone(1040 * pitch, time + 0.01, heavy ? 0.21 : 0.12, heavy ? 0.025 : 0.014, 'effect', 'sine', undefined, 0.001);
    if (heavy) {
      this._noise(time + 0.018, 0.34, 0.17, 260, 75, 'effect', 0.01, 0.55);
      this._noise(time + 0.055, 0.075, 0.09, 1700, 430, 'effect', 0.002);
    }
  }

  play(type, options = {}) {
    if (!this.context || this.paused || this.disposed || this.muted || this.volume === 0 || this.sfxVolume === 0 || this.context.state !== 'running') return;
    // Bound effect polyphony even when controls are pressed very quickly.
    if (this._voices.size > 110) return;
    const comboValue = Number(options?.combo);
    const combo = Number.isFinite(comboValue) ? ((Math.floor(comboValue) % 3) + 3) % 3 : 0;
    const time = this.context.currentTime + 0.005;
    switch (type) {
      case 'attack':
        this._staffSwing(time, combo, Boolean(options?.heavy));
        break;
      case 'swing0':
      case 'swing1':
      case 'swing2':
        this._staffSwing(time, Number(type.slice(-1)));
        break;
      case 'heavy':
        this._staffSwing(time, combo, true);
        break;
      case 'hit':
      case 'hitLight':
        this._staffImpact(time, Boolean(options?.heavy), combo);
        break;
      case 'hitHeavy':
        this._staffImpact(time, true, combo);
        break;
      case 'land':
        this._tone(105, time, 0.31, 0.21, 'effect', 'sine', 39, 0.004);
        this._noise(time, 0.17, 0.15, 250, 70, 'effect', 0.003);
        this._noise(time + 0.02, 0.09, 0.065, 1000, 280, 'effect', 0.008);
        break;
      case 'dodge':
        this._noise(time, 0.23, 0.12, 900, 2200, 'effect', 0.03);
        break;
      case 'perfectDodge':
        this._noise(time, 0.25, 0.13, 1500, 3100, 'effect', 0.025);
        this._bell(880, time + 0.018, 0.065, 'effect', 0.55);
        this._tone(1320, time + 0.04, 0.4, 0.022, 'effect');
        break;
      case 'bossSwing':
        this._noise(time, 0.43, 0.33, 800, 150, 'effect', 0.08, 0.8);
        this._noise(time + 0.07, 0.2, 0.13, 2300, 420, 'effect', 0.035);
        this._tone(90, time + 0.04, 0.28, 0.06, 'effect', 'sine', 52, 0.04);
        break;
      case 'bossSlam':
        this._staffImpact(time, true);
        this._noise(time + 0.03, 0.55, 0.24, 310, 65, 'effect', 0.012, 0.5);
        this._tone(67, time + 0.025, 0.6, 0.15, 'effect', 'sine', 34, 0.01);
        break;
      case 'spell':
        [293.6648, 391.9954, 440, 587.3295].forEach((note, i) => this._bell(note, time + i * 0.065, 0.08, 'effect', 0.9));
        break;
      case 'heal':
        [293.6648, 349.2282, 440].forEach((note, i) => this._bell(note, time + i * 0.13, 0.06, 'effect', 1.2));
        break;
      case 'victory':
        [293.6648, 391.9954, 440, 523.2511, 587.3295].forEach((note, i) => this._bell(note, time + i * 0.28, 0.08, 'effect', 2.4));
        break;
      case 'death':
        [146.8324, 110, 73.4162].forEach((note, i) => this._tone(note, time + i * 0.22, 1.4, 0.1, 'effect'));
        break;
      case 'cinematicStart':
        this._bell(146.8324, time, 0.115, 'cinematic', 1.8);
        this._tone(73.4162, time + 0.015, 1.45, 0.065, 'cinematic', 'sine', undefined, 0.08);
        this._noise(time, 0.65, 0.07, 420, 1200, 'cinematic', 0.16, 0.5);
        break;
      case 'cinematicReveal':
        this._noise(time, 0.58, 0.095, 360, 1150, 'cinematic', 0.18, 0.55);
        this._tone(146.8324, time, 0.6, 0.055, 'cinematic', 'sine', 220, 0.18);
        this._bell(220, time + 0.15, 0.08, 'cinematic', 0.82);
        this._tone(90, time + 0.24, 0.48, 0.19, 'cinematic', 'sine', 44, 0.008);
        this._noise(time + 0.24, 0.13, 0.09, 530, 100, 'cinematic', 0.004);
        break;
      case 'cinematicPhase':
        this._noise(time, 0.65, 0.17, 350, 1500, 'cinematic', 0.2, 0.7);
        this._tone(73.4162, time, 0.57, 0.095, 'cinematic', 'sine', 110, 0.18);
        this._tone(96, time + 0.58, 0.51, 0.28, 'cinematic', 'sine', 36, 0.004);
        this._tone(192, time + 0.58, 0.23, 0.075, 'cinematic', 'sine', 100, 0.003);
        this._noise(time + 0.58, 0.24, 0.16, 430, 80, 'cinematic', 0.004);
        this._bell(146.8324, time + 0.6, 0.055, 'cinematic', 0.62);
        break;
      case 'cinematicVictory':
        [293.6648, 349.2282, 391.9954, 440, 587.3295].forEach((note, i) => {
          this._bell(note, time + i * 0.16, i === 4 ? 0.095 : 0.078, 'cinematic', i === 4 ? 1.3 : 1.1);
        });
        this._tone(146.8324, time + 0.08, 1.7, 0.045, 'cinematic', 'sine', undefined, 0.1);
        this._tone(220, time + 0.08, 1.55, 0.022, 'cinematic', 'sine', undefined, 0.12);
        break;
      case 'cinematicDefeat':
        this._tone(110, time, 0.9, 0.13, 'cinematic', 'sine', 73.4162, 0.035);
        this._bell(146.8324, time + 0.04, 0.025, 'cinematic', 0.8);
        this._noise(time, 0.4, 0.065, 220, 70, 'cinematic', 0.06, 0.5);
        break;
    }
  }

  stopCinematic() {
    if (!this.context || this.disposed) return;
    const now = this.context.currentTime;
    for (const voice of this._voices) {
      if (voice.kind !== 'cinematic' || voice.cancelling) continue;
      voice.cancelling = true;
      // Cinematic voices use the effects bus, never the shared music reverb.
      // Cancel future attacks as well as tails, with a tiny fade to avoid a
      // click. The normal onended handler then disconnects and untracks them.
      const envelope = voice.nodes[voice.nodes.length - 1]?.gain;
      try {
        if (envelope) {
          if (typeof envelope.cancelAndHoldAtTime === 'function') envelope.cancelAndHoldAtTime(now);
          else {
            const value = envelope.value;
            envelope.cancelScheduledValues(now);
            envelope.setValueAtTime(value, now);
          }
          envelope.linearRampToValueAtTime(0, now + 0.012);
        }
        voice.source.stop(now + 0.014);
      } catch (_) {
        for (const node of voice.nodes) { try { node.disconnect(); } catch (_) {} }
        this._voices.delete(voice);
      }
    }
  }

  async loadFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('请选择音频文件。');
    if (file.size > 80 * 1024 * 1024) throw new Error('请使用小于 80 MB 的音乐文件。');
    if (this.disposed) throw new Error('音频已关闭，请刷新页面重试。');
    const version = ++this._loadVersion;
    // Unlock from the file gesture without unpausing the game settings screen.
    // A newer explicit resume/pause wins if it arrives during the await.
    const stayPaused = this.paused;
    const unlockVersion = this._playbackVersion + 1;
    await this.start();
    if (stayPaused && this._playbackVersion === unlockVersion) this.pause();
    if (!this.context) throw new Error('当前浏览器不支持网页音频。');
    let buffer;
    try {
      buffer = await this.context.decodeAudioData(await file.arrayBuffer());
    } catch (_) {
      throw new Error('无法读取这段音乐，请选择浏览器支持的 MP3、WAV 或 M4A 文件。');
    }
    if (version !== this._loadVersion || this.disposed) return false;
    this._stopMusic(false);
    this._customBuffer = buffer;
    this._customOffset = 0;
    if (!this.paused) this._playCustom();
    return true;
  }

  _playCustom() {
    if (!this._customBuffer || this._customSource || this.paused) return;
    const source = this.context.createBufferSource();
    source.buffer = this._customBuffer;
    source.loop = true;
    source.connect(this.musicBus);
    this._customStartedAt = this.context.currentTime;
    source.start(0, this._customOffset % this._customBuffer.duration);
    this._customSource = source;
    source.onended = () => { try { source.disconnect(); } catch (_) {} };
  }

  _stopMusic(preservePosition = true) {
    if (this._timer !== null) window.clearInterval(this._timer);
    this._timer = null;
    if (this._customSource) {
      if (preservePosition && this._customBuffer) {
        this._customOffset = (this._customOffset + this.context.currentTime - this._customStartedAt) % this._customBuffer.duration;
      }
      try { this._customSource.stop(); } catch (_) {}
      try { this._customSource.disconnect(); } catch (_) {}
      this._customSource = null;
    }
    for (const voice of this._voices) {
      if (voice.kind === 'music') {
        this._stopVoice(voice);
      }
    }
  }

  pause() {
    if (this.disposed) return;
    this._playbackVersion++;
    this.paused = true;
    if (!this.context) return;
    this._stopMusic(true);
    for (const voice of this._voices) {
      this._stopVoice(voice);
    }
    this.context.suspend().catch(() => {});
  }

  async resume() {
    return this.start();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.paused = true;
    this._loadVersion++;
    this._playbackVersion++;
    this._stopMusic(false);
    for (const voice of this._voices) {
      this._stopVoice(voice);
    }
    this._voices.clear();
    this._customBuffer = null;
    if (this.context) this.context.close().catch(() => {});
  }

  getState() {
    return {
      context: this.context?.state || 'unavailable', paused: this.paused,
      muted: this.muted, volume: this.volume,
      musicVolume: this.musicVolume, sfxVolume: this.sfxVolume,
      scene: this.scene, activeVoices: this._voices.size,
      musicLoops: Number(this._timer !== null) + Number(Boolean(this._customSource)),
      customTrack: Boolean(this._customBuffer), error: Boolean(this.error),
    };
  }
}
