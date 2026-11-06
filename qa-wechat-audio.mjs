import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio, AUDIO_ASSET_NAMES } from './wechat-src/audio.js';

// The fake exercises lifecycle races and resource ownership. It does not prove
// native-device playback, decoding, latency or audible mixing quality.
function harness(options = {}) {
  const contexts = [];
  const host = { createInnerAudioContext(config) {
    const callbacks = { Play: new Set(), Ended: new Set(), Error: new Set() };
    const ctx = { config, paused: true, currentTime: 0, plays: 0, pauses: 0, stops: 0, destroys: 0,
      play() { this.plays++; this.paused = false; },
      pause() { this.pauses++; this.paused = true; },
      stop() { this.stops++; this.paused = true; this.currentTime = 0; },
      destroy() { this.destroys++; this.paused = true; },
      emit(type, value) { if (type === 'Ended') this.paused = true; for (const callback of [...callbacks[type]]) callback(value); },
      listeners(type) { return [...callbacks[type]]; },
    };
    for (const type of Object.keys(callbacks)) {
      ctx['on' + type] = fn => callbacks[type].add(fn);
      ctx['off' + type] = fn => callbacks[type].delete(fn);
    }
    contexts.push(ctx); return ctx;
  } };
  const audio = new GameAudio({ wx: host, ...options });
  return { audio, contexts, host };
}

test('default music starts once, loops, and remains one player across repeated starts', async () => {
  const { audio, contexts } = harness();
  assert.equal(audio.volume, 0.8); assert.equal(audio.muted, false);
  assert.equal(await audio.start(), true);
  await audio.start(); await audio.start();
  assert.equal(contexts.length, 1); assert.equal(contexts[0].plays, 1);
  assert.equal(contexts[0].src, 'audio/bgm.mp3'); assert.equal(contexts[0].loop, true);
  assert.equal(contexts[0].volume, 0.8); assert.equal(contexts[0].config.useWebAudioImplement, false);
});

test('saved mute prevents creation and survives pause/resume until explicitly unmuted', async () => {
  const { audio, contexts } = harness(); audio.setMuted(true);
  await audio.start(); audio.pause(); await audio.resume();
  assert.equal(contexts.length, 0); assert.equal(audio.muted, true);
  assert.equal(audio.play('heavy'), false);
  audio.setMuted(false); assert.equal(contexts.length, 1); assert.equal(contexts[0].plays, 1);
});

test('pause preserves BGM position, destroys effects, and resume does not replay old effects', async () => {
  const { audio, contexts } = harness(); await audio.start(); audio.play('heavy');
  contexts[0].currentTime = 4.2; audio.pause();
  assert.equal(contexts[0].currentTime, 4.2); assert.equal(contexts[1].destroys, 1);
  assert.equal(audio.getState().activeEffects, 0); assert.equal(audio.play('heal'), false);
  await audio.resume(); assert.equal(contexts[0].plays, 2); assert.equal(contexts[0].currentTime, 4.2);
  assert.equal(contexts.length, 2);
});

test('late native music start cannot escape pause or dispose', async () => {
  const { audio, contexts } = harness(); await audio.start();
  const music = contexts[0]; audio.pause(); music.emit('Play');
  assert.equal(music.paused, true); assert.equal(audio.getState().musicRequested, false);
  audio.dispose(); music.emit('Play'); assert.equal(music.paused, true);
  assert.equal(await audio.resume(), false); assert.equal(contexts.length, 1);
});

test('bounded effect pool reuses completed voices and never grows with attack spam', async () => {
  const { audio, contexts } = harness({ maxEffects: 3 }); await audio.start();
  assert.equal(audio.play('swing0'), true); assert.equal(audio.play('hitLight'), true); assert.equal(audio.play('land'), true);
  for (let i = 0; i < 100; i++) assert.equal(audio.play('spell'), false);
  assert.equal(contexts.length, 4); assert.equal(audio.getState().activeEffects, 3);
  contexts[1].emit('Ended'); assert.equal(audio.play('heal'), true);
  assert.equal(contexts.length, 4); assert.equal(contexts[1].src, 'audio/heal.mp3');
  assert.equal(contexts[1].config.useWebAudioImplement, true);
});

test('delayed callback from a reused effect does not release the replacement', async () => {
  const { audio, contexts } = harness({ maxEffects: 1 }); await audio.start(); audio.play('swing0');
  const voice = contexts[1], oldEnded = voice.listeners('Ended')[0], oldError = voice.listeners('Error')[0];
  voice.emit('Ended'); audio.play('hitHeavy'); oldEnded(); oldError({ errMsg: 'stale error' });
  assert.equal(audio.getState().activeEffects, 1); assert.equal(voice.destroys, 0); assert.equal(audio.error, null);
  assert.equal(voice.listeners('Ended').length, 1); assert.equal(voice.listeners('Error').length, 1);
});

