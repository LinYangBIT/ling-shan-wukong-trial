import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {installRuntime} from './wechat-src/runtime.js';
import * as THREE from './dist/vendor/three.module.js';
import {CinematicDirector} from './dist/cinematics.js';

const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('./dist/main.js', import.meta.url), 'utf8');
function mockHost() {
  const events = new Map(), store = new Map(), canvases = [];
  const wx = {
    createCanvas() { const c = {width:300, height:150, getContext(kind) { return {kind, canvas:this}; }}; canvases.push(c); return c; },
    getWindowInfo:() => ({windowWidth:844, windowHeight:390, pixelRatio:3, safeArea:{left:44, top:0, right:800, bottom:369, width:756, height:369}}),
    getMenuButtonBoundingClientRect:() => ({left:720, top:8, right:820, bottom:40, width:100, height:32}),
    getStorageInfoSync:() => ({keys:[...store.keys()]}), getStorageSync:key => store.get(key) ?? '', setStorageSync:(key,value) => store.set(key,value), removeStorageSync:key => store.delete(key)
  };
  for (const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize','KeyDown','KeyUp']) {
    wx['on' + name] = cb => { const listeners = events.get(name) || new Set(); listeners.add(cb); events.set(name, listeners); };
    wx['off' + name] = cb => events.get(name)?.delete(cb);
  }
  return {wx, canvases, events, emit(name, event = {}) { for (const cb of events.get(name) || []) cb(event); }};
}

