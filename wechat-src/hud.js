// Canvas UI for the WeChat Mini Game. Gameplay remains owned by dist/main.js.
// Every control dispatches to the same element/listener as the browser edition.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ink = '#102b26', gold = '#dac38f', paper = '#f3e8ca', muted = '#b7cbbd';
const plain = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const rect = (x, y, width, height) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height });

export function createHud({ THREE, runtime, wx }) {
  const doc = runtime.document;
  const surface = wx.createCanvas();
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('无法创建小游戏界面画布');
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const plane = new THREE.Mesh(geometry, material);
  plane.frustumCulled = false;
  scene.add(plane);
  let width = 0, height = 0, ratio = 1, scale = 1, lastPaint = -Infinity, disposed = false;
  let hits = [], previousRects = [], bounds = null;
  let toastText = '', toastStart = 0;
  const bound = new WeakSet();
  const $ = id => doc.getElementById(id);
  const q = selector => doc.querySelector(selector);
  const textOf = id => plain($(id)?.textContent);
  const shown = element => {
    for (let current = element; current; current = current.parentNode) {
      if (current.hidden || current.classList?.contains('hidden') || current.style?.display === 'none') return false;
    }
    return !!element;
  };
  const safeMetric = () => {
    const m = runtime.metrics, safe = m.safeArea || {}, capsule = m.menuButtonRect || {};
    const left = Math.max(14, Number(safe.left) || 0), top = Math.max(12, Number(safe.top) || 0);
    const right = Math.min(width - 14, Number(safe.right) || width - 14);
    const bottom = Math.min(height - 12, Number(safe.bottom) || height - 12);
    return { left, top, right, bottom, capsule };
  };
  function measure(element, box, circle = false, force = false) {
    if (!element || (!force && !shown(element))) return;
    element.__rect = box; previousRects.push(element);
    hits.push({ element, box, circle });
  }
  function font(size = 14, strong = false) {
    ctx.font = `${strong ? '600 ' : ''}${Math.round(size * scale)}px sans-serif`;
    ctx.textBaseline = 'middle';
  }
  function label(value, x, y, size = 14, color = paper, align = 'left', strong = false, maxWidth) {
    font(size, strong); ctx.fillStyle = color; ctx.textAlign = align;
    const content = plain(value); if (!content) return;
    if (maxWidth) ctx.fillText(content, x, y, maxWidth); else ctx.fillText(content, x, y);
  }
  function wrap(value, x, y, maxWidth, size = 12, color = muted, maxLines = 3, lineHeight = size * 1.65, align = 'left') {
    font(size); const chars = [...plain(value)], lines = []; let line = '';
    for (const char of chars) {
      if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = char; }
      else line += char;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…'; }
    lines.forEach((part, i) => label(part, x, y + i * lineHeight * scale, size, color, align));
    return lines.length * lineHeight * scale;
  }
  function panel(box, opacity = .9, border = true) {
    ctx.fillStyle = `rgba(11,35,29,${opacity})`; ctx.fillRect(box.x, box.y, box.width, box.height);
    if (border) { ctx.strokeStyle = 'rgba(218,195,143,.42)'; ctx.lineWidth = 1; ctx.strokeRect(box.x + .5, box.y + .5, box.width - 1, box.height - 1); }
  }
  function line(x, y, length, color = 'rgba(218,195,143,.45)') { ctx.fillStyle = color; ctx.fillRect(x, y, length, 1); }
  function button(element, title, box, { primary = false, small = false, force = false } = {}) {
    panel(box, primary ? .97 : .76);
    if (primary) { ctx.fillStyle = 'rgba(185,157,86,.17)'; ctx.fillRect(box.x + 2, box.y + 2, box.width - 4, box.height - 4); }
    label(title, box.x + box.width / 2, box.y + box.height / 2, small ? 12 : 15, primary ? '#ffebbb' : paper, 'center', primary, box.width - 14);
    measure(element, box, false, force);
  }
  function bar(x, y, w, h, amount, color) {
    ctx.fillStyle = '#091c18'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(225,207,154,.35)'; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(Number(amount) || 0, 0, 1)), Math.max(1, h - 2));
  }
  function nodeRatio(id) { return clamp(parseFloat($(id)?.style?.width || '0') / 100, 0, 1); }
  function bindChoice(element) {
    if (!element || bound.has(element)) return;
    bound.add(element);
    element.addEventListener('click', event => {
      event.stopPropagation?.();
      const choices = [...element.querySelectorAll('option')];
      if (!choices.length) return;
      const index = Math.max(0, choices.findIndex(option => String(option.value ?? option.getAttribute?.('value')) === String(element.value)));
      element.value = choices[(index + 1) % choices.length].value ?? choices[(index + 1) % choices.length].getAttribute('value');
      element.dispatchEvent({ type: 'change', target: element });
      lastPaint = -Infinity;
    });
  }
  function bindSlider(element) {
    if (!element || bound.has(element)) return;
    bound.add(element);
    const move = event => {
      event.preventDefault?.(); event.stopPropagation?.();
      const box = element.__rect; if (!box?.width) return;
      element.value = String(Math.round(clamp((event.clientX - box.x - 12 * scale) / (box.width - 24 * scale), 0, 1) * 20) / 20);
      element.dispatchEvent({ type: 'input', target: element }); lastPaint = -Infinity;
    };
    element.addEventListener('pointerdown', event => { element.setPointerCapture?.(event.pointerId); move(event); });
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', event => element.releasePointerCapture?.(event.pointerId));
    element.addEventListener('pointercancel', event => element.releasePointerCapture?.(event.pointerId));
  }
  function chrome(playing) {
    const b = bounds, capsuleBottom = Number(b.capsule.bottom) || 0;
    // Keep the WeChat native capsule clear, including on devices with a notch.
    const y = Math.max(b.top, capsuleBottom ? capsuleBottom + 8 : b.top);
    const size = 34 * scale;
    if (playing && shown($('pause-btn'))) button($('pause-btn'), '暂停', rect(b.right - size, y, size, size), { small: true });
    const x = b.right - size * (playing ? 2.3 : 1);
    const mutedAudio = Number($('sound-btn')?.style?.opacity) < .5;
    button($('sound-btn'), mutedAudio ? '静音' : '音乐', rect(x, y, size, size), { small: true });
    return y + size;
  }
  function menu() {
    const b = bounds;
    const gradient = ctx.createLinearGradient(0, 0, width * .76, 0);
    gradient.addColorStop(0, 'rgba(4,19,16,.93)'); gradient.addColorStop(1, 'rgba(4,19,16,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    const x = b.left + 24 * scale, y = b.top + 26 * scale;
    label('第一回  /  山海行记', x, y, 12, gold);
    label('灵 山', x, y + 65 * scale, 64, paper, 'left', true);
    label('悟 空 · 试 炼', x + 4 * scale, y + 115 * scale, 24, gold);
    wrap('听瀑穿花，踏云入山。寻符踏赤霞，棍下破三劫。', x + 4 * scale, y + 152 * scale, 300 * scale, 13, muted, 2);
    const startY = Math.min(y + 205 * scale, b.bottom - 130 * scale);
    button($('start'), '◆   踏 入 灵 山   →', rect(x, startY, 278 * scale, 46 * scale), { primary: true });
    const links = [['chapters-btn', '关卡选择'], ['guide-btn', '修行指南'], ['settings-btn', '声画设置'], ['cinema-btn', '过场鉴赏']];
    links.forEach(([id, title], i) => button($(id), title, rect(x + (i % 2) * 144 * scale, startY + 57 * scale + Math.floor(i / 2) * 36 * scale, 134 * scale, 30 * scale), { small: true }));
    button($('credits-btn'), '创作与参考', rect(b.right - 115 * scale, b.bottom - 30 * scale, 115 * scale, 30 * scale), { small: true });
    label('原创东方神话动作试炼', width * .62, b.bottom - 14 * scale, 11, muted, 'center');
    chrome(false);
  }
  function circleControl(id, title, cx, cy, radius, secondary = '') {
    const element = $(id), box = rect(cx - radius, cy - radius, radius * 2, radius * 2);
    const unavailable = element?.classList.contains('unavailable');
    ctx.globalAlpha = unavailable ? .4 : 1;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = id === 'attack' ? 'rgba(82,99,59,.87)' : 'rgba(13,39,31,.84)'; ctx.fill();
    ctx.strokeStyle = element?.classList.contains('active') ? '#ffe1a2' : 'rgba(218,195,143,.72)'; ctx.lineWidth = 1.1; ctx.stroke();
    label(title, cx, cy - (secondary ? 4 : 0) * scale, id === 'attack' ? 19 : 16, paper, 'center');
    if (secondary) label(secondary, cx, cy + 14 * scale, 8, muted, 'center');
    if (id === 'spell' && $('spell-cooldown')?.style.display !== 'none' && Number(textOf('spell-cooldown')) > 0) {
      ctx.fillStyle = 'rgba(3,18,12,.78)'; ctx.fill(); label(textOf('spell-cooldown'), cx, cy, 17, gold, 'center');
    }
    ctx.globalAlpha = 1;
    if (!unavailable) measure(element, box, true);
  }
  function playing(state) {
    const b = bounds, s = scale, hud = $('hud');
    if (!shown(hud)) return;
    // Camera drag is the lowest-priority touch surface; all controls are hit-tested first.
    measure($('camera-pad'), rect(b.left + 190 * s, b.top + 70 * s, b.right - b.left - 190 * s, b.bottom - b.top - 75 * s));
    const hp = rect(b.left, b.top, 244 * s, 77 * s); panel(hp, .83);
    label('悟', hp.x + 24 * s, hp.y + 35 * s, 32, gold, 'center');
    label('天命行者', hp.x + 51 * s, hp.y + 13 * s, 11);
    label(textOf('stance'), hp.right - 10 * s, hp.y + 13 * s, 9, gold, 'right');
    bar(hp.x + 51 * s, hp.y + 25 * s, 181 * s, 8 * s, nodeRatio('health-fill'), '#b77868');
    bar(hp.x + 51 * s, hp.y + 39 * s, 158 * s, 5 * s, nodeRatio('stamina-fill'), '#cabc78');
    bar(hp.x + 51 * s, hp.y + 49 * s, 137 * s, 5 * s, nodeRatio('mana-fill'), '#7cacaa');
    label(textOf('gourd-count'), hp.x + 51 * s, hp.y + 65 * s, 10);
    label(textOf('focus-points'), hp.right - 12 * s, hp.y + 65 * s, 17, gold, 'right');
    button($('route-map'), `行记  ·  ${textOf('route-progress')}`, rect(width / 2 - 87 * s, b.top, 174 * s, 32 * s), { small: true });
    const chromeBottom = chrome(true);
    const objective = rect(b.right - 220 * s, chromeBottom + 8 * s, 220 * s, 48 * s);
    panel(objective, .72); label(textOf('area-name'), objective.right - 10 * s, objective.y + 14 * s, 11, gold, 'right');
    wrap(textOf('objective-text'), objective.right - 10 * s, objective.y + 34 * s, objective.width - 20 * s, 9, paper, 1, 15, 'right');
    if (shown($('journey-card'))) {
      const card = rect(b.left, hp.bottom + 10 * s, 231 * s, 105 * s); panel(card, .85);
      label('入山修行', card.x + 12 * s, card.y + 15 * s, 9, muted); label(textOf('journey-count'), card.right - 12 * s, card.y + 15 * s, 10, gold, 'right');
      label(textOf('journey-title'), card.x + 12 * s, card.y + 39 * s, 17, paper, 'left', true);
      wrap(textOf('journey-detail'), card.x + 12 * s, card.y + 62 * s, card.width - 24 * s, 11, paper, 2, 16);
      bar(card.x + 12 * s, card.bottom - 10 * s, card.width - 24 * s, 3 * s, nodeRatio('journey-meter'), gold);
    }
    const radius = 56 * s, cx = b.left + 69 * s, cy = b.bottom - 74 * s;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(13,44,35,.46)'; ctx.fill(); ctx.strokeStyle = 'rgba(222,211,168,.66)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius * .64, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(222,211,168,.24)'; ctx.stroke();
    const transform = $('stick')?.style.transform || '', match = transform.match(/translate\(\s*([-.\d]+)px\s*,\s*([-.\d]+)px/);
    const dx = match ? Number(match[1]) : 0, dy = match ? Number(match[2]) : 0;
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 18 * s, 0, Math.PI * 2); ctx.fillStyle = 'rgba(205,207,155,.46)'; ctx.fill(); ctx.strokeStyle = gold; ctx.stroke();
    label('移动', cx, cy + radius + 15 * s, 10, muted, 'center');
    measure($('joystick'), rect(cx - radius, cy - radius, radius * 2, radius * 2), true);
    circleControl('attack', '棍击', b.right - 41 * s, b.bottom - 77 * s, 36 * s);
    circleControl('heavy', '重棍', b.right - 119 * s, b.bottom - 112 * s, 28 * s);
    circleControl('dodge', '闪避', b.right - 119 * s, b.bottom - 38 * s, 29 * s);
    circleControl('spell', '定', b.right - 155 * s, b.bottom - 174 * s, 23 * s, '定身');
    circleControl('heal', '酿', b.right - 211 * s, b.bottom - 157 * s, 23 * s, '饮酒');
    circleControl('lock', state.locked ? '◎' : '⊙', b.right - 44 * s, b.bottom - 163 * s, 23 * s, '锁定');
    if (shown($('boss-hud'))) {
      const boss = rect(width / 2 - width * .19, b.bottom - 65 * s, width * .38, 61 * s); panel(boss, .84, false);
      label(textOf('boss-name'), width / 2, boss.y + 15 * s, 15, paper, 'center', true, boss.width - 16);
      bar(boss.x + 13 * s, boss.y + 30 * s, boss.width - 26 * s, 6 * s, nodeRatio('boss-fill'), '#bc9b71');
      label(textOf('boss-phase'), boss.x + 13 * s, boss.y + 49 * s, 9, muted);
      label(textOf('battle-time'), boss.right - 13 * s, boss.y + 49 * s, 9, muted, 'right');
    }
    const combatTip = textOf('combat-tip');
    if (combatTip) notice(combatTip, height * .28, '#ffe0a0');
    const toast = textOf('toast'), now = Number(state.gameTime) || 0;
    if (toast !== toastText) { toastText = toast; toastStart = now; }
    // Browser toast nodes retain text after expiry; keep them transient in Canvas UI.
    if (toast && now - toastStart < 4.8) notice(toast, height * .43, paper);
    const marker = $('locked-marker');
    if (shown(marker)) label('◇', parseFloat(marker.style.left) || width / 2, parseFloat(marker.style.top) || height / 2, 28, '#ffe7ad', 'center');
    for (const node of doc.querySelectorAll('.damage-number')) {
      const opacity = Number(node.style.opacity || 0); if (opacity <= 0) continue;
      ctx.globalAlpha = opacity; label(node.textContent, parseFloat(node.style.left) || 0, parseFloat(node.style.top) || 0, node.classList.contains('heavy-hit') ? 26 : 18, '#ffe5a5', 'center', true); ctx.globalAlpha = 1;
    }
    const hitOpacity = clamp(Number($('damage-overlay')?.style.opacity) || 0, 0, .45);
    if (hitOpacity) { ctx.strokeStyle = `rgba(170,35,25,${hitOpacity})`; ctx.lineWidth = 18 * s; ctx.strokeRect(0, 0, width, height); ctx.lineWidth = 1; }
  }
  function notice(message, y, color) {
    const w = Math.min(440 * scale, width * .49), lines = Math.max(1, Math.ceil(plain(message).length * 12 * scale / w));
    const box = rect((width - w) / 2, y, w, Math.min(2, lines) * 18 * scale + 16 * scale);
    panel(box, .9); wrap(message, width / 2, y + 17 * scale, w - 20 * scale, 12, color, 2, 18, 'center');
  }
  function modal() {
    const b = bounds, s = scale, container = $('modal-content');
    ctx.fillStyle = 'rgba(0,8,6,.72)'; ctx.fillRect(0, 0, width, height);
    const w = Math.min(840 * s, b.right - b.left - 18 * s), h = Math.min(435 * s, b.bottom - b.top - 8 * s);
    const box = rect((width - w) / 2, b.top + (b.bottom - b.top - h) / 2, w, h); panel(box, .98);
    hits = []; measure($('modal'), rect(0, 0, width, height), false, true);
    label(textOf('modal-kicker'), box.x + 24 * s, box.y + 22 * s, 10, gold);
    label(textOf('modal-title'), box.x + 24 * s, box.y + 51 * s, 24, paper, 'left', true);
    button(q('.modal-close'), '关闭', rect(box.right - 73 * s, box.y + 15 * s, 53 * s, 32 * s), { small: true, force: true });
    line(box.x + 24 * s, box.y + 75 * s, box.width - 48 * s);
    const content = rect(box.x + 24 * s, box.y + 92 * s, box.width - 48 * s, box.height - 110 * s);
    const chapters = [...container.querySelectorAll('[data-chapter]')];
    if (chapters.length) {
      label('从中途关卡开始为练习；全程记录从山溪习武开始。', content.x, content.y, 11, muted);
      const gap = 10 * s, cw = (content.width - gap * 3) / 4, ch = Math.min(104 * s, (content.height - 31 * s - gap) / 2);
      chapters.forEach((element, i) => {
        const card = rect(content.x + (i % 4) * (cw + gap), content.y + 22 * s + Math.floor(i / 4) * (ch + gap), cw, ch);
        panel(card, .9); measure(element, card);
        const name = plain(element.querySelector('b')?.textContent).replace(/新$/, '');
        wrap(name, card.x + 10 * s, card.y + 20 * s, card.width - 20 * s, 14, paper, 2, 19);
        wrap(element.querySelector('small')?.textContent, card.x + 10 * s, card.y + 57 * s, card.width - 20 * s, 10, muted, 2, 16);
        if (element.querySelector('em')) label('新', card.right - 10 * s, card.y + 13 * s, 9, gold, 'right');
      });
      return;
    }
    if ($('quality-select')) { settings(content); return; }
    const routeRows = [...container.querySelectorAll('.route-list li')];
    if (routeRows.length) {
      const rowH = Math.min(43 * s, (content.height - 49 * s) / 4), gap = 18 * s, cw = (content.width - gap) / 2;
      routeRows.forEach((element, i) => {
        const x = content.x + Math.floor(i / 4) * (cw + gap), y = content.y + (i % 4) * rowH;
        const active = element.classList.contains('current'), done = element.classList.contains('complete');
        const detail = element.querySelector('div'), subtitle = detail?.querySelector('small');
        let name = plain(detail?.textContent); const secondary = plain(subtitle?.textContent); if (secondary) name = name.replace(secondary, '').trim();
        label(active ? '◆' : done ? '✓' : String(i + 1), x + 8 * s, y + 10 * s, 12, active ? '#ffe3a5' : gold, 'center');
        label(name, x + 26 * s, y + 9 * s, 12, active ? '#ffe8b7' : paper);
        wrap(secondary, x + 26 * s, y + 27 * s, cw - 30 * s, 9, muted, 1);
      });
      button($('map-close'), '继续前行', rect(content.x + content.width / 2 - 110 * s, content.bottom - 39 * s, 220 * s, 37 * s), { primary: true });
      return;
    }
    const gallery = [...container.querySelectorAll('[data-cinema]')];
    if (gallery.length) {
      const cw = (content.width - 14 * s) / 2, ch = Math.min(101 * s, (content.height - 14 * s) / 2);
      gallery.forEach((element, i) => {
        const card = rect(content.x + (i % 2) * (cw + 14 * s), content.y + Math.floor(i / 2) * (ch + 14 * s), cw, ch); panel(card); measure(element, card);
        label(element.querySelector('b')?.textContent, card.x + 14 * s, card.y + 22 * s, 16, gold);
        label(element.querySelector('small')?.textContent, card.x + 14 * s, card.y + 47 * s, 10, muted);
        wrap(element.querySelector('span')?.textContent, card.x + 14 * s, card.y + 72 * s, card.width - 28 * s, 11, paper, 1);
      }); return;
    }
    if ($('resume')) {
      const bw = Math.min(330 * s, content.width), bx = content.x + (content.width - bw) / 2;
      label('山风未停，等你再战。', content.x + content.width / 2, content.y + 9 * s, 13, muted, 'center');
      [['resume', '继续试炼', true], ['pause-settings', '声画设置'], ['pause-guide', '修行指南'], ['pause-return', '返回山门']].forEach(([id, title, primary], i) => {
        button($(id), title, rect(bx, content.y + 34 * s + i * 44 * s, bw, 36 * s), { primary });
      }); return;
    }
    const guideItems = [...container.querySelectorAll('.guide-item')];
    if (guideItems.length) {
      const cw = (content.width - 24 * s) / 2, ch = Math.min(84 * s, (content.height - 50 * s) / 2);
      guideItems.forEach((element, i) => {
        const x = content.x + (i % 2) * (cw + 24 * s), y = content.y + Math.floor(i / 2) * ch;
        label(element.querySelector('strong')?.textContent, x, y + 10 * s, 15, gold);
        let message = plain(element.querySelector('p')?.textContent).replace(/桌面使用 WASD，Q 切换目标锁定。/, '点击「锁定」追踪敌人。');
        wrap(message, x, y + 36 * s, cw, 12, paper, 2, 18);
      });
      button($('guide-close'), '记住了，出发', rect(content.x + content.width / 2 - 110 * s, content.bottom - 40 * s, 220 * s, 38 * s), { primary: true });
      return;
    }
    // Credits and any future text-only panels stay readable without opening external web pages.
    const paragraphs = [...container.querySelectorAll('p')]; let y = content.y + 8 * s;
    for (const element of paragraphs) {
      if (y > content.bottom - 20 * s) break;
      y += wrap(element.textContent, content.x, y, content.width, 12, paper, Math.max(1, Math.floor((content.bottom - y) / (20 * s))), 20) + 14 * s;
    }
    for (const element of container.querySelectorAll('button')) {
      button(element, element.textContent, rect(content.x, content.bottom - 36 * s, content.width, 34 * s));
    }
  }
  function settings(content) {
    const s = scale, rowH = Math.min(47 * s, (content.height - 49 * s) / 4);
    const choices = [['quality-select', '画面品质'], ['difficulty-select', '下一战难度'], ['cinema-select', '剧情过场']];
    choices.forEach(([id, title], i) => {
      const element = $(id), y = content.y + i * rowH;
      label(title, content.x + 4 * s, y + 17 * s, 14);
      const options = [...element.querySelectorAll('option')], selected = options.find(option => String(option.value ?? option.getAttribute?.('value')) === String(element.value)) || options[0];
      const box = rect(content.x + content.width * .43, y, content.width * .57, 34 * s);
      button(element, `${plain(selected?.textContent)}  ›`, box, { small: true }); bindChoice(element);
    });
    const slider = $('volume-slider'), y = content.y + 3 * rowH;
    label(`音乐与音效  ${Math.round(Number(slider?.value || 0) * 100)}%`, content.x + 4 * s, y + 17 * s, 13);
    const box = rect(content.x + content.width * .43, y, content.width * .57, 34 * s); panel(box, .5); measure(slider, box); bindSlider(slider);
    const x = box.x + 12 * s, trackW = box.width - 24 * s, value = clamp(Number(slider?.value || 0), 0, 1);
    bar(x, box.y + 16 * s, trackW, 3 * s, value, gold);
    ctx.beginPath(); ctx.arc(x + trackW * value, box.y + 17 * s, 6 * s, 0, Math.PI * 2); ctx.fillStyle = gold; ctx.fill();
    button($('settings-done'), '保存并返回', rect(content.x + content.width / 2 - 110 * s, content.bottom - 38 * s, 220 * s, 36 * s), { primary: true });
  }
  function result() {
    const b = bounds, s = scale; ctx.fillStyle = 'rgba(4,17,13,.82)'; ctx.fillRect(0, 0, width, height);
    const maxW = Math.min(width * .7, 630 * s), x = width / 2, y = b.top + 30 * s;
    label(textOf('result-kicker'), x, y, 12, gold, 'center'); label(textOf('result-title'), x, y + 49 * s, 44, paper, 'center', true);
    wrap(textOf('result-text'), x, y + 96 * s, maxW, 13, muted, 2, 21, 'center');
    const stats = [...($('result-stats')?.children || [])];
    stats.forEach((element, i) => {
      const caption = plain(element.querySelector('small')?.textContent), value = plain(element.textContent).replace(caption, '').trim();
      const sx = x + (i - (stats.length - 1) / 2) * 160 * s;
      label(value, sx, y + 158 * s, 25, gold, 'center'); label(caption, sx, y + 185 * s, 11, muted, 'center');
    });
    const by = Math.min(y + 224 * s, b.bottom - 83 * s);
    button($('retry'), textOf('retry'), rect(x - 155 * s, by, 310 * s, 44 * s), { primary: true });
    button($('return-menu'), '返回山门', rect(x - 100 * s, by + 51 * s, 200 * s, 31 * s), { small: true });
  }
  function cinematic() {
    const overlay = $('cinematic-overlay'); if (!shown(overlay)) return false;
    const s = scale, b = bounds;
    ctx.fillStyle = '#020907'; ctx.fillRect(0, 0, width, height * .09); ctx.fillRect(0, height * .91, width, height * .09);
    ctx.fillStyle = `rgba(2,7,5,${clamp(Number(q('.cinematic-fade')?.style.opacity) || 0, 0, 1)})`; ctx.fillRect(0, 0, width, height);
    label(q('.cinematic-chapter-text')?.textContent, b.left + 16 * s, b.top + 5 * s, 10, gold);
    const titleAlpha = clamp(Number(q('.cinematic-title')?.style.opacity) || 0, 0, 1); ctx.globalAlpha = titleAlpha;
    label(q('.cinematic-title-kicker')?.textContent, b.left + 37 * s, height * .35, 12, gold);
    label(q('.cinematic-title-main')?.textContent, b.left + 37 * s, height * .46, 38, paper, 'left', true); ctx.globalAlpha = 1;
    ctx.globalAlpha = clamp(Number(q('.cinematic-caption')?.style.opacity) || 0, 0, 1);
    wrap(q('.cinematic-caption')?.textContent, width / 2, height * .83, width * .75, 14, paper, 2, 20, 'center'); ctx.globalAlpha = 1;
    const skip = q('.cinematic-skip'); button(skip, '跳过  ›', rect(b.right - 94 * s, b.bottom - 33 * s, 94 * s, 32 * s), { small: true });
    const progress = q('.cinematic-progress')?.firstElementChild?.style.transform?.match(/scaleX\(([^)]+)\)/);
    bar(b.right - 94 * s, b.bottom + 1, 94 * s, 2, progress ? Number(progress[1]) : 0, gold);
    return true;
  }
  function paint() {
    const m = runtime.metrics;
    const nextWidth = Number(m.width) || 844, nextHeight = Number(m.height) || 390;
    const nextRatio = Math.min(Number(m.pixelRatio) || 1, 1.5);
    if (width !== nextWidth || height !== nextHeight || ratio !== nextRatio) {
      width = nextWidth; height = nextHeight; ratio = nextRatio;
      surface.width = Math.ceil(width * ratio); surface.height = Math.ceil(height * ratio);
    }
    scale = clamp(Math.min(width / 1000, height / 455), .76, 1.6);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    for (const element of previousRects) element.__rect = rect(0, 0, 0, 0);
    previousRects = []; hits = []; bounds = safeMetric();
    const state = globalThis.window?.__trial?.getState?.() || globalThis.__trial?.getState?.() || {};
    if (shown($('boot'))) {
      ctx.fillStyle = ink; ctx.fillRect(0, 0, width, height);
      label('悟', width / 2, height * .4, 55, gold, 'center'); label(textOf('boot-message'), width / 2, height * .61, 14, paper, 'center');
    } else if (shown($('result'))) result();
    else if (!cinematic()) {
      if (shown($('menu'))) menu();
      else playing(state);
    }
    if (shown($('modal'))) modal();
    if (shown($('rotate'))) {
      ctx.fillStyle = 'rgba(2,15,10,.97)'; ctx.fillRect(0, 0, width, height); hits = [];
      label('横屏，方见天地', width / 2, height * .4, 25, gold, 'center');
      wrap('请旋转手机，获得完整视野与双手操控体验。', width / 2, height * .5, width * .8, 14, paper, 2, 23, 'center');
      button($('portrait-continue'), '继续以竖屏游玩', rect(width / 2 - 110, height * .62, 220, 44), { small: true });
    }
    texture.needsUpdate = true;
  }
  runtime.hitTest = (x, y) => {
    if (disposed) return null;
    for (let i = hits.length - 1; i >= 0; i--) {
      const { element, box, circle } = hits[i];
      if (!shown(element) || box.width <= 0 || box.height <= 0) continue;
      if (x < box.x || x > box.right || y < box.y || y > box.bottom) continue;
      if (circle && Math.hypot((x - box.x - box.width / 2) / (box.width / 2), (y - box.y - box.height / 2) / (box.height / 2)) > 1) continue;
      return element;
    }
    return null;
  };
  return {
    render(renderer) {
      if (disposed) return;
      const now = globalThis.performance?.now?.() ?? Date.now();
      if (now - lastPaint >= 1000 / 30 || width !== runtime.metrics.width || height !== runtime.metrics.height) { paint(); lastPaint = now; }
      const autoClear = renderer.autoClear;
      const infoAutoReset = renderer.info?.autoReset;
      renderer.autoClear = false;
      if (renderer.info) renderer.info.autoReset = false;
      try { renderer.clearDepth(); renderer.render(scene, camera); }
      finally { renderer.autoClear = autoClear; if (renderer.info) renderer.info.autoReset = infoAutoReset; }
    },
    dispose() {
      disposed = true; hits = []; texture.dispose(); material.dispose(); geometry.dispose();
      runtime.hitTest = () => null;
    },
    // Layout diagnostics are local-only and do not modify game state.
    getLayout: () => ({ width, height, scale, controls: hits.map(({ element, box }) => ({ id: element.id || element.className, ...box })) }),
  };
}