test('cinematic skip stops cinematic cues while BGM and combat effects continue', async () => {
  const { audio, contexts } = harness(); await audio.start();
  audio.play('hitLight'); audio.enterCinematic('intro'); audio.play('cinematicReveal');
  const cinematic = contexts.slice(2); audio.stopCinematic();
  assert(cinematic.every(ctx => ctx.destroys === 1));
  assert.equal(contexts[0].paused, false); assert.equal(contexts[1].destroys, 0);
  assert.equal(audio.getState().activeEffects, 1);
});

test('mute and zero volume stop active effects and resume only a single BGM', async () => {
  const { audio, contexts } = harness(); await audio.start(); audio.play('heavy');
  audio.setMuted(true); assert.equal(contexts[0].volume, 0); assert.equal(contexts[0].paused, true);
  assert.equal(contexts[1].destroys, 1); audio.setMuted(false);
  assert.equal(contexts[0].plays, 2); audio.setVolume(0); assert.equal(contexts[0].paused, true);
  assert.equal(audio.play('spell'), false); audio.setVolume(0.35);
  assert.equal(contexts[0].volume, 0.35); assert.equal(contexts[0].plays, 3);
  audio.setVolume(Infinity); assert.equal(audio.volume, 0.35);
  audio.setVolume(3); assert.equal(audio.volume, 1); audio.setVolume(-3); assert.equal(audio.volume, 0);
});

test('all direct cues and attack/hit aliases resolve to packaged assets', async () => {
  const { audio, contexts } = harness(); await audio.start();
  for (const name of AUDIO_ASSET_NAMES.filter(name => name !== 'bgm')) {
    assert.equal(audio.play(name), true); const voice = contexts[1];
    assert.equal(voice.src, `audio/${name}.mp3`); voice.emit('Ended');
  }
  for (const [type, options, expected] of [['attack', { combo: -1 }, 'swing2'], ['attack', { heavy: true }, 'heavy'], ['hit', {}, 'hitLight'], ['hitLight', { heavy: true }, 'hitHeavy']]) {
    assert.equal(audio.play(type, options), true); assert.equal(contexts[1].src, `audio/${expected}.mp3`); contexts[1].emit('Ended');
  }
  assert.equal(audio.play('unknown'), false); assert.equal(contexts.length, 2);
});

test('music failure is nonfatal and a later interaction can create a fresh player', async () => {
  const { audio, contexts } = harness(); await audio.start();
  contexts[0].emit('Error', { errCode: 10003, errMsg: 'file unavailable' });
  assert.equal(contexts[0].destroys, 1); assert.equal(audio.getState().musicRequested, false);
  assert.equal(await audio.start(), true); assert.equal(contexts.length, 2);
  contexts[1].emit('Play'); assert.equal(audio.error, null);
});

test('effect failure frees its pool slot without interrupting BGM', async () => {
  const { audio, contexts } = harness({ maxEffects: 1 }); await audio.start(); audio.play('land');
  contexts[1].emit('Error', { errCode: 10003 });
  assert.equal(audio.getState().effectPlayers, 0); assert.equal(contexts[0].paused, false);
  assert.equal(audio.play('heal'), true); assert.equal(contexts.length, 3);
});

test('explicit resume recovers audio paused by a system interruption', async () => {
  const { audio, contexts } = harness(); await audio.start(); contexts[0].paused = true;
  await audio.resume(); assert.equal(contexts[0].plays, 2); assert.equal(contexts.length, 1);
});

test('dispose releases every native player exactly once and ignores delayed errors', async () => {
  const { audio, contexts } = harness(); await audio.start(); audio.play('heavy'); audio.play('cinematicStart');
  const staleError = contexts[1].listeners('Error')[0]; audio.dispose(); audio.dispose(); staleError({ errMsg: 'late' });
  assert(contexts.every(ctx => ctx.destroys === 1)); assert.equal(audio.getState().effectPlayers, 0);
  assert.equal(audio.play('heal'), false); assert.equal(await audio.start(), false);
});

test('missing native API and unsupported file import produce clear errors without throwing from start', async () => {
  const audio = new GameAudio({ wx: {} }); assert.equal(await audio.start(), false);
  assert.match(audio.error.message, /无法创建音频播放器/);
  await assert.rejects(audio.loadFile({}), /微信小游戏暂不支持导入本地音乐/);
});
