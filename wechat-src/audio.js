// WeChat's WebAudio subset does not document ConvolverNode, used by the web
// score. Play offline renders of that original score through InnerAudio instead.
// Official API: github.com/wechat-miniprogram/minigame-api-typings
export const AUDIO_ASSET_NAMES = Object.freeze([
  'bgm', 'swing0', 'swing1', 'swing2', 'heavy', 'hitLight', 'hitHeavy', 'land',
  'dodge', 'perfectDodge', 'bossSwing', 'bossSlam', 'spell', 'heal', 'victory',
  'death', 'cinematicStart', 'cinematicReveal', 'cinematicPhase',
  'cinematicVictory', 'cinematicDefeat',
]);
const EFFECTS = new Set(AUDIO_ASSET_NAMES.filter(name => name !== 'bgm'));
const CINEMATIC_NAMES = {
  intro: 'cinematicStart', phase2: 'cinematicPhase',
  victory: 'cinematicVictory', defeat: 'cinematicDefeat',
};

export class GameAudio {
  constructor({ wx: host = globalThis.wx, assetRoot = 'audio', maxEffects = 6 } = {}) {
    this.wx = host;
    this.assetRoot = assetRoot.replace(/\/+$/, '');
    this.maxEffects = Math.max(1, Math.min(12, Math.floor(Number(maxEffects) || 6)));
    this.volume = 0.8;
    this.muted = false;
    this.paused = true;
    this.disposed = false;
    this.error = null;
    this._music = null;
    this._musicRequested = false;
    this._effects = [];
  }

  _audible() { return !this.disposed && !this.paused && !this.muted && this.volume > 0; }
  _path(name) { return `${this.assetRoot}/${name}.mp3`; }
  _createContext(shortSound) {
    if (typeof this.wx?.createInnerAudioContext !== 'function') {
      throw new Error('当前微信环境无法创建音频播放器。');
    }
    // Native streaming suits the long BGM; the WebAudio-backed implementation
    // is recommended by WeChat for frequently played short effects.
    const context = this.wx.createInnerAudioContext({ useWebAudioImplement: shortSound });
    context.autoplay = false;
    context.loop = false;
    context.volume = this.muted ? 0 : this.volume;
    return context;
  }

  _ensureMusic() {
    if (this._music) return this._music;
    const context = this._createContext(false);
    this._music = context;
    context.loop = true;
    context.onError(error => {
      if (this._music !== context || this.disposed) return;
      this.error = error;
      this._musicRequested = false;
      this._music = null;
      try { context.destroy(); } catch (_) {}
    });
    context.onPlay(() => {
      if (this._music !== context || !this._audible() || !this._musicRequested) {
        try { context.pause(); } catch (_) {}
        return;
      }
      this.error = null;
    });
    context.src = this._path('bgm');
    return context;
  }

  _resumeMusic() {
    if (!this._audible() || this._musicRequested) return true;
    try {
      const context = this._ensureMusic();
      // Mark before play(): native callbacks can arrive synchronously.
      this._musicRequested = true;
      context.play();
      return this._music === context && this._musicRequested;
    } catch (error) {
      this.error = error;
      this._musicRequested = false;
      if (this._music) {
        try { this._music.destroy(); } catch (_) {}
        this._music = null;
      }
      return false;
    }
  }

  async start() {
    if (this.disposed) return false;
    this.paused = false;
    return this._resumeMusic();
  }

  async resume() {
    // A system interruption can pause native audio without a game pause call.
    // An explicit resume should recover it, but repeated start() stays idempotent.
    if (this._music?.paused) this._musicRequested = false;
    return this.start();
  }

  _pauseMusic() {
    this._musicRequested = false;
    try { this._music?.pause(); } catch (_) {}
  }

  _detach(voice) {
    try { if (voice.onEnded) voice.context.offEnded?.(voice.onEnded); } catch (_) {}
    try { if (voice.onError) voice.context.offError?.(voice.onError); } catch (_) {}
    voice.onEnded = voice.onError = null;
  }