test('Mini Game DOM/runtime contract against real game markup and handlers', async t => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const oldRafDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const hostRaf = () => 17;
  Object.defineProperty(globalThis, 'requestAnimationFrame', {value:hostRaf, configurable:true, writable:true});
  const host = mockHost(), runtime = installRuntime(host.wx, html), document = runtime.document;
  const $ = id => document.getElementById(id);
  try {
    await t.test('real initial markup parses a single native main canvas and nested controls', () => {
      assert.equal(host.canvases.length, 1); assert.equal($('scene'), runtime.canvas); assert.equal(runtime.canvas.tagName, 'CANVAS');
      assert.equal(document.documentElement.tagName, 'HTML'); assert.equal(document.body.tagName, 'BODY');
      assert.equal(document.querySelector('.wordmark').querySelector('.brand-seal').textContent, '山');
      assert.equal($('start').querySelector('span.button-diamond').textContent, '◆');
      assert.equal($('modal').classList.contains('hidden'), true); assert.equal($('scene').isConnected, true);
      assert.deepEqual(document.querySelectorAll('#hud button').map(button => button.id).sort(), ['route-map','sprint','attack','heavy','dodge','spell','heal','lock'].sort());
    });
    await t.test('offscreen canvas creation preserves the screen canvas and native context receiver', () => {
      const other = document.createElement('canvas'); other.width = 1024;
      assert.equal(host.canvases.length, 2); assert.notEqual(other, runtime.canvas); assert.equal($('scene'), runtime.canvas);
      assert.equal(other.getContext('2d').canvas, other); assert.equal(other.width, 1024);
      runtime.canvas.style.width = '844px'; assert.equal(runtime.canvas.style.width, '844px');
    });
    await t.test('style, classList, attributes, dataset, text and detached IDs behave consistently', () => {
      const el = document.createElement('section'); el.innerHTML = '<button id="adapter-tmp" data-action="one">A &amp; B<span>中文</span></button>';
      document.body.append(el); const button = $('adapter-tmp'); assert.equal(button.textContent, 'A & B中文');
      button.classList.add('active', 'large'); assert(button.matches('button.active[data-action="one"]'));
      button.classList.toggle('active', false); assert(!button.classList.contains('active'));
      button.dataset.action = 'two'; assert(button.matches('[data-action="two"]'));
      button.style.cssText = 'font-size: 16px; opacity: .5'; assert.equal(button.style.fontSize, '16px');
      el.textContent = '替换'; assert.equal($('adapter-tmp'), null); assert.equal(button.isConnected, false); el.remove();
    });
    await t.test('select/option values and property/listener input handlers work', () => {
      const container = document.createElement('div'); container.innerHTML = '<select id="select-test"><option value="low">流畅</option><option value="high" selected>精致</option></select><input id="range-test" type="range" value=".8">'; document.body.append(container);
      const select = $('select-test'), input = $('range-test'); assert.equal(select.value, 'high'); assert.equal(input.value, '.8');
      let property = '', listener = 0; select.onchange = e => property = e.target.value; select.addEventListener('change', () => listener++);
      select.value = 'low'; select.dispatchEvent({type:'change'}); assert.equal(property, 'low'); assert.equal(listener, 1); container.remove();
    });
    await t.test('same-target button release clicks once and dragging away does not click', () => {
      const button = $('start'); let clicks = 0; button.onclick = () => clicks++;
      runtime.hitTest = x => x < 100 ? button : null;
      host.emit('TouchStart', {changedTouches:[{identifier:1, clientX:20, clientY:10}]}); host.emit('TouchEnd', {changedTouches:[{identifier:1, clientX:20, clientY:10}]});
      assert.equal(clicks, 1);
      host.emit('TouchStart', {changedTouches:[{identifier:2, clientX:20, clientY:10}]}); host.emit('TouchEnd', {changedTouches:[{identifier:2, clientX:200, clientY:10}]}); assert.equal(clicks, 1);
    });
    await t.test('multi-touch capture keeps joystick and camera gestures independent', () => {
      const joystick = $('joystick'), camera = $('camera-pad'); const received = [];
      runtime.hitTest = x => x < 100 ? joystick : camera;
      const start = e => e.currentTarget.setPointerCapture(e.pointerId);
      const move = e => received.push([e.currentTarget.id,e.pointerId,e.clientX]);
      joystick.addEventListener('pointerdown', start); camera.addEventListener('pointerdown', start); joystick.addEventListener('pointermove', move); camera.addEventListener('pointermove', move);
      runtime.dispatchPointer('pointerdown', {pointerId:4, clientX:20, clientY:10}); runtime.dispatchPointer('pointerdown', {pointerId:5, clientX:200, clientY:10});
      runtime.dispatchPointer('pointermove', {pointerId:4, clientX:300, clientY:10}); runtime.dispatchPointer('pointermove', {pointerId:5, clientX:20, clientY:10});
      assert.deepEqual(received, [['joystick',4,300],['camera-pad',5,20]]);
      runtime.dispatchPointer('pointerup', {pointerId:4, clientX:300}); runtime.dispatchPointer('pointercancel', {pointerId:5, clientX:20});
      assert(!joystick.hasPointerCapture(4)); assert(!camera.hasPointerCapture(5));
    });
    await t.test('hide releases active pointers and updates visibility before notifying', () => {
      const joystick = $('joystick'); let cancelled = 0, visibility = [];
      joystick.addEventListener('pointercancel', () => cancelled++); document.addEventListener('visibilitychange', () => visibility.push(document.hidden));
      runtime.hitTest = () => joystick; runtime.dispatchPointer('pointerdown', {pointerId:8, clientX:20}); assert(joystick.hasPointerCapture(8));
      host.emit('Hide'); assert.equal(cancelled, 1); assert.equal(joystick.hasPointerCapture(8), false); assert.equal(document.visibilityState, 'hidden');
      host.emit('Show'); assert.deepEqual(visibility, [true,false]); assert.equal(document.visibilityState, 'visible');
    });
    await t.test('resize updates the same metrics object and global pixel coordinates', () => {
      const metrics = runtime.metrics; let count = 0; globalThis.addEventListener('resize', () => count++);
      host.emit('WindowResize', {size:{windowWidth:932, windowHeight:430}});
      assert.equal(runtime.metrics, metrics); assert.equal(metrics.width, 932); assert.equal(globalThis.innerWidth, 932); assert.equal(count, 1);
      assert.equal(metrics.pixelRatio, 3); assert.equal(metrics.safeArea.left, 44); assert.equal(metrics.menuButtonRect.width, 100);
      $('joystick').__rect = {x:28,y:180,width:100,height:100}; assert.equal($('joystick').getBoundingClientRect().right, 128);
    });
    await t.test('storage preserves original strings, missing values and empty values', () => {
      assert.equal(localStorage.getItem('missing'), null); localStorage.setItem('prefs', '{"quality":"low"}'); assert.equal(localStorage.getItem('prefs'), '{"quality":"low"}');
      localStorage.setItem('empty', ''); assert.equal(localStorage.getItem('empty'), ''); localStorage.removeItem('prefs'); assert.equal(localStorage.getItem('prefs'), null);
    });
    await t.test('host requestAnimationFrame remains the same function and key events target body', () => {
      assert.equal(globalThis.requestAnimationFrame, hostRaf); assert.equal(window.requestAnimationFrame(), 17);
      const events = []; const listener = event => events.push({code:event.code,target:event.target.tagName,repeat:event.repeat});
      globalThis.addEventListener('keydown', listener); runtime.dispatchKey('keydown', 'KeyJ'); host.emit('KeyDown', {code:'KeyK',repeat:true});
      assert.deepEqual(events, [{code:'KeyJ',target:'BODY',repeat:false},{code:'KeyK',target:'BODY',repeat:true}]); globalThis.removeEventListener('keydown', listener);
    });

    const sourceFunction = name => {
      const start = main.indexOf('function ' + name + '('); assert(start >= 0, name + ' exists');
      const next = main.indexOf('\nfunction ', start + 1); return main.slice(start, next < 0 ? main.length : next).split('\nconst ')[0];
    };
    const context = vm.createContext({document, $, stage:'moonwood', prefs:{volume:.8,cinematics:true,quality:'medium',difficulty:'normal'}, audio:{setVolume() {},loadFile:async()=>{}}, selected:null, saveCount:0, closeCount:0,
      isExpansionRoute:kind => ['moonwood','emberpass'].includes(kind), selectChapter:kind => { context.selected = kind; }, watchCinematic:type => { context.selected = type; }, closeModal:() => context.closeCount++, save:() => context.saveCount++, setQuality() {},
      openModal:(title,content,kicker) => { $('modal-title').textContent = title; $('modal-kicker').textContent = kicker || ''; $('modal-content').innerHTML = content; $('modal').classList.remove('hidden'); }
    });
    for (const name of ['stageNames','stageDescriptions']) vm.runInContext(main.match(new RegExp('const ' + name + '=.*'))[0], context);
    await t.test('actual chapterSelect creates and binds every nested chapter button', () => {
      vm.runInContext(sourceFunction('chapterSelect') + '\nchapterSelect();', context);
      const buttons = document.querySelectorAll('[data-chapter]'); assert.equal(buttons.length, 8);
      assert(buttons.find(b => b.dataset.chapter === 'moonwood').querySelector('em').textContent === '新');
      buttons.find(b => b.dataset.chapter === 'stoneking').click(); assert.equal(context.selected, 'stoneking');
    });
    await t.test('actual settings markup and handlers update prefs without synthetic browser controls', () => {
      vm.runInContext(sourceFunction('settings') + '\nsettings();', context);
      assert.equal($('quality-select').querySelectorAll('option').length, 3); assert.equal($('quality-select').value, 'medium');
      $('quality-select').value = 'low'; $('quality-select').dispatchEvent({type:'change'}); assert.equal(context.prefs.quality, 'low');
      $('volume-slider').value = '.45'; $('volume-slider').dispatchEvent({type:'input'}); assert.equal(context.prefs.volume, .45); assert.equal($('volume-value').textContent, '45%');
      $('settings-done').click(); assert.equal(context.closeCount, 1); assert.equal(context.saveCount, 2);
      assert.equal(document.querySelectorAll('[data-chapter]').length, 0);
    });
    await t.test('actual cinema gallery, route map and guide dynamic buttons bind', () => {
      vm.runInContext(sourceFunction('cinemaGallery') + '\ncinemaGallery();', context);
      assert.equal(document.querySelectorAll('[data-cinema]').length, 4); document.querySelector('[data-cinema="intro"]').click(); assert.equal(context.selected, 'intro');
      vm.runInContext(sourceFunction('routeMap') + '\nrouteMap();', context); assert.equal(document.querySelectorAll('.route-list li').length, 8); $('map-close').click();
      vm.runInContext(sourceFunction('guide') + '\nguide();', context); assert.equal(document.querySelectorAll('.guide-item').length, 4); $('guide-close').click(); assert.equal(context.closeCount, 3);
    });
    await t.test('real CinematicDirector creates overlay, renders text, skips and restores focus', () => {
      const camera = new THREE.PerspectiveCamera(), hero = new THREE.Object3D(), boss = new THREE.Object3D(); hero.position.set(0,0,10); boss.position.set(0,0,-5);
      let result = null; $('start').focus(); const director = new CinematicDirector({camera,hero,boss,audio:{play() {},stopCinematic() {}},onComplete:r=>result=r});
      director.start('intro'); assert.equal(director.element.hidden, false); assert.equal(document.activeElement.className, 'cinematic-skip');
      director.update(.5); assert(director.element.querySelector('.cinematic-caption').textContent.length > 0); assert(director.element.querySelector('.cinematic-progress').firstElementChild.style.transform.startsWith('scaleX('));
      director.element.querySelector('.cinematic-skip').click(); assert.equal(result.skipped, true); assert.equal(director.element.hidden, true); assert.equal(document.activeElement, $('start'));
    });
    await t.test('event bubbling and once/removal have ordinary control semantics', () => {
      const parent = document.createElement('div'), child = document.createElement('button'); parent.append(child); document.body.append(parent); const calls = [];
      parent.addEventListener('click', () => calls.push('parent')); child.addEventListener('click', e => { calls.push('once'); e.stopPropagation(); }, {once:true}); child.onclick = () => calls.push('property');
      child.click(); child.click(); assert.deepEqual(calls, ['property','once','property','parent']); parent.remove();
    });
  } finally {
    runtime.dispose();
    if (oldRafDescriptor) Object.defineProperty(globalThis, 'requestAnimationFrame', oldRafDescriptor); else delete globalThis.requestAnimationFrame;
  }
  assert.equal(globalThis.document, oldDocument); assert.equal(globalThis.window, oldWindow);
  for (const listeners of host.events.values()) assert.equal(listeners.size, 0);
});
