/* ============================================================
   福州学院 · 课程表助手  —  课表图片导出
   不依赖任何第三方库：直接用 Canvas 2D 画一张高清课表并下载 PNG
   ============================================================ */
(function () {
  'use strict';

  const A = () => window.App;
  const RADIUS = 14;

  /* ---------------- Canvas 小工具 ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(hex, t) {   // t>0 变亮，t<0 变暗
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  /** 按宽度折行，返回实际绘制的行 */
  function wrap(ctx, text, maxW, maxLines) {
    const out = [];
    if (!text) return out;
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const ch of paragraph) {
        if (ctx.measureText(line + ch).width > maxW && line) {
          out.push(line);
          line = ch;
          if (maxLines && out.length >= maxLines) break;
        } else {
          line += ch;
        }
      }
      if (maxLines && out.length >= maxLines) break;
      if (line) out.push(line);
      if (maxLines && out.length >= maxLines) break;
    }
    if (maxLines && out.length > maxLines) out.length = maxLines;
    return out;
  }

  function drawLines(ctx, lines, x, y, lineH) {
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
    return y + lines.length * lineH;
  }

  /* ---------------- 主流程 ---------------- */
  function buildModel() {
    const app = A();
    const st = app.state;
    const wfSel = document.querySelector('#outWeek').value;
    const wf = wfSel === 'all' ? null : Number(wfSel);
    const blocks = app.personalBlocks(wf);

    const dayHeaders = app.DAYS.map((d, i) => ({
      label: d,
      date: wf ? app.fmtMD(app.dateOfWeekDay(wf, i)) : '',
    }));

    // 冲突分列：仅对真正重叠的"簇"分列，避免整列被压窄
    const byDay = {};
    for (let d = 1; d <= 7; d++) byDay[d] = [];
    blocks.forEach(b => byDay[b.day].push(b));
    for (let d = 1; d <= 7; d++) {
      const sorted = byDay[d].slice().sort((a, b) => a.p1 - b.p1 || a.p2 - b.p2);
      let i = 0;
      while (i < sorted.length) {
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
    }

    return {
      blocks, dayHeaders, wf, st,
      title: st.title || '我的课程表',
      sub: [
        st.sub,
        '福州学院 · 2026—2027 学年 秋季学期',
        wf ? `第 ${wf} 周（${app.fmtMD(app.dateOfWeekDay(wf, 0))} - ${app.fmtMD(app.dateOfWeekDay(wf, 6))}）` : '全周次',
      ].filter(Boolean).join('　|　'),
      foot: `共 ${Object.keys(st.picked).length} 门课程　·　导出时间 ${new Date().toLocaleString('zh-CN')}　·　数据来源：福州学院总课程表`,
    };
  }

  function draw(model) {
    const { st, blocks, dayHeaders } = model;
    // 与页面预览完全同源：行高、字号、纸张宽度都跟随 DIY 设置
    const rowH = Number(st.rowH) || 58;
    const fs = Number(st.fontSize) || 13.5;
    const D = {
      rowH,
      name: fs,
      meta: Math.max(9.5, fs - 1),
      wk: Math.max(9, fs - 1.5),
      head: Math.round(Math.min(84, Math.max(48, rowH * 0.9 + 8))),
    };

    const PAD = 44;
    const TIME_W = 118;
    const GAP = 6;
    const ROW_GAP = 6;
    // 导出图宽度跟随"表格宽度"设置，保证导出效果和页面所见一致
    const W = Math.round(Math.min(3400, Math.max(1400, 1740 * ((st.sheetWidth || 100) / 100))));
    const contentW = W - PAD * 2;
    const dayW = (contentW - TIME_W - GAP * 7) / 7;
    const gridH = 12 * D.rowH + 11 * ROW_GAP;
    const titleH = 52 + (model.sub ? 30 : 0);
    const H = PAD + titleH + D.head + GAP + gridH + 58 + PAD;

    const scale = 2;
    const cv = document.createElement('canvas');
    cv.width = W * scale; cv.height = H * scale;
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);

    const FONT = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';
    const brand = st.brand;
    const RAD = st.radius === '0' ? 0 : (st.radius === '999' ? Math.min(20, D.rowH / 2) : 14);

    // 背景
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.55, shade(brand, 0.975));
    bg.addColorStop(1, shade(brand, 0.95));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 顶部品牌条
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, brand);
    grad.addColorStop(1, shade(brand, 0.45));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 7);

    // 标题
    let y = PAD + 8;
    ctx.textAlign = 'center';
    ctx.fillStyle = brand;
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(model.title, W / 2, y + 30);
    y += 52;
    if (model.sub) {
      ctx.fillStyle = '#7a8798';
      ctx.font = `400 15px ${FONT}`;
      ctx.fillText(model.sub, W / 2, y + 4);
      y += 30;
    }
    ctx.textAlign = 'left';

    // 表头
    const headY = y;
    ctx.font = `700 16px ${FONT}`;
    dayHeaders.forEach((h, i) => {
      const x = PAD + TIME_W + GAP + i * (dayW + GAP);
      const isWeekend = i >= 5;
      roundRect(ctx, x, headY, dayW, D.head, 12);
      ctx.fillStyle = isWeekend ? shade(brand, 0.93) : shade(brand, 0.955);
      ctx.fill();
      ctx.strokeStyle = shade(brand, 0.86);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = shade(brand, -0.55);
      ctx.textAlign = 'center';
      ctx.fillText(h.label, x + dayW / 2, headY + (h.date ? D.head / 2 - 3 : D.head / 2 + 6));
      if (h.date) {
        ctx.fillStyle = '#8a97a8';
        ctx.font = `400 12.5px ${FONT}`;
        ctx.fillText(h.date, x + dayW / 2, headY + D.head / 2 + 17);
        ctx.font = `700 16px ${FONT}`;
      }
      ctx.textAlign = 'left';
    });

    const gridY = headY + D.head + GAP;

    // 节次列 + 空格底 + 课程块
    const secName = p => (p <= 4 ? '上午' : p <= 8 ? '下午' : '晚上');
    for (let p = 1; p <= 12; p++) {
      const ry = gridY + (p - 1) * (D.rowH + ROW_GAP);

      // 节次
      roundRect(ctx, PAD, ry, TIME_W, D.rowH, 10);
      ctx.fillStyle = shade(brand, 0.965);
      ctx.fill();
      ctx.strokeStyle = '#eef2f9';
      ctx.lineWidth = 1; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = shade(brand, -0.5);
      ctx.font = `700 17px ${FONT}`;
      ctx.fillText(String(p), PAD + TIME_W / 2, ry + D.rowH / 2 + 1);
      ctx.fillStyle = '#93a1b3';
      ctx.font = `400 11px ${FONT}`;
      ctx.fillText(secName(p), PAD + TIME_W / 2, ry + D.rowH / 2 + 16);
      ctx.textAlign = 'left';

      // 空格底
      for (let d = 1; d <= 7; d++) {
        const x = PAD + TIME_W + GAP + (d - 1) * (dayW + GAP);
        roundRect(ctx, x, ry, dayW, D.rowH, RAD);
        ctx.fillStyle = d >= 6 ? shade(brand, 0.982) : '#fbfcfe';
        ctx.fill();
        ctx.strokeStyle = '#f1f4fa';
        ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // 课程块
    blocks.forEach(b => {
      const laneW = (dayW - (b.lanes - 1) * 5) / b.lanes;
      const x = PAD + TIME_W + GAP + (b.day - 1) * (dayW + GAP) + b.lane * (laneW + 5);
      const y0 = gridY + (b.p1 - 1) * (D.rowH + ROW_GAP);
      const h = (b.p2 - b.p1 + 1) * D.rowH + (b.p2 - b.p1) * ROW_GAP;

      roundRect(ctx, x, y0, laneW, h, RAD);
      ctx.fillStyle = shade(b.color, 0.855);
      ctx.fill();
      ctx.strokeStyle = shade(b.color, 0.62);
      ctx.lineWidth = 1;
      ctx.stroke();
      // 左侧色条
      ctx.save();
      roundRect(ctx, x, y0, laneW, h, RAD);
      ctx.clip();
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y0, 5, h);
      ctx.restore();

      // 文字（被压窄的块同步缩小字号与留白）
      const narrow = b.lanes > 1;
      const padL = narrow ? 10 : 13;
      const FX = { name: narrow ? D.name - 1.5 : D.name, meta: narrow ? D.meta - 1.5 : D.meta, wk: narrow ? D.wk - 1.5 : D.wk };
      const tx = x + padL;
      const maxW = laneW - padL - 9;
      ctx.save();
      roundRect(ctx, x, y0, laneW, h, RAD);
      ctx.clip();

      const rows = [];
      const nameFont = `700 ${FX.name}px ${FONT}`;
      ctx.font = nameFont;
      rows.push({ text: wrap(ctx, b.name, maxW, 4), font: nameFont, color: shade(b.color, -0.66), lh: FX.name + 4 });

      const metaParts = [];
      if (st.show.cls && b.cls) metaParts.push(b.cls);
      if (st.show.teacher && b.teacher) metaParts.push(b.teacher);
      if (st.show.loc && b.loc) metaParts.push(b.loc + (b.mode ? ' · ' + b.mode : ''));
      if (metaParts.length) {
        const f = `400 ${FX.meta}px ${FONT}`;
        ctx.font = f;
        rows.push({ text: wrap(ctx, metaParts.join(' · '), maxW, 4), font: f, color: shade(b.color, -0.42), lh: FX.meta + 3.5 });
      }
      if (st.show.weeks && !model.wf && b.weeks && b.weeks.length) {
        const f = `600 ${FX.wk}px ${FONT}`;
        ctx.font = f;
        rows.push({ text: wrap(ctx, '第 ' + A().compressWeeks(b.weeks) + ' 周', maxW, 3), font: f, color: shade(b.color, -0.3), lh: FX.wk + 3.5 });
      }

      const totalH = rows.reduce((n, r) => n + r.text.length * r.lh, 0) + (rows.length - 1) * 1;
      let ty = y0 + Math.max(9, (h - totalH) / 2 + FX.name * 0.85);
      rows.forEach(r => {
        ctx.font = r.font;
        ctx.fillStyle = r.color;
        ty = drawLines(ctx, r.text, tx, ty, r.lh) + 1;
      });
      ctx.restore();
    });

    // 无课标记
    if (st.show.empty) {
      const occ = {};
      blocks.forEach(b => { for (let p = b.p1; p <= b.p2; p++) occ[b.day + '|' + p] = 1; });
      ctx.textAlign = 'center';
      ctx.font = `400 12px ${FONT}`;
      ctx.fillStyle = '#c6cfdb';
      for (let d = 1; d <= 7; d++) {
        for (let p = 1; p <= 12; p++) {
          if (occ[d + '|' + p]) continue;
          const x = PAD + TIME_W + GAP + (d - 1) * (dayW + GAP);
          const ry = gridY + (p - 1) * (D.rowH + ROW_GAP);
          ctx.fillText('无课', x + dayW / 2, ry + D.rowH / 2 + 4);
        }
      }
      ctx.textAlign = 'left';
    }

    // 页脚
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9aa7b8';
    ctx.font = `400 12px ${FONT}`;
    ctx.fillText(model.foot, W / 2, H - PAD + 14);
    ctx.textAlign = 'left';

    return cv;
  }

  function download(cv) {
    const st = A().state;
    const safe = (st.title || '我的课程表').replace(/[\\/:*?"<>|\s]+/g, '_');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const name = `${safe}_${stamp}.png`;
    const done = url => {
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }, 4000);
    };
    if (cv.toBlob) cv.toBlob(b => done(URL.createObjectURL(b)), 'image/png');
    else done(cv.toDataURL('image/png'));
  }

  function exportPng() {
    const app = A();
    if (!Object.keys(app.state.picked).length) {
      app.toast('请先到「我的课程表」里选择课程');
      return;
    }
    app.toast('正在生成课表图片…');
    try {
      const cv = draw(buildModel());
      download(cv);
      setTimeout(() => app.toast('图片已导出，请查看浏览器的下载目录'), 500);
    } catch (err) {
      console.error(err);
      app.toast('导出失败：' + err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('#exportPng');
    if (btn) btn.onclick = exportPng;
  });

  window.ScheduleExport = { exportPng, buildModel, draw };
})();