  _retire(voice) {
    // Invalidate callbacks before stop/destroy: a delayed native callback from
    // the old sound must not free or stop a newly allocated sound.
    voice.version++;
    voice.active = false;
    this._detach(voice);
    const index = this._effects.indexOf(voice);
    if (index >= 0) this._effects.splice(index, 1);
    try { voice.context.stop(); } catch (_) {}
    try { voice.context.destroy(); } catch (_) {}
  }

  _stopEffects(predicate = () => true) {
    for (const voice of [...this._effects]) if (predicate(voice)) this._retire(voice);
  }

  setVolume(volume) {
    const value = Number(volume);
    if (Number.isFinite(value)) this.volume = Math.max(0, Math.min(1, value));
    this._updateVolume();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._updateVolume();
  }

  _updateVolume() {
    if (this.disposed) return;
    const volume = this.muted ? 0 : this.volume;
    try { if (this._music) this._music.volume = volume; } catch (_) {}
    for (const voice of this._effects) {
      try { voice.context.volume = volume; } catch (_) {}
    }
    if (!this._audible()) {
      this._pauseMusic();
      this._stopEffects();
    } else this._resumeMusic();
  }

  play(type, options = {}) {
    if (!this._audible()) return false;
    const comboValue = Number(options?.combo);
    const combo = Number.isFinite(comboValue) ? ((Math.floor(comboValue) % 3) + 3) % 3 : 0;
    let name = type;
    if (type === 'attack') name = options?.heavy ? 'heavy' : `swing${combo}`;
    if (type === 'hit' || type === 'hitLight') name = options?.heavy ? 'hitHeavy' : 'hitLight';
    if (!EFFECTS.has(name)) return false;
    let voice = this._effects.find(item => !item.active);
    if (!voice && this._effects.length >= this.maxEffects) return false;
    try {
      if (!voice) {
        voice = { context: this._createContext(true), active: false, version: 0, kind: '', onEnded: null, onError: null };
        this._effects.push(voice);
      }
      this._detach(voice);
      const version = ++voice.version;
      voice.active = true;
      voice.kind = name.startsWith('cinematic') ? 'cinematic' : 'effect';
      voice.onEnded = () => {
        if (this.disposed || voice.version !== version) return;
        voice.active = false;
      };
      voice.onError = error => {
        if (this.disposed || voice.version !== version) return;
        this.error = error;
        this._retire(voice);
      };
      voice.context.onEnded(voice.onEnded);
      voice.context.onError(voice.onError);
      voice.context.stop();
      voice.context.volume = this.volume;
      voice.context.src = this._path(name);
      voice.context.play();
      return voice.active && voice.version === version;
    } catch (error) {
      this.error = error;
      if (voice) this._retire(voice);
      return false;
    }
  }

  enterCinematic(type) {
    this.stopCinematic();
    return this.play(CINEMATIC_NAMES[type] || type);
  }

  stopCinematic() { this._stopEffects(voice => voice.kind === 'cinematic'); }

  async loadFile() {
    throw new Error('微信小游戏暂不支持导入本地音乐，当前播放原创配乐。');
  }

  pause() {
    if (this.disposed) return;
    this.paused = true;
    this._pauseMusic();
    this._stopEffects();
  }

  dispose() {
    if (this.disposed) return;
    this.paused = true;
    this.disposed = true;
    this._musicRequested = false;
    this._stopEffects();
    const context = this._music;
    this._music = null;
    try { context?.stop(); } catch (_) {}
    try { context?.destroy(); } catch (_) {}
  }

  getState() {
    return { paused: this.paused, muted: this.muted, volume: this.volume, disposed: this.disposed,
      musicRequested: this._musicRequested, effectPlayers: this._effects.length,
      activeEffects: this._effects.filter(voice => voice.active).length, error: this.error };
  }
}
