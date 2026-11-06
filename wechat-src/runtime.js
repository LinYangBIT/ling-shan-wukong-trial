// The game uses a small, explicit subset of the DOM. This adapter keeps its
// existing UI state and handlers while the Mini Game HUD draws those nodes.
const VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const decode = text => String(text).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, code) => {
  if (code[0] === '#') { const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10); return n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
  return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'})[code.toLowerCase()];
});
const escapeText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class MiniEventTarget {
  constructor() { this._listeners = new Map(); }
  addEventListener(type, callback, options) {
    if (!callback) return;
    const list = this._listeners.get(type) || [];
    if (!list.some(item => item.callback === callback)) list.push({callback, once: !!options?.once});
    this._listeners.set(type, list);
  }
  removeEventListener(type, callback) {
    this._listeners.set(type, (this._listeners.get(type) || []).filter(item => item.callback !== callback));
  }
  dispatchEvent(event) {
    if (!event || !event.type) throw new TypeError('Event needs a type');
    const identity = this._identity || this;
    if (!event.target) event.target = identity;
    if (!event.preventDefault) event.preventDefault = function () { this.defaultPrevented = true; };
    if (!event.stopPropagation) event.stopPropagation = function () { this._stopped = true; };
    if (!event.stopImmediatePropagation) event.stopImmediatePropagation = function () { this._stopped = this._immediateStopped = true; };
    event.currentTarget = identity;
    const propertyHandler = identity['on' + event.type];
    if (typeof propertyHandler === 'function') propertyHandler.call(identity, event);
    for (const item of [...(this._listeners.get(event.type) || [])]) {
      if (event._immediateStopped) break;
      if (item.once) this.removeEventListener(event.type, item.callback);
      if (typeof item.callback === 'function') item.callback.call(identity, event);
      else item.callback.handleEvent?.(event);
    }
    if (event.bubbles && !event._stopped) {
      const parent = this.parentNode || (this.nodeType === 9 ? this._windowEvents : null);
      parent?.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }
}

function createStyle(dirty) {
  const values = Object.create(null);
  Object.defineProperties(values, {
    setProperty: {value(name, value) { this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); }},
    getPropertyValue: {value(name) { return this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] || ''; }},
    removeProperty: {value(name) { const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); const old = this[key] || ''; delete this[key]; dirty(); return old; }},
    cssText: {get() { return Object.entries(this).map(([key, value]) => `${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${value}`).join(';'); }, set(value) {
      for (const key of Object.keys(this)) delete this[key];
      for (const part of String(value).split(';')) { const i = part.indexOf(':'); if (i >= 0) this.setProperty(part.slice(0, i).trim(), part.slice(i + 1).trim()); }
      dirty();
    }}
  });
  return new Proxy(values, {set(target, key, value, receiver) { if (Reflect.get(target, key, receiver) !== value) { Reflect.set(target, key, value, receiver); dirty(); } return true; }});
}

