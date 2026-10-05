/* ============================================================
   福州学院 · 课程表助手  —  主逻辑
   数据来自 js/data.js（由总课程表解析生成），全部本地运行
   ============================================================ */
(function () {
  'use strict';

  const DATA = window.SCHEDULE_DATA || { catalog: [], weeks: [] };
  const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const PERIODS = 12;
  const SECTIONS = [
    { name: '上午', from: 1, to: 4 },
    { name: '下午', from: 5, to: 8 },
    { name: '晚上', from: 9, to: 12 },
  ];
  /** 第 1 周周一 = 2026-08-31（与总课表"日期"行完全一致） */
  const BASE_DATE = new Date(2026, 7, 31);
  const STORE_KEY = 'fzxy-timetable-v1';

  /* ---------------- 配色 ---------------- */
  const PALETTES = {
    fresh: {
      name: '清新',
      colors: ['#4c8dff', '#43b7a6', '#7a6cf0', '#f2994a', '#3fa9d8', '#e2687e',
               '#5eb45e', '#8f7bd6', '#d99a3c', '#4fb0c6', '#ef8a5b', '#6c8ae4'],
    },
    candy: {
      name: '糖果',
      colors: ['#ff8fab', '#8ecae6', '#ffb703', '#b39ddb', '#66c2a5', '#f4845f',
               '#7ec8e3', '#e07be0', '#f2b880', '#9ad0c2', '#fd8a8a', '#a0c4ff'],
    },
    morandi: {
      name: '莫兰迪',
      colors: ['#8fa8b8', '#a8b3a0', '#b8a894', '#9a9bb8', '#b8a0a4', '#8fa89a',
               '#a6a08f', '#93a7b5', '#b0a3b5', '#9daa96', '#b5a89b', '#8d9aa8'],
    },
    ocean: {
      name: '深海',
      colors: ['#1f6fb2', '#2a9d8f', '#4361ee', '#1b7f79', '#3a5199', '#2e7d8f',
               '#5c6bc0', '#0f8b8d', '#457b9d', '#1d3557', '#38618c', '#2a9d94'],
    },
    sunset: {
      name: '暖阳',
      colors: ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#d1603d', '#c98b3b',
               '#e07a5f', '#81b29a', '#f2cc8f', '#bc6c25', '#dda15e', '#a47148'],
    },
    berry: {
      name: '莓果',
      colors: ['#8e44ad', '#e84393', '#6c5ce7', '#c0392b', '#9b59b6', '#d63d6c',
               '#7045af', '#b33771', '#5f27cd', '#e056fd', '#a61e4d', '#7d3c98'],
    },
  };

  const BRAND_PRESETS = ['#2563eb', '#0d9488', '#7c3aed', '#db2777', '#ea580c',
                         '#059669', '#0891b2', '#4f46e5', '#b45309', '#1e293b'];

  const BG_STYLES = {
    plain: { name: '素白', css: 'none' },
    dot: { name: '点点', css: 'radial-gradient(#dde6f2 1.2px, transparent 1.2px) 0 0/18px 18px' },
    grid: { name: '格纸', css: 'linear-gradient(#eaf0f8 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg,#eaf0f8 1px,transparent 1px) 0 0/26px 26px' },
    warm: { name: '暖霞', css: 'linear-gradient(135deg,#fff7f0 0%,#f7f9ff 45%,#f2f7ff 100%)' },
    mint: { name: '薄荷', css: 'linear-gradient(135deg,#f1fbf7 0%,#f6f9ff 60%,#eef4ff 100%)' },
  };

  /* ---------------- 小工具 ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(a) {
    return '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  /** t 为 b 的权重 */
  function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v * (1 - t) + B[i] * t)); }
  function tone(color, level) {
    if (level === 'bg') return mix(color, '#ffffff', 0.88);
    if (level === 'bg2') return mix(color, '#ffffff', 0.94);
    if (level === 'border') return mix(color, '#ffffff', 0.62);
    if (level === 'name') return mix(color, '#0f172a', 0.66);
    if (level === 'meta') return mix(color, '#334155', 0.42);
    return color;
  }
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  /* ---------------- 模糊搜索 ---------------- */
  const NOISE = /[\s\u3000·,，。.、/\\|()（）\[\]【】'"“”‘’:：;；\-—_]/g;
  function normText(s) { return String(s == null ? '' : s).toLowerCase().replace(NOISE, ''); }

  /**
   * 单段模糊匹配：返回得分，-1 表示不匹配。
   * 依次尝试 ① 连续子串 ② 按顺序出现的子序列（如"工应英"命中"工程应用英语"）
   */
  function fuzzyScore(text, needle) {
    const hay = normText(text), q = normText(needle);
    if (!q) return 0;
    if (!hay) return -1;
    const idx = hay.indexOf(q);
    if (idx >= 0) return 1000 + q.length * 10 - idx * 3 - (hay.length - q.length) * 0.2;

    let i = 0, first = -1, last = -1, streak = 0, best = 0;
    for (let j = 0; j < hay.length && i < q.length; j++) {
      if (hay[j] === q[i]) {
        if (first < 0) first = j;
        last = j; i++; streak++;
        if (streak > best) best = streak;
      } else {
        streak = 0;
      }
    }
    if (i < q.length) return -1;          // 有字符始终没出现
    const span = last - first + 1;
    return 400 + best * 12 - (span - q.length) * 4 - first * 0.4;
  }

  /** 多关键词（空格分隔，需全部命中）跨字段打分；每个字段单独打分取较高者，避免串字段误命中 */
  function fuzzyMatch(fields, query) {
    const q = String(query || '').trim();
    if (!q) return 1;
    const tokens = q.split(/[\s\u3000]+/).filter(Boolean);
    let total = 0;
    for (const t of tokens) {
      let best = -1;
      for (const [text, weight] of fields) {
        const s = fuzzyScore(text, t);
        if (s >= 0 && s * weight > best) best = s * weight;
      }
      if (best < 0) return -1;
      total += best;
    }
    return total;
  }

  /** 把过滤 + 模糊排序应用到课程目录 */
  function searchCatalog(query, predicate, order) {
    const q = String(query || '').trim();
    const items = CATALOG.filter(predicate || (() => true));
    if (!q) return items;
    const scored = [];
    items.forEach(c => {
      const fields = [
        [c.name, 2.2],
        [c.teacher, 1.3],
        [c.cls, 1.2],
        [c.locSummary, 1.0],
        [c.slots.map(s => DAYS[s[0] - 1]).join(''), 0.9],
      ];
      const score = fuzzyMatch(fields, q);
      if (score >= 0) scored.push({ c, score });
    });
    scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, 'zh'));
    return scored.map(x => x.c);
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function sectionOf(p) { const s = SECTIONS.find(x => p >= x.from && p <= x.to); return s ? s.name : ''; }

  /** [4,5,7,8,9] -> "4-5,7-9" */
  function compressWeeks(ws) {
    const a = Array.from(new Set(ws.filter(w => typeof w === 'number'))).sort((x, y) => x - y);
    if (!a.length) return '';
    const parts = []; let s = a[0], prev = a[0];
    for (let i = 1; i < a.length; i++) {
      if (a[i] === prev + 1) { prev = a[i]; continue; }
      parts.push(s === prev ? `${s}` : `${s}-${prev}`); s = prev = a[i];
    }
    parts.push(s === prev ? `${s}` : `${s}-${prev}`);
    return parts.join(',');
  }

  function dateOfWeekDay(w, dayIdx) {
    const d = new Date(BASE_DATE.getTime());
    d.setDate(d.getDate() + (w - 1) * 7 + dayIdx);
    return d;
  }
  function fmtMD(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
  function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  const TODAY = new Date();
  const TODAY_ISO = isoOf(TODAY);
  /** 今天属于第几教学周（不在学期内则为 null） */
  const TODAY_WEEK = (function () {
    const diff = Math.floor((new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()) - BASE_DATE) / 86400000);
    const w = Math.floor(diff / 7) + 1;
    return (diff >= 0 && w <= 21) ? w : null;
  })();

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 2000);
  }

  /* ---------------- 数据整理 ---------------- */
  const WEEKS = DATA.weeks.filter(w => w.w != null).sort((a, b) => a.w - b.w);
  const VACATION = DATA.weeks.find(w => w.isVacation) || null;
  const CATALOG = DATA.catalog.slice().sort((a, b) => {
    const wa = a.weeks.length ? a.weeks[0] : 99, wb = b.weeks.length ? b.weeks[0] : 99;
    return wa - wb || a.name.localeCompare(b.name, 'zh');
  });
  const CATALOG_BY_KEY = {};
  CATALOG.forEach(c => { CATALOG_BY_KEY[c.key] = c; });
  const HOLIDAY_WEEKS = {};
  WEEKS.forEach(w => {
    const h = w.entries.filter(e => e.kind === 'holiday').map(e => e.name.replace('不排课', ''));
    if (h.length) HOLIDAY_WEEKS[w.w] = Array.from(new Set(h)).join('、');
  });
  const weekHasCourse = w => {
    const x = WEEKS.find(v => v.w === w);
    return !!x && (x.entries || []).some(e => e.kind === 'course');
  };
  /** 第一周有排课的周次：前几周可能整周只有入学教育或假期 */
  const FIRST_COURSE_WEEK = (WEEKS.find(w => (w.entries || []).some(e => e.kind === 'course')) || WEEKS[0]).w;

  /* ---------------- 状态 ---------------- */
  const state = {
    view: 'home',
    masterWeek: (TODAY_WEEK && weekHasCourse(TODAY_WEEK)) ? TODAY_WEEK : FIRST_COURSE_WEEK,
    masterMode: 'week',
    picked: {},           // uid -> {uid,name,teacher,cls,color,sessions,custom}
    brand: '#2563eb',
    palette: 'fresh',
    bg: 'plain',
    radius: '14',
    sheetWidth: 100,      // 课表纸张宽度（占视口宽度的百分比），100 = 横向占满网页
    rowH: 58,             // 每节课的行高
    fontSize: 13.5,       // 课表格子字号
    show: { teacher: true, loc: true, weeks: true, cls: true, empty: true },
    title: '我的课程表',
    sub: '',
  };

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        picked: state.picked, brand: state.brand,
        palette: state.palette, bg: state.bg, radius: state.radius,
        sheetWidth: state.sheetWidth, rowH: state.rowH, fontSize: state.fontSize,
        show: state.show, title: state.title, sub: state.sub,
      }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      ['picked', 'brand', 'palette', 'bg', 'radius', 'sheetWidth', 'rowH', 'fontSize', 'show', 'title', 'sub']
        .forEach(k => { if (o[k] !== undefined && o[k] !== null) state[k] = o[k]; });
      state.show = Object.assign({ teacher: true, loc: true, weeks: true, cls: true, empty: true }, state.show || {});
    } catch (e) { /* 忽略损坏的存档 */ }
  }

  function paletteColors() { return (PALETTES[state.palette] || PALETTES.fresh).colors; }

  /** 取当前配色方案里"被用得最少"的颜色，保证多门课之间颜色分散 */
  function nextColor() {
    const cols = paletteColors();
    const used = {};
    pickedList().forEach(c => {
      const i = cols.indexOf(c.color);
      if (i >= 0) used[i] = (used[i] || 0) + 1;
    });
    let best = 0, fewest = Infinity;
    for (let i = 0; i < cols.length; i++) {
      const n = used[i] || 0;
      if (n < fewest) { fewest = n; best = i; }
    }
    return cols[best];
  }

  /**
   * 切换配色方案后重新分配颜色。
   * 单独调过颜色的课程（colorLocked）保持原色，其余全部按新方案重排。
   */
  function recolorAll() {
    const cols = paletteColors();
    let i = 0;
    pickedList().forEach(c => {
      if (!c.colorLocked) c.color = cols[(i++) % cols.length];
    });
    save();
  }

  /* ---------------- 我的课程 ---------------- */
  const pickedList = () => Object.values(state.picked);

  function addCatalog(key) {
    if (state.picked['c:' + key]) return;
    const item = CATALOG_BY_KEY[key];
    if (!item) return;
    state.picked['c:' + key] = {
      uid: 'c:' + key, name: item.name, teacher: item.teacher, cls: item.cls,
      color: nextColor(), colorLocked: false, custom: false,
      sessions: item.sessions.map(s => ({ w: s.w, day: s.day, p1: s.p1, p2: s.p2, loc: s.loc, mode: s.mode })),
    };
    save();
  }
  function removePick(uid) { delete state.picked[uid]; save(); }

  function addCustom(form) {
    const sess = [];
    for (let w = form.wFrom; w <= form.wTo; w++) {
      sess.push({ w, day: form.day, p1: form.p1, p2: form.p2, loc: form.loc, mode: '' });
    }
    const uid = 'u:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.picked[uid] = {
      uid, name: form.name, teacher: form.teacher, cls: '', color: form.color || nextColor(),
      colorLocked: false, custom: true, sessions: sess,
    };
    save();
    return uid;
  }

  /* ---------------- 块布局（仅真正重叠的区块才分列，其余占满整格） ---------------- */
  function layoutLanes(blocks) {
    const sorted = blocks.slice().sort((a, b) => a.p1 - b.p1 || a.p2 - b.p2);
    let i = 0;
    while (i < sorted.length) {
      // 找出一个"重叠簇"：后续块的开始节次不超过当前簇的最大结束节次
      let j = i, clusterEnd = sorted[i].p2;
      while (j + 1 < sorted.length && sorted[j + 1].p1 <= clusterEnd) {
        j++;
        clusterEnd = Math.max(clusterEnd, sorted[j].p2);
      }
      const cluster = sorted.slice(i, j + 1);
      const lanes = [];
      cluster.forEach(b => {
        let placed = false;
        for (let k = 0; k < lanes.length; k++) {
          if (lanes[k] < b.p1) { lanes[k] = b.p2; b.lane = k; placed = true; break; }
        }
        if (!placed) { b.lane = lanes.length; lanes.push(b.p2); }
      });
      const n = Math.max(1, lanes.length);
      cluster.forEach(b => { b.lanes = n; });
      i = j + 1;
    }
    blocks.forEach(b => { if (!b.lanes) b.lanes = 1; if (b.lane == null) b.lane = 0; });
    return blocks;
  }

  /** 总课表某一周的课程块 */
  function masterBlocks(week) {
    return (week.entries || []).map((e, i) => ({
      id: 'm' + week.w + '_' + i,
      day: e.day, p1: e.p1, p2: e.p2,
      name: e.name, teacher: e.teacher, cls: e.cls, loc: e.loc, mode: e.mode,
      kind: e.kind, weeks: [week.w],
      color: (e.kind === 'course')
        ? paletteColors()[hashStr(e.name) % paletteColors().length]
        : '#e8890c',
      special: e.kind !== 'course',
    }));
  }

  /** 我的课表（按 (日,节次段) 聚合开课周） */
  function personalBlocks(weekFilter) {
    const map = new Map();
    pickedList().forEach(c => {
      c.sessions.forEach(s => {
        if (weekFilter && s.w !== weekFilter) return;
        const k = `${c.uid}|${s.day}|${s.p1}|${s.p2}`;
        let g = map.get(k);
        if (!g) {
          g = {
            id: k, day: s.day, p1: s.p1, p2: s.p2, name: c.name, teacher: c.teacher,
            cls: c.cls, color: c.color, mode: s.mode, weeks: [], locs: [],
          };
          map.set(k, g);
        }
        g.weeks.push(s.w);
        if (s.loc && g.locs.indexOf(s.loc) < 0) g.locs.push(s.loc);
        if (s.mode && !g.mode) g.mode = s.mode;
      });
    });
    const out = Array.from(map.values());
    out.forEach(g => { g.loc = g.locs.join(' / '); g.weeks.sort((a, b) => a - b); });
    return out;
  }

  /** 检测同一周内时间重叠的课程 */
  function findConflicts() {
    const bad = [];
    const per = new Map();   // day|period -> [{...}]
    pickedList().forEach(c => c.sessions.forEach(s => {
      for (let p = s.p1; p <= s.p2; p++) {
        const k = s.day + '|' + p;
        if (!per.has(k)) per.set(k, []);
        per.get(k).push({ uid: c.uid, w: s.w, name: c.name, cls: c.cls, day: s.day, p });
      }
    }));
    const seen = new Set();
    per.forEach((arr, k) => {
      const byWeek = new Map();
      arr.forEach(a => { if (!byWeek.has(a.w)) byWeek.set(a.w, []); byWeek.get(a.w).push(a); });
      byWeek.forEach((list, w) => {
        const uids = Array.from(new Set(list.map(x => x.uid)));
        if (uids.length < 2) return;
        const sig = uids.slice().sort().join('+') + '@' + k;
        if (seen.has(sig)) return;
        seen.add(sig);
        bad.push({
          week: w, day: list[0].day, period: list[0].p,
          names: Array.from(new Set(list.map(x => x.name + (x.cls ? '（' + x.cls + '）' : '')))),
        });
      });
    });
    return bad.sort((a, b) => a.week - b.week || a.day - b.day);
  }

  /* ---------------- 课表渲染 ---------------- */
  /**
   * @param host  容器
   * @param blocks 课程块（未分列）
   * @param opts  { size:{rowH,name,meta}, show, emptyMark, dates, week, holidayDays, showWeeks }
   */
  const SIZE_MASTER = { rowH: 38, name: 12, meta: 11 };

  function renderGrid(host, blocks, opts) {
    opts = opts || {};
    const show = opts.show || { teacher: true, loc: true, weeks: true, cls: true };
    const size = opts.size || SIZE_MASTER;
    host.className = 'schedule';
    host.style.setProperty('--row-h', size.rowH + 'px');
    host.style.setProperty('--fs-name', size.name + 'px');
    host.style.setProperty('--fs-sheet', size.meta + 'px');
    host.innerHTML = '';
    const frag = document.createDocumentFragment();

    // 表头
    const corner = el('div', 'head-cell head-corner');
    corner.style.gridArea = '1 / 1';
    frag.appendChild(corner);
    DAYS.forEach((d, i) => {
      const h = el('div', 'head-cell');
      h.style.gridArea = `1 / ${i + 2}`;
      let dateHtml = '';
      if (opts.dates && opts.dates[i]) {
        const isToday = opts.dates[i] === TODAY_ISO;
        dateHtml = `<span class="hd-date">${fmtMD(dateOfWeekDay(opts.week, i))}${isToday ? ' · 今天' : ''}</span>`;
        if (isToday) h.classList.add('today');
      }
      h.innerHTML = `${d}${dateHtml}`;
      frag.appendChild(h);
    });

    // 节次列 + 背景格
    const blank = opts.blankDays || {};
    const holiday = opts.holidayDays || {};
    for (let p = 1; p <= PERIODS; p++) {
      const t = el('div', 'time-cell');
      t.style.gridArea = `${p + 1} / 1`;
      t.innerHTML = `<b>${p}</b><span>${sectionOf(p)}</span>`;
      frag.appendChild(t);
      for (let d = 1; d <= 7; d++) {
        const b = el('div', 'bg-cell');
        if (d >= 6) b.classList.add('weekend');
        if (holiday[d]) b.classList.add('holiday');
        b.style.gridArea = `${p + 1} / ${d + 1}`;
        frag.appendChild(b);
      }
    }

    // 课程块
    const byDay = {};
    for (let d = 1; d <= 7; d++) byDay[d] = [];
    blocks.forEach(b => { if (byDay[b.day]) byDay[b.day].push(b); });
    for (let d = 1; d <= 7; d++) layoutLanes(byDay[d]);

    blocks.forEach(b => {
      const node = el('div', 'block');
      const bg = tone(b.color, 'bg'), bd = tone(b.color, 'border');
      node.style.background = bg;
      node.style.borderColor = bd;
      node.style.gridArea = `${b.p1 + 1} / ${b.day + 1} / ${b.p2 + 2} / ${b.day + 2}`;
      if (b.lanes > 1) {
        const w = 100 / b.lanes;
        node.style.width = `calc(${w}% - 5px)`;
        node.style.marginLeft = `calc(${b.lane * w}%)`;
        node.style.justifySelf = 'start';
        node.classList.add('narrow');
      }
      if (b.special) node.classList.add('special');

      const lines = [];
      if (show.cls && b.cls) lines.push(esc(b.cls));
      if (show.teacher && b.teacher) lines.push(esc(b.teacher));
      let meta = lines.join(' · ');
      if (show.loc && b.loc) meta += (meta ? '<br>' : '') + esc(b.loc) + (b.mode ? ' · ' + esc(b.mode) : '');
      const wk = (show.weeks && opts.showWeeks !== false && b.weeks && b.weeks.length)
        ? `<div class="b-weeks">第 ${compressWeeks(b.weeks)} 周</div>` : '';

      node.innerHTML =
        `<span class="b-bar" style="background:${b.color}"></span>` +
        `<div class="b-name" style="color:${tone(b.color, 'name')}">${esc(b.name)}</div>` +
        (meta ? `<div class="b-meta" style="color:${tone(b.color, 'meta')}">${meta}</div>` : '') +
        wk;
      frag.appendChild(node);
    });

    // 空课标记
    if (opts.emptyMark) {
      const occupied = {};
      blocks.forEach(b => { for (let p = b.p1; p <= b.p2; p++) occupied[b.day + '|' + p] = 1; });
      for (let d = 1; d <= 7; d++) {
        for (let p = 1; p <= PERIODS; p++) {
          if (occupied[d + '|' + p]) continue;
          const m = el('div', 'empty-mark', '无课');
          m.style.gridArea = `${p + 1} / ${d + 1}`;
          frag.appendChild(m);
        }
      }
    }

    host.appendChild(frag);
  }

  /* ---------------- 导航 ---------------- */
  function goto(view) {
    state.view = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    $$('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'master') renderMaster();
    if (view === 'mine') renderMine();
    if (view === 'output') renderOutput();
  }

  /* ---------------- 总课程表视图 ---------------- */
  function renderMaster() {
    $('#statWeeks').textContent = WEEKS.length;
    $('#statCourses').textContent = CATALOG.length;
    $('#masterCount').textContent = WEEKS.reduce((n, w) => n + (w.entries || []).length, 0);
    $('#masterWeekPane').hidden = state.masterMode !== 'week';
    $('#masterListPane').hidden = state.masterMode !== 'list';
    if (state.masterMode === 'week') renderMasterWeek(); else renderMasterList();
  }

  function renderMasterWeek() {
    const wk = WEEKS.find(w => w.w === state.masterWeek) || WEEKS[0];
    state.masterWeek = wk.w;

    // 周条
    const strip = $('#weekStrip');
    strip.innerHTML = '';
    WEEKS.forEach(w => {
      const chip = el('button', 'wchip');
      if (HOLIDAY_WEEKS[w.w]) chip.classList.add('holiday');
      if (w.w === wk.w) chip.classList.add('active');
      const d0 = dateOfWeekDay(w.w, 0), d6 = dateOfWeekDay(w.w, 6);
      chip.innerHTML = `<b>第 ${w.w} 周</b><span>${fmtMD(d0)} - ${fmtMD(d6)}</span>`;
      chip.dataset.w = w.w;
      chip.onclick = () => { state.masterWeek = w.w; renderMasterWeek(); };
      strip.appendChild(chip);
    });
    if (VACATION) {
      const chip = el('button', 'wchip vacation');
      chip.innerHTML = `<b>寒假</b><span>1/25 - 1/31</span>`;
      chip.onclick = () => toast('寒假期间没有排课安排');
      strip.appendChild(chip);
    }
    const active = $('.wchip.active', strip);
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });

    // 图例
    const legend = $('#masterLegend');
    legend.innerHTML = '';
    const names = Array.from(new Set(wk.entries.filter(e => e.kind === 'course').map(e => e.name)));
    names.slice(0, 16).forEach(n => {
      const c = paletteColors()[hashStr(n) % paletteColors().length];
      const it = el('span', 'legend-item');
      it.innerHTML = `<i class="legend-dot" style="background:${c}"></i>${esc(n)}`;
      legend.appendChild(it);
    });
    if (HOLIDAY_WEEKS[wk.w]) {
      legend.appendChild(el('span', 'legend-item',
        `<i class="legend-dot" style="background:#e8890c"></i>本周：${esc(HOLIDAY_WEEKS[wk.w])}`));
    }

    const holidayDays = {};
    wk.entries.filter(e => e.kind === 'holiday').forEach(e => { holidayDays[e.day] = 1; });
    const dates = {};
    for (let i = 0; i < 7; i++) dates[i] = isoOf(dateOfWeekDay(wk.w, i));

    renderGrid($('#masterGrid'), masterBlocks(wk), {
      size: SIZE_MASTER, show: { teacher: true, loc: true, cls: false, weeks: false },
      dates, week: wk.w, holidayDays, showWeeks: false,
    });
  }

  function renderMasterList() {
    const q = $('#masterSearch').value || '';
    const sort = $('#masterSort').value;
    let list = searchCatalog(q);
    if (!q.trim()) {
      if (sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      if (sort === 'day') list = list.slice().sort((a, b) =>
        Math.min(...a.slots.map(s => s[0])) - Math.min(...b.slots.map(s => s[0])) || a.name.localeCompare(b.name, 'zh'));
    }

    const host = $('#masterCatalog');
    host.innerHTML = '';
    if (!list.length) { host.appendChild(el('div', 'my-empty', '没有找到匹配的课程')); return; }
    list.forEach(c => {
      const color = paletteColors()[hashStr(c.name) % paletteColors().length];
      const item = el('div', 'cat-item');
      const slots = c.slots.map(([d, p1, p2]) => {
        const ws = c.sessions.filter(s => s.day === d && s.p1 === p1 && s.p2 === p2).map(s => s.w);
        return `<span class="tag w">${DAYS[d - 1]} ${p1}-${p2}节 · 第${compressWeeks(ws)}周</span>`;
      }).join('');
      item.innerHTML =
        `<span class="cat-bar" style="background:${color}"></span>
         <div class="cat-body">
           <div class="cat-title">${esc(c.name)}</div>
           <div class="cat-sub">${esc(c.teacher || '未标注教师')}${c.cls ? ' · ' + esc(c.cls) : ''} · ${esc(c.locSummary || '地点待定')}</div>
           <div class="cat-tags">${slots}</div>
         </div>`;
      host.appendChild(item);
    });
  }

  /* ---------------- 我的课程表视图 ---------------- */
  function renderMine() {
    renderPickList();
    renderMyList();
    renderConflicts();
    const n = pickedList().length;
    $('#pickCount').textContent = `已选 ${n} 门`;
    $('#myCount').textContent = n;
  }

  function matchFilter(c) {
    const f = $('#pickFilter').value;
    if (f === 'hasCls') return !!c.cls;
    if (f === 'hasWeeks') return c.weeks.length >= 8;
    if (f === 'picked') return !!state.picked['c:' + c.key];
    return true;
  }

  function renderPickList() {
    const q = $('#pickSearch').value || '';
    const list = searchCatalog(q, matchFilter);
    const host = $('#pickList');
    const keepScroll = host.scrollTop;   // 勾选后重绘不应把列表弹回顶部
    host.innerHTML = '';
    if (!list.length) { host.appendChild(el('div', 'my-empty', '没有符合条件的课程')); return; }
    list.forEach(c => {
      const on = !!state.picked['c:' + c.key];
      const color = on ? state.picked['c:' + c.key].color : paletteColors()[hashStr(c.name) % paletteColors().length];
      const row = el('label', 'pick' + (on ? ' on' : ''));
      const slots = c.slots.map(([d, p1, p2]) => {
        const ws = c.sessions.filter(s => s.day === d && s.p1 === p1 && s.p2 === p2).map(s => s.w);
        return `<span class="tag w">${DAYS[d - 1]} ${p1}-${p2}节 · 第${compressWeeks(ws)}周</span>`;
      }).join('');
      row.innerHTML =
        `<input type="checkbox" ${on ? 'checked' : ''}>
         <div class="pick-body">
           <div class="pick-title">
             <i class="legend-dot" style="background:${color}"></i>${esc(c.name)}
             <span class="cls ${c.cls ? '' : 'none'}">${esc(c.cls || '未分班')}</span>
           </div>
           <div class="pick-meta">${esc(c.teacher || '教师待定')} · ${esc(c.locSummary || '地点待定')} · 共 ${c.sessions.length} 次课</div>
           <div class="pick-slots">${slots}</div>
         </div>`;
      const cb = $('input', row);
      cb.onchange = () => {
        if (cb.checked) addCatalog(c.key); else removePick('c:' + c.key);
        renderMine(); renderOutput();
      };
      row.onclick = ev => { if (ev.target !== cb) { ev.preventDefault(); cb.checked = !cb.checked; cb.onchange(); } };
      host.appendChild(row);
    });
    host.scrollTop = keepScroll;
  }

  function slotText(course) {
    const parts = [];
    const seen = {};
    course.sessions.forEach(s => {
      const k = s.day + '|' + s.p1 + '|' + s.p2;
      if (seen[k]) return;
      seen[k] = 1;
      const ws = course.sessions.filter(x => x.day === s.day && x.p1 === s.p1 && x.p2 === s.p2).map(x => x.w);
      parts.push(`${DAYS[s.day - 1]} ${s.p1}-${s.p2}节（第${compressWeeks(ws)}周）`);
    });
    return parts.join('　');
  }

  function renderMyList() {
    const host = $('#myList');
    const list = pickedList();
    host.innerHTML = '';
    if (!list.length) {
      host.appendChild(el('div', 'my-empty', '还没有选择课程，去左边勾几门，或在上面手动添加一门吧。'));
      return;
    }
    list.forEach(c => {
      const row = el('div', 'my-item');
      row.innerHTML =
        `<div class="my-head">
           <span class="my-dot" style="background:${c.color}"></span>
           <span class="my-name">${esc(c.name)}${c.cls ? ' · ' + esc(c.cls) : ''}${c.custom ? ' <span class="tag">自定义</span>' : ''}</span>
           <span class="my-acts">
             <input type="color" class="my-color" value="${c.color}" title="单独调整这门课的颜色（调整后不再跟随配色方案）">
             <button class="icon-btn reset" title="恢复跟随配色方案">↺</button>
             <button class="icon-btn del" title="移除这门课">✕</button>
           </span>
         </div>
         <div class="my-meta">${esc(slotText(c) || '暂无时段')}</div>`;
      const ci = $('.my-color', row);
      ci.oninput = () => {
        c.color = ci.value; c.colorLocked = true;
        save(); renderMyList(); renderOutput();
      };
      $('.icon-btn.reset', row).onclick = () => {
        c.colorLocked = false;
        const cols = paletteColors();
        const used = {};
        pickedList().forEach(x => { const i = cols.indexOf(x.color); if (i >= 0) used[i] = (used[i] || 0) + 1; });
        let pick = cols.findIndex((_, i) => !used[i]);
        if (pick < 0) pick = pickedList().indexOf(c) % cols.length;
        c.color = cols[pick];
        save(); renderMyList(); renderOutput();
      };
      $('.icon-btn.del', row).onclick = () => { removePick(c.uid); renderMine(); renderOutput(); };
      host.appendChild(row);
    });
  }

  function renderConflicts() {
    const box = $('#conflictBox');
    const bad = findConflicts();
    if (!bad.length) {
      box.className = 'conflict-ok';
      box.textContent = pickedList().length ? '暂无冲突，时间安排很清爽。' : '选择课程后会自动帮你检查时间冲突。';
      return;
    }
    box.className = 'conflict-bad';
    const shown = bad.slice(0, 6).map(b =>
      `<li>第 ${b.week} 周 ${DAYS[b.day - 1]} 第 ${b.period} 节：${esc(b.names.join(' ✕ '))}</li>`).join('');
    box.innerHTML = `发现 ${bad.length} 处时间冲突：<ul>${shown}</ul>` +
      (bad.length > 6 ? `<div style="margin-top:6px">…还有 ${bad.length - 6} 处</div>` : '');
  }

  function initCustomForm() {
    const daySel = $('#cDay'), sSel = $('#cStart'), eSel = $('#cEnd'),
          wf = $('#cWeekFrom'), wt = $('#cWeekTo');
    DAYS.forEach((d, i) => daySel.appendChild(new Option(d, i + 1)));
    for (let p = 1; p <= PERIODS; p++) {
      sSel.appendChild(new Option(`第 ${p} 节`, p));
      eSel.appendChild(new Option(`第 ${p} 节`, p));
    }
    WEEKS.forEach(w => {
      wf.appendChild(new Option(`第 ${w.w} 周`, w.w));
      wt.appendChild(new Option(`第 ${w.w} 周`, w.w));
    });
    sSel.value = '1'; eSel.value = '2';
    wf.value = '1'; wt.value = String(WEEKS.length);
    $('#cColor').value = nextColor();
  }

  /* ---------------- 输出视图 ---------------- */
  function currentWeekFilter() {
    const v = $('#outWeek').value;
    return v === 'all' ? null : Number(v);
  }

  /** 课表格子尺寸（宽度 / 行高 / 字号全部可 DIY） */
  function outputSize() {
    const fs = Number(state.fontSize) || 13.5;
    return {
      rowH: Number(state.rowH) || 58,
      name: fs,
      meta: Math.max(9.5, fs - 1),
    };
  }

  /**
   * 把课表纸张铺开：宽度按"视口宽度的百分比"计算，
   * 100% 即横向占满整个网页（容器出血到视口两边）。
   */
  function applySheetSize() {
    const wrap = $('#outWrap');
    const sheet = $('#outSheet');
    if (!wrap || !sheet) return;
    const vw = Math.max(320, document.documentElement.clientWidth);
    const ratio = Number(state.sheetWidth) || 100;
    const w = Math.max(720, Math.round(vw * ratio / 100));
    wrap.style.width = vw + 'px';
    wrap.style.marginLeft = `calc(50% - ${vw / 2}px)`;
    sheet.style.width = w + 'px';
    sheet.style.marginLeft = 'auto';
    sheet.style.marginRight = 'auto';
    const g = $('#outGrid');
    if (g) {
      const s = outputSize();
      g.style.setProperty('--row-h', s.rowH + 'px');
      g.style.setProperty('--fs-name', s.name + 'px');
      g.style.setProperty('--fs-sheet', s.meta + 'px');
    }
    const lbl = $('#dWidthVal');
    if (lbl) lbl.textContent = ratio + '%' + (ratio === 100 ? ' · 占满' : '');
    const rh = $('#dRowHVal'); if (rh) rh.textContent = (Number(state.rowH) || 58) + 'px';
    const fo = $('#dFontVal'); if (fo) fo.textContent = (Number(state.fontSize) || 13.5) + 'px';
  }

  function initOutWeekSelect() {
    const sel = $('#outWeek');
    sel.innerHTML = '';
    sel.appendChild(new Option('整个学期（全周次）', 'all'));
    WEEKS.forEach(w => sel.appendChild(new Option(`只看第 ${w.w} 周`, String(w.w))));
    sel.value = 'all';
  }

  function applyTheme() {
    const root = document.documentElement;
    root.style.setProperty('--brand', state.brand);
    root.style.setProperty('--brand-2', mix(state.brand, '#ffffff', 0.34));
    root.style.setProperty('--brand-soft', mix(state.brand, '#ffffff', 0.92));
    root.style.setProperty('--bg-image', (BG_STYLES[state.bg] || BG_STYLES.plain).css);
    root.style.setProperty('--radius-cell', state.radius === '999' ? '14px' : state.radius + 'px');
    root.style.setProperty('--radius', state.radius === '0' ? '4px' : (state.radius === '999' ? '26px' : '18px'));
    $('#quickBrand').value = state.brand;
    $$('#brandSwatches .sw').forEach(s => s.classList.toggle('active', s.dataset.c === state.brand));
    $$('#paletteList .sw').forEach(s => s.classList.toggle('active', s.dataset.k === state.palette));
    $$('#bgList .sw').forEach(s => s.classList.toggle('active', s.dataset.k === state.bg));
    $('#dRadius').value = state.radius;
    $$('#dToggles input').forEach(i => { i.checked = !!state.show[i.dataset.k]; });
    $('#dTitle').value = state.title;
    $('#dSub').value = state.sub;
    $('#dWidth').value = state.sheetWidth;
    $('#dRowH').value = state.rowH;
    $('#dFont').value = state.fontSize;
  }

  function buildDiyControls() {
    const bs = $('#brandSwatches');
    bs.innerHTML = '';
    BRAND_PRESETS.forEach(c => {
      const s = el('button', 'sw' + (c === state.brand ? ' active' : ''));
      s.style.background = c; s.dataset.c = c; s.title = c;
      s.onclick = () => { state.brand = c; save(); applyTheme(); renderOutput(); };
      bs.appendChild(s);
    });
    const pl = $('#paletteList');
    pl.innerHTML = '';
    Object.keys(PALETTES).forEach(k => {
      const p = PALETTES[k];
      const s = el('button', 'sw' + (k === state.palette ? ' active' : ''));
      s.dataset.k = k; s.title = p.name;
      s.style.background = `linear-gradient(135deg, ${p.colors[0]} 0 33%, ${p.colors[1]} 33% 66%, ${p.colors[2]} 66% 100%)`;
      s.onclick = () => {
        state.palette = k;
        recolorAll();
        applyTheme(); renderMaster(); renderPickList(); renderMyList(); renderOutput();
        toast('已切换到「' + p.name + '」配色');
      };
      pl.appendChild(s);
    });
    const bl = $('#bgList');
    bl.innerHTML = '';
    Object.keys(BG_STYLES).forEach(k => {
      const s = el('button', 'sw rounded' + (k === state.bg ? ' active' : ''));
      s.dataset.k = k; s.title = BG_STYLES[k].name;
      s.style.background = BG_STYLES[k].css === 'none' ? '#ffffff' : BG_STYLES[k].css;
      s.style.backgroundSize = '10px 10px';
      s.onclick = () => { state.bg = k; save(); applyTheme(); };
      bl.appendChild(s);
    });
  }

  function renderOutput() {
    const wf = currentWeekFilter();
    const blocks = personalBlocks(wf);
    const has = pickedList().length > 0;

    $('#outEmpty').hidden = has;
    $('#outWrap').style.display = has ? '' : 'none';
    $('#outSheet').style.display = has ? '' : 'none';
    if (!has) { $('#outSummary').textContent = '尚未选择课程'; return; }

    $('#outTitle').textContent = state.title || '我的课程表';
    const subParts = [];
    if (state.sub) subParts.push(state.sub);
    subParts.push('福州学院 · 2026—2027 学年 秋季学期');
    if (wf) subParts.push(`第 ${wf} 周（${fmtMD(dateOfWeekDay(wf, 0))} - ${fmtMD(dateOfWeekDay(wf, 6))}）`);
    $('#outSub').textContent = subParts.join('　|　');

    const total = blocks.reduce((n, b) => n + (b.weeks.length || 0), 0);
    $('#outSummary').textContent = `${pickedList().length} 门课 · ${blocks.length} 个时段` + (wf ? ` · 第 ${wf} 周有 ${blocks.length} 个时段` : ` · 共 ${total} 次课`);

    const wk = WEEKS.find(w => w.w === wf);
    const dates = {};
    for (let i = 0; i < 7; i++) dates[i] = wf ? isoOf(dateOfWeekDay(wf, i)) : null;

    renderGrid($('#outGrid'), blocks, {
      size: outputSize(),
      show: state.show,
      emptyMark: state.show.empty,
      dates: wf ? dates : null,
      week: wf || 0,
      showWeeks: !wf,
    });
    applySheetSize();
    $('#outFoot').textContent = `共 ${pickedList().length} 门课程　·　生成时间 ${new Date().toLocaleString('zh-CN')}　·　数据来源：福州学院总课程表`;

    window.__outBlocks = blocks;
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $$('#tabs .tab').forEach(b => b.onclick = () => goto(b.dataset.view));
    $$('[data-goto]').forEach(b => b.onclick = () => goto(b.dataset.goto));

    $('#quickBrand').oninput = e => { state.brand = e.target.value; save(); applyTheme(); };

    // 总课表
    $('#masterMode').onclick = e => {
      const b = e.target.closest('.seg-btn'); if (!b) return;
      state.masterMode = b.dataset.mode;
      $$('#masterMode .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      renderMaster();
    };
    $('#weekPrev').onclick = () => { state.masterWeek = Math.max(1, state.masterWeek - 1); renderMasterWeek(); };
    $('#weekNext').onclick = () => { state.masterWeek = Math.min(WEEKS.length, state.masterWeek + 1); renderMasterWeek(); };
    $('#masterSearch').oninput = renderMasterList;
    $('#masterSort').onchange = renderMasterList;

    // 我的课表
    $('#pickSearch').oninput = renderPickList;
    $('#pickFilter').onchange = renderPickList;
    $('#pickAll').onclick = () => {
      searchCatalog($('#pickSearch').value || '', matchFilter).forEach(c => addCatalog(c.key));
      renderMine(); renderOutput(); toast('已添加当前筛选出的课程');
    };
    $('#clearPicked').onclick = () => {
      if (!pickedList().length) return;
      state.picked = {}; save(); renderMine(); renderOutput(); toast('已清空我的课程');
    };
    $('#customForm').onsubmit = e => {
      e.preventDefault();
      const name = $('#cName').value.trim();
      if (!name) { toast('请先填写课程名称'); $('#cName').focus(); return; }
      let p1 = Number($('#cStart').value), p2 = Number($('#cEnd').value);
      if (p1 > p2) { const t = p1; p1 = p2; p2 = t; }
      let w1 = Number($('#cWeekFrom').value), w2 = Number($('#cWeekTo').value);
      if (w1 > w2) { const t = w1; w1 = w2; w2 = t; }
      addCustom({
        name, teacher: $('#cTeacher').value.trim(), loc: $('#cLoc').value.trim(),
        day: Number($('#cDay').value), p1, p2, wFrom: w1, wTo: w2,
        color: $('#cColor').value,
      });
      $('#cName').value = ''; $('#cLoc').value = ''; $('#cTeacher').value = '';
      $('#cColor').value = nextColor();
      renderMine(); renderOutput(); toast('已添加自定义课程');
    };

    // 输出 / DIY
    $('#toggleDiy').onclick = () => { const p = $('#diyPanel'); p.hidden = !p.hidden; };
    $('#outWeek').onchange = renderOutput;
    $('#dTitle').oninput = e => { state.title = e.target.value; save(); renderOutput(); };
    $('#dSub').oninput = e => { state.sub = e.target.value; save(); renderOutput(); };
    $('#dRadius').onchange = e => { state.radius = e.target.value; save(); applyTheme(); renderOutput(); };
    const onSize = (key, el, after) => {
      const h = e => {
        state[key] = Number(e.target.value);
        save(); applySheetSize();
        if (after) after();
      };
      el.addEventListener('input', h);
    };
    onSize('sheetWidth', $('#dWidth'));
    onSize('rowH', $('#dRowH'), renderOutput);
    onSize('fontSize', $('#dFont'), renderOutput);
    $('#dSizeReset').onclick = () => {
      state.sheetWidth = 100; state.rowH = 58; state.fontSize = 13.5;
      save(); applyTheme(); applySheetSize(); renderOutput(); toast('表格尺寸已恢复默认');
    };
    $$('#dToggles input').forEach(i => i.onchange = () => {
      state.show[i.dataset.k] = i.checked; save(); renderOutput();
    });
    $('#resetDiy').onclick = () => {
      state.brand = '#2563eb'; state.palette = 'fresh'; state.bg = 'plain';
      state.radius = '14'; state.sheetWidth = 100; state.rowH = 58; state.fontSize = 13.5;
      state.show = { teacher: true, loc: true, weeks: true, cls: true, empty: true };
      state.title = '我的课程表'; state.sub = '';
      save(); applyTheme(); renderOutput(); toast('样式已恢复默认');
    };
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    load();
    buildDiyControls();
    applyTheme();
    initCustomForm();
    initOutWeekSelect();
    bind();
    applySheetSize();
    let rzT = null;
    window.addEventListener('resize', () => {
      clearTimeout(rzT);
      rzT = setTimeout(applySheetSize, 120);
    });
    $('#brandSub').innerHTML = `2026—2027 学年 秋季学期 · 共 <span id="statWeeks">${WEEKS.length}</span> 个教学周 / <span id="statCourses">${CATALOG.length}</span> 门课程`;
    const kicker = TODAY_WEEK ? `　·　当前为第 ${TODAY_WEEK} 周` : '';
    $('#brandSub').innerHTML += `<span class="muted">${kicker}</span>`;
    goto('home');
  }

  window.App = { state, toast, renderOutput, renderMine, renderMaster, masterBlocks, personalBlocks, TODAY_WEEK, WEEKS, DAYS, tone, compressWeeks, dateOfWeekDay, fmtMD };
  document.addEventListener('DOMContentLoaded', init);
})();
