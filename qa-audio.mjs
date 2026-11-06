// Lifecycle and mixer regression tests. The fake Web Audio host deliberately
// does not fire onended on stopped sources, as a suspended browser can defer it.
// These checks do not establish audible mixing quality or phone compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from './dist/audio.js';

function harness(t) {
  const timers = new Map(), nodes = [];
  let nextTimer = 0;
  class Parameter {
    value = 1;
    cancelScheduledValues() {}
    cancelAndHoldAtTime() {}
    setValueAtTime(value) { this.value = value; }
    setTargetAtTime(value) { this.value = value; }
    linearRampToValueAtTime(value) { this.value = value; }
    exponentialRampToValueAtTime(value) { this.value = value; }
  }
  function node(source = false) {
    const result = { connections: [], disconnected: false,
      connect(destination) { this.connections.push(destination); },
      disconnect() { this.connections = []; this.disconnected = true; },
      gain: new Parameter(), frequency: new Parameter(), Q: new Parameter(),
      threshold: new Parameter(), knee: new Parameter(), ratio: new Parameter(),
      attack: new Parameter(), release: new Parameter(),
    };
    if (source) Object.assign(result, {
      start(...args) { this.startArgs = args; },
      stop(time) { this.stopTime = time; this.stopped = true; },
    });
    nodes.push(result); return result;
  }
  class Context {
    state = 'suspended'; currentTime = 0; sampleRate = 1000; destination = {};
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createWaveShaper() { return node(); }
    createConvolver() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { return node(true); }
    createBufferSource() { return node(true); }
    createBuffer(channels, length) { return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) }; }
    async decodeAudioData() { return { duration: 30 }; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
  }
  globalThis.window = { AudioContext: Context,
    setInterval(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearInterval(id) { timers.delete(id); },
  };
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  return { audio, timers, nodes };
}
const file = () => ({ size: 8, arrayBuffer: async () => new ArrayBuffer(8) });

test('music and effects keep independent gains before and after audio unlock', async t => {
  const { audio } = harness(t);
  audio.setMusicVolume(0.25); audio.setSfxVolume(0.7); audio.setVolume(0.6);
  await audio.start();
  assert.equal(audio.musicBus.gain.value, 0.2);
  assert.equal(audio.effectsBus.gain.value, 0.63);
  assert.equal(audio.master.gain.value, 0.6);
  audio.setMusicVolume(0);
  assert.equal(audio.musicBus.gain.value, 0);
  assert.equal(audio.effectsBus.gain.value, 0.63);
  audio.setMuted(true); audio.setSfxVolume(0.4); audio.setMuted(false);
  assert.equal(audio.master.gain.value, 0.6);
  assert(Math.abs(audio.effectsBus.gain.value - 0.36) < 1e-9);
  assert.equal(audio.musicVolume, 0);
  audio.setMusicVolume(Infinity); audio.setSfxVolume(-2);
  assert.equal(audio.musicVolume, 0); assert.equal(audio.sfxVolume, 0);
});

test('repeated starts and chapter changes retain one musical clock', async t => {
  const { audio, timers } = harness(t);
  await audio.start(); const timer = [...timers.keys()][0];
  await audio.start(); await audio.start();
  const step = audio._step;
  audio.setScene('moonwood'); audio.setScene('guardian');
  assert.deepEqual([...timers.keys()], [timer]);
  assert.equal(audio._step, step);
  const beat = audio._nextBeat;
  audio.context.currentTime = beat;
  [...timers.values()][0]();
  assert.equal(Number((audio._nextBeat - beat).toFixed(2)), 0.34);
  assert.equal(audio.getState().musicLoops, 1);
});

test('a delayed unlock cannot escape a newer pause', async t => {
  const { audio, timers } = harness(t); audio._createContext();
  let unlock;
  audio.context.resume = () => new Promise(resolve => { unlock = () => { audio.context.state = 'running'; resolve(); }; });
  const pending = audio.start(); audio.pause(); unlock();
  assert.equal(await pending, false);
  assert.equal(audio.paused, true); assert.equal(timers.size, 0);
});

test('pause releases all stopped nodes even when onended is deferred', async t => {
  const { audio, timers } = harness(t); await audio.start(); audio.play('spell');
  const owned = [...audio._voices].flatMap(voice => voice.nodes);
  assert(owned.length > 0); const nextStep = audio._step;
  audio.pause();
  assert.equal(audio.getState().activeVoices, 0); assert.equal(timers.size, 0);
  assert(owned.every(node => node.disconnected));
  await audio.resume();
  assert.equal(timers.size, 1); assert(audio._step > nextStep, 'resume continues the phrase');
});

test('importing in paused settings decodes but does not resume music', async t => {
  const { audio, timers } = harness(t); await audio.start(); audio.pause();
  assert.equal(await audio.loadFile(file()), true);
  assert.equal(audio.paused, true); assert.equal(audio.context.state, 'suspended');
  assert.equal(timers.size, 0); assert.equal(audio._customSource, null);
  await audio.resume();
  assert.equal(audio.getState().musicLoops, 1); assert.equal(timers.size, 0);
  audio.context.currentTime = 4.2; audio.pause();
  assert.equal(audio._customOffset, 4.2);
  await audio.resume();
  assert.deepEqual(audio._customSource.startArgs, [0, 4.2]);
});

test('closing settings while a file decodes honors the newer resume', async t => {
  const { audio } = harness(t); audio._createContext();
  let finishDecode;
  audio.context.decodeAudioData = () => new Promise(resolve => { finishDecode = resolve; });
  const loading = audio.loadFile(file());
  // start() and file.arrayBuffer() each yield one microtask before decoding.
  for (let i = 0; i < 5 && !finishDecode; i++) await Promise.resolve();
  assert.equal(audio.paused, true);
  await audio.resume(); finishDecode({ duration: 20 });
  assert.equal(await loading, true); assert.equal(audio.paused, false);
  assert.equal(audio.getState().musicLoops, 1);
});

test('decode failure keeps the original score available and respects pause', async t => {
  const { audio, timers } = harness(t); audio._createContext();
  audio.context.decodeAudioData = async () => { throw new Error('unsupported'); };
  await assert.rejects(audio.loadFile(file()), /无法读取/);
  assert.equal(audio.paused, true); assert.equal(audio.getState().customTrack, false);
  await audio.resume(); assert.equal(timers.size, 1);
});

test('silent channels avoid generating hidden voices but preserve preferences', async t => {
  const { audio, nodes } = harness(t); audio.setMuted(true); await audio.start();
  const count = nodes.length;
  audio.play('bossSlam'); audio.context.currentTime = 2; audio._schedule();
  assert.equal(nodes.length, count); assert.equal(audio._voices.size, 0);
  audio.setMuted(false); audio.setSfxVolume(0); audio.play('spell');
  assert.equal(nodes.length, count);
  audio.setSfxVolume(0.5); audio.play('dodge'); assert(nodes.length > count);
});

test('dispose invalidates an in-flight import and leaves no scheduler or nodes', async t => {
  const { audio, timers } = harness(t); audio._createContext();
  let finishDecode;
  audio.context.decodeAudioData = () => new Promise(resolve => { finishDecode = resolve; });
  const loading = audio.loadFile(file());
  for (let i = 0; i < 5 && !finishDecode; i++) await Promise.resolve();
  audio.dispose(); finishDecode({ duration: 20 });
  assert.equal(await loading, false); assert.equal(await audio.start(), false);
  assert.equal(audio._voices.size, 0); assert.equal(timers.size, 0);
  assert.equal(audio._customSource, null); assert.equal(audio._customBuffer, null);
});