function matchesPart(node, selector) {
  if (node.nodeType !== 1) return false;
  let rest = selector.trim();
  const tag = rest.match(/^(\*|[\w-]+)/);
  if (tag) { if (tag[1] !== '*' && node.tagName !== tag[1].toUpperCase()) return false; rest = rest.slice(tag[0].length); }
  while (rest) {
    let m;
    if ((m = rest.match(/^#([\w-]+)/))) { if (node.id !== m[1]) return false; }
    else if ((m = rest.match(/^\.([\w-]+)/))) { if (!node.classList.contains(m[1])) return false; }
    else if ((m = rest.match(/^\[([^\s\]=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*\]/))) {
      if (!node.hasAttribute(m[1])) return false;
      if (m[2] !== undefined || m[3] !== undefined || m[4] !== undefined) if (node.getAttribute(m[1]) !== (m[2] ?? m[3] ?? m[4])) return false;
    } else return false;
    rest = rest.slice(m[0].length);
  }
  return true;
}

function matchesSelector(node, selector) {
  return String(selector).split(',').some(alternative => {
    const parts = alternative.trim().split(/\s+(?![^\[]*\])/);
    if (!matchesPart(node, parts.pop())) return false;
    let ancestor = node.parentNode;
    while (parts.length) {
      const part = parts.pop();
      while (ancestor && !matchesPart(ancestor, part)) ancestor = ancestor.parentNode;
      if (!ancestor) return false;
      ancestor = ancestor.parentNode;
    }
    return true;
  });
}

class MiniElement extends MiniEventTarget {
  constructor(tag, document) {
    super();
    this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.nodeName = this.tagName;
    this.ownerDocument = document; this.parentNode = null; this.childNodes = [];
    this._attributes = Object.create(null); this._value = undefined; this._hidden = false;
    this.style = createStyle(() => this._dirty()); this.dataset = Object.create(null);
    this.__rect = null;
    const element = this;
    this.classList = {
      contains(token) { return element.className.split(/\s+/).includes(String(token)); },
      add(...tokens) { element.className = [...new Set([...element.className.split(/\s+/).filter(Boolean), ...tokens.map(String)])].join(' '); },
      remove(...tokens) { const remove = tokens.map(String); element.className = element.className.split(/\s+/).filter(x => x && !remove.includes(x)).join(' '); },
      toggle(token, force) { const enabled = force === undefined ? !this.contains(token) : !!force; this[enabled ? 'add' : 'remove'](token); return enabled; },
      replace(oldToken, newToken) { if (!this.contains(oldToken)) return false; this.remove(oldToken); this.add(newToken); return true; },
      get value() { return element.className; },
      toString() { return element.className; }
    };
  }
  _dirty() { if (this.ownerDocument) { this.ownerDocument.dirty = true; this.ownerDocument.revision++; } }
  get id() { return this._attributes.id || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this._attributes.class || ''; }
  set className(value) { this.setAttribute('class', value); }
  get hidden() { return this._hidden; }
  set hidden(value) { this._hidden = !!value; this._dirty(); }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'SELECT') { const options = this.querySelectorAll('option'); const option = options.find(x => x.hasAttribute('selected')) || options[0]; return option?.value || ''; }
    return this._attributes.value ?? (this.tagName === 'OPTION' ? this.textContent : '');
  }
  set value(value) { this._value = String(value); this._dirty(); }
  get checked() { return !!this._checked; }
  set checked(value) { this._checked = !!value; this._dirty(); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get isConnected() { let node = this._identity || this; while (node) { if (node.nodeType === 9) return true; node = node.parentNode; } return false; }
  get attributes() { return Object.entries(this._attributes).map(([name, value]) => ({name, value})); }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); if (value !== null && value !== undefined && String(value)) this.append(String(value)); }
  get innerText() { return this.textContent; }
  set innerText(value) { this.textContent = value; }
  get innerHTML() { return this.childNodes.map(serializeNode).join(''); }
  set innerHTML(value) { this.replaceChildren(); parseHTML(String(value), this, this.ownerDocument); this._dirty(); }
  setAttribute(name, value) { name = String(name); value = String(value); if (this._attributes[name] === value) return; this._attributes[name] = value; if (name.startsWith('data-')) this.dataset[dataKey(name)] = value; if (name === 'style') this.style.cssText = value; if (name === 'hidden') this._hidden = true; if (name === 'checked') this._checked = true; this._dirty(); }
  getAttribute(name) { if (String(name).startsWith('data-') && Object.hasOwn(this.dataset, dataKey(name))) return String(this.dataset[dataKey(name)]); return this._attributes[name] ?? null; }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) { delete this._attributes[name]; if (name.startsWith('data-')) delete this.dataset[dataKey(name)]; if (name === 'hidden') this._hidden = false; this._dirty(); }
  append(...nodes) { for (const node of nodes) this.appendChild(typeof node === 'string' || typeof node === 'number' ? this.ownerDocument.createTextNode(String(node)) : node); }
  appendChild(node) { if (!node) return node; if (node.parentNode) node.parentNode.removeChild(node); node.parentNode = this._identity || this; this.childNodes.push(node); this._dirty(); return node; }
  removeChild(node) { const i = this.childNodes.indexOf(node); if (i < 0) throw new Error('Node is not a child'); this.childNodes.splice(i, 1); node.parentNode = null; this._dirty(); return node; }
  replaceChildren(...nodes) { for (const node of this.childNodes) node.parentNode = null; this.childNodes = []; this.append(...nodes); this._dirty(); }
  remove() { this.parentNode?.removeChild(this._identity || this); }
  contains(node) { if (node === (this._identity || this)) return true; return this.children.some(child => child.contains(node)); }
  matches(selector) { return matchesSelector(this._identity || this, selector); }
  closest(selector) { let node = this._identity || this; while (node?.nodeType === 1) { if (node.matches(selector)) return node; node = node.parentNode; } return null; }
  querySelectorAll(selector) { const result = []; const visit = node => { for (const child of node.children || []) { if (matchesSelector(child, selector)) result.push(child); visit(child); } }; visit(this); return result; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getElementsByTagName(tag) { return this.querySelectorAll(tag); }
  getBoundingClientRect() {
    const rect = this.__rect || {}; const x = Number(rect.x ?? rect.left) || 0, y = Number(rect.y ?? rect.top) || 0;
    const width = Number(rect.width) || 0, height = Number(rect.height) || 0;
    return {x, y, left:x, top:y, width, height, right:x + width, bottom:y + height, toJSON() { return {x, y, width, height}; }};
  }
  getClientRects() { return this.hidden || this.classList.contains('hidden') ? [] : [this.getBoundingClientRect()]; }
  get clientWidth() { return this.getBoundingClientRect().width; }
  get clientHeight() { return this.getBoundingClientRect().height; }
  focus() { this.ownerDocument.activeElement = this._identity || this; }
  blur() { if (this.ownerDocument.activeElement === (this._identity || this)) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() { if (!this.disabled) this.dispatchEvent({type:'click', bubbles:true}); }
  setPointerCapture(id) { this.ownerDocument._capture.set(id, this._identity || this); }
  hasPointerCapture(id) { return this.ownerDocument._capture.get(id) === (this._identity || this); }
  releasePointerCapture(id) { if (this.hasPointerCapture(id)) { this.ownerDocument._capture.delete(id); this.dispatchEvent({type:'lostpointercapture', pointerId:id, bubbles:false}); } }
  requestFullscreen() { this.ownerDocument.fullscreenElement = this._identity || this; return Promise.resolve(); }
}

function serializeNode(node) {
  if (node.nodeType === 3) return escapeText(node.textContent);
  const attrs = (node.attributes || []).map(({name, value}) => ` ${name}="${escapeText(value).replace(/"/g, '&quot;')}"`).join('');
  return `<${node.tagName.toLowerCase()}${attrs}>${VOID_TAGS.has(node.tagName.toLowerCase()) ? '' : node.innerHTML + `</${node.tagName.toLowerCase()}>`}`;
}

function parseHTML(html, parent, document) {
  const stack = [parent];
  const token = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g;
  for (const match of html.matchAll(token)) {
    const value = match[0];
    if (value.startsWith('<!')) continue;
    if (value.startsWith('</')) {
      const tag = value.match(/^<\/\s*([\w:-]+)/)?.[1]?.toUpperCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag) { stack.length = i; break; }
    } else if (value[0] === '<') {
      const open = value.match(/^<([\w:-]+)\b([\s\S]*?)\/?\s*>$/); if (!open) continue;
      const tag = open[1].toLowerCase(), attrs = [];
      const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      for (const attribute of open[2].matchAll(attrPattern)) attrs.push([attribute[1], decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? '')]);
      const node = tag === 'canvas' && attrs.some(([name, v]) => name === 'id' && v === 'scene') ? document._mainCanvas : document.createElement(tag);
      for (const [name, v] of attrs) node.setAttribute(name, v);
      stack[stack.length - 1].appendChild(node);
      if (!VOID_TAGS.has(tag) && !value.endsWith('/>')) stack.push(node);
    } else stack[stack.length - 1].append(decode(value));
  }
}

/** Install only the browser surface this game uses. No HTML executes scripts. */
export function installRuntime(wx, initialHtml = '') {
  if (!wx?.createCanvas) throw new TypeError('A Mini Game wx.createCanvas host is required');
  const globals = [globalThis];
  const originalGlobals = [];
  function exposeOn(target, name, value) {
    if (!originalGlobals.some(item => item.target === target && item.name === name)) originalGlobals.push({target, name, descriptor:Object.getOwnPropertyDescriptor(target, name)});
    try { Object.defineProperty(target, name, {configurable:true, writable:true, enumerable:true, value}); } catch { try { target[name] = value; } catch {} }
  }
  function expose(name, value) { for (const target of globals) exposeOn(target, name, value); }
  const hostGlobal = typeof GameGlobal === 'object' ? GameGlobal : globalThis;
  if (hostGlobal !== globalThis) globals.push(hostGlobal);
  if (typeof GameGlobal === 'undefined') expose('GameGlobal', hostGlobal);
  const windowEvents = new MiniEventTarget(), capture = new Map(), touches = new Map(), subscriptions = [];
  const document = new MiniElement('#document', null);
  document.nodeType = 9; document.nodeName = '#document'; document.ownerDocument = document; document.revision = 0; document.dirty = true;
  document._capture = capture; document._windowEvents = windowEvents; document.hidden = false; document.visibilityState = 'visible'; document.fullscreenElement = null;
  document.createTextNode = text => ({nodeType:3, nodeName:'#text', textContent:String(text), parentNode:null, ownerDocument:document});
  document.getElementById = id => document.querySelectorAll('[id]').find(node => node.id === String(id)) || null;
  document.exitFullscreen = () => { document.fullscreenElement = null; return Promise.resolve(); };
  const nativeCanvasListeners = [];
  function wrapCanvas(canvas) {
    const node = new MiniElement('canvas', document); node._identity = canvas;
    for (const key of Object.keys(node)) {
      if (key === '_identity') continue;
      try { Object.defineProperty(canvas, key, {configurable:true, get:() => node[key], set:value => { node[key] = value; }}); } catch {}
    }
    for (const prototype of [MiniElement.prototype, MiniEventTarget.prototype]) for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === 'constructor') continue;
      const desc = Object.getOwnPropertyDescriptor(prototype, key);
      if (typeof desc.value === 'function') { try { Object.defineProperty(canvas, key, {configurable:true, writable:true, value:desc.value.bind(node)}); } catch {} }
      else { try { Object.defineProperty(canvas, key, {configurable:true, get:desc.get ? () => desc.get.call(node) : undefined, set:desc.set ? value => desc.set.call(node, value) : undefined}); } catch {} }
    }
    return canvas;
  }
  const screenCanvas = wx.createCanvas();
  const nativeCanvasAdd = screenCanvas.addEventListener?.bind(screenCanvas), nativeCanvasRemove = screenCanvas.removeEventListener?.bind(screenCanvas);
  const canvas = wrapCanvas(screenCanvas); document._mainCanvas = canvas;
  // WebGL context loss originates on the native canvas, while input is routed
  // by wx touch APIs. Preserve native context notifications for Three.js.
  if (nativeCanvasAdd) for (const type of ['webglcontextlost','webglcontextrestored','webglcontextcreationerror']) {
    const handler = nativeEvent => canvas.dispatchEvent({type, nativeEvent, preventDefault:() => nativeEvent.preventDefault?.()});
    nativeCanvasAdd(type, handler); nativeCanvasListeners.push([type, handler]);
  }
  document.createElement = tag => String(tag).toLowerCase() === 'canvas' ? wrapCanvas(wx.createCanvas()) : new MiniElement(tag, document);
  document.createElementNS = (_, tag) => document.createElement(tag);
  parseHTML(initialHtml || '<html><head></head><body><canvas id="scene"></canvas></body></html>', document, document);
  if (!document.querySelector('html')) { const html = document.createElement('html'); const existing = [...document.childNodes]; document.replaceChildren(html); html.append(...existing); }
  document.documentElement = document.querySelector('html'); document.head = document.querySelector('head'); document.body = document.querySelector('body');
  if (!document.body) { document.body = document.createElement('body'); document.documentElement.append(document.body); }
  if (!canvas.isConnected) { canvas.id = 'scene'; document.body.append(canvas); }
  document.activeElement = document.body;
  const metrics = {width:1, height:1, pixelRatio:1, safeArea:null, menuButtonRect:null};
  let disposed = false;
  const runtime = {document, canvas, metrics, hitTest:() => null, dispatchPointer, dispatchKey, dispose};
  function updateMetrics(size = {}) {
    let info = {}; try { info = wx.getWindowInfo?.() || wx.getSystemInfoSync?.() || {}; } catch {}
    metrics.width = Number(size.windowWidth ?? size.width ?? info.windowWidth ?? info.screenWidth) || 1;
    metrics.height = Number(size.windowHeight ?? size.height ?? info.windowHeight ?? info.screenHeight) || 1;
    metrics.pixelRatio = Math.max(1, Number(info.pixelRatio) || 1);
    metrics.safeArea = info.safeArea || {left:0, top:0, right:metrics.width, bottom:metrics.height, width:metrics.width, height:metrics.height};
    try { metrics.menuButtonRect = wx.getMenuButtonBoundingClientRect?.() || null; } catch { metrics.menuButtonRect = null; }
    canvas.__rect = {x:0, y:0, width:metrics.width, height:metrics.height};
    document.documentElement.__rect = {...canvas.__rect}; document.body.__rect = {...canvas.__rect};
    expose('innerWidth', metrics.width); expose('innerHeight', metrics.height); expose('devicePixelRatio', metrics.pixelRatio);
    document.dirty = true;
  }
  expose('window', hostGlobal); expose('self', hostGlobal); expose('document', document);
  expose('addEventListener', windowEvents.addEventListener.bind(windowEvents)); expose('removeEventListener', windowEvents.removeEventListener.bind(windowEvents)); expose('dispatchEvent', windowEvents.dispatchEvent.bind(windowEvents));
  expose('localStorage', {
    getItem(key) { try { const info = wx.getStorageInfoSync?.(); if (info && !info.keys.includes(String(key))) return null; const value = wx.getStorageSync(String(key)); return value === undefined || value === null || (!info && value === '') ? null : String(value); } catch { return null; } },
    setItem(key, value) { wx.setStorageSync(String(key), String(value)); },
    removeItem(key) { wx.removeStorageSync?.(String(key)); }
  });
  expose('matchMedia', query => ({media:String(query), matches: /pointer\s*:\s*coarse/.test(query) || (/orientation\s*:\s*landscape/.test(query) && metrics.width >= metrics.height), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}}));
  expose('screen', {orientation:{type:'landscape-primary', lock:() => Promise.resolve(), unlock() {}}});
  if (!globalThis.navigator) expose('navigator', {userAgent:'WeChat MiniGame', platform:'wechat', maxTouchPoints:10});
  const epoch = Date.now(), timer = globalThis.performance || hostGlobal.performance || {now:() => Date.now() - epoch};
  for (const target of globals) if (!target.performance) exposeOn(target, 'performance', timer);
  // Keep host rAF intact. A bound native canvas fallback is only used on hosts
  // lacking the global function; never implement rAF by calling itself.
  const raf = globalThis.requestAnimationFrame || hostGlobal.requestAnimationFrame || screenCanvas.requestAnimationFrame?.bind(screenCanvas);
  const cancelRaf = globalThis.cancelAnimationFrame || hostGlobal.cancelAnimationFrame || screenCanvas.cancelAnimationFrame?.bind(screenCanvas);
  if (raf) for (const target of globals) if (!target.requestAnimationFrame) exposeOn(target, 'requestAnimationFrame', raf);
  if (cancelRaf) for (const target of globals) if (!target.cancelAnimationFrame) exposeOn(target, 'cancelAnimationFrame', cancelRaf);
  updateMetrics();
  function dispatchPointer(type, data = {}, explicitTarget) {
    if (disposed) return null;
    const pointerId = data.pointerId ?? data.identifier ?? 0;
    const x = Number(data.clientX ?? data.x ?? data.pageX) || 0, y = Number(data.clientY ?? data.y ?? data.pageY) || 0;
    const hit = explicitTarget || runtime.hitTest(x, y) || null;
    let touch = touches.get(pointerId);
    if (type === 'pointerdown') { if (touch) dispatchPointer('pointercancel', {...touch, pointerId}, touch.target); touch = {pointerId, startTarget:hit, target:hit, clientX:x, clientY:y}; touches.set(pointerId, touch); }
    const target = capture.get(pointerId) || hit || touch?.target;
    if (touch) { touch.clientX = x; touch.clientY = y; }
    if (!target) { if (type === 'pointerup' || type === 'pointercancel') touches.delete(pointerId); return null; }
    const event = {...data, type, pointerId, pointerType:'touch', isPrimary:pointerId === touches.keys().next().value, clientX:x, clientY:y, pageX:x, pageY:y, button:0, buttons:type === 'pointerup' || type === 'pointercancel' ? 0 : 1, target, bubbles:true};
    target.dispatchEvent(event);
    if (type === 'pointerup' || type === 'pointercancel') {
      if (capture.has(pointerId)) { const captured = capture.get(pointerId); capture.delete(pointerId); captured.dispatchEvent({type:'lostpointercapture', pointerId, bubbles:false}); }
      touches.delete(pointerId);
      if (type === 'pointerup' && touch?.startTarget === hit && hit && !hit.disabled && ['BUTTON','A','INPUT','SELECT'].includes(hit.tagName)) hit.dispatchEvent({type:'click', pointerId, clientX:x, clientY:y, target:hit, bubbles:true});
    }
    return event;
  }
  function dispatchKey(type, data = {}) { if (disposed) return; const event = typeof data === 'string' ? {code:data} : data; windowEvents.dispatchEvent({...event, type, target:event.target || document.body, repeat:!!event.repeat, bubbles:false}); }
  function cancelTouches() { for (const touch of [...touches.values()]) dispatchPointer('pointercancel', touch, capture.get(touch.pointerId) || touch.target); capture.clear(); }
  function subscribe(on, off, callback) { if (typeof wx[on] === 'function') { wx[on](callback); subscriptions.push(() => wx[off]?.(callback)); } }
  for (const [phase, type] of [['Start','pointerdown'],['Move','pointermove'],['End','pointerup'],['Cancel','pointercancel']]) subscribe('onTouch' + phase, 'offTouch' + phase, event => { for (const touch of event.changedTouches || event.touches || []) dispatchPointer(type, touch); });
  subscribe('onHide', 'offHide', () => { cancelTouches(); document.hidden = true; document.visibilityState = 'hidden'; document.dispatchEvent({type:'visibilitychange'}); windowEvents.dispatchEvent({type:'blur', target:hostGlobal}); });
  subscribe('onShow', 'offShow', () => { document.hidden = false; document.visibilityState = 'visible'; updateMetrics(); document.dispatchEvent({type:'visibilitychange'}); windowEvents.dispatchEvent({type:'focus', target:hostGlobal}); });
  subscribe('onWindowResize', 'offWindowResize', event => { cancelTouches(); updateMetrics(event.size || event); windowEvents.dispatchEvent({type:'resize', target:hostGlobal}); });
  subscribe('onKeyDown', 'offKeyDown', event => dispatchKey('keydown', event)); subscribe('onKeyUp', 'offKeyUp', event => dispatchKey('keyup', event));
  function dispose() {
    if (disposed) return;
    cancelTouches(); disposed = true;
    for (const unsubscribe of subscriptions) unsubscribe();
    for (const [type, handler] of nativeCanvasListeners) nativeCanvasRemove?.(type, handler);
    windowEvents._listeners.clear();
    for (const {target, name, descriptor} of originalGlobals.reverse()) { try { if (descriptor) Object.defineProperty(target, name, descriptor); else delete target[name]; } catch {} }
  }
  return runtime;
}
