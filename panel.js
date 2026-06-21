// ═══════════════════════════════════════════════════════════════
//  On Render — Gauge + KPIs + Tendência, com download em PNG
//  SEM dependência externa — Canvas puro
//  Datasource: Zabbix | field[0]=Time | field[1]=Value
// ═══════════════════════════════════════════════════════════════

const THRESHOLD = 55;
const PANEL_BG  = '#0d1117';

// ── 1. Extrai dados ───────────────────────────────────────────
function extractSeries() {
  if (!data || !data.series || !data.series.length) return null;
  const s = data.series[0];
  if (!s || !s.fields || s.fields.length < 2) return null;

  const tf = s.fields[0];
  const vf = s.fields[1];

  const tv = typeof tf.values.toArray === 'function' ? tf.values.toArray() : Array.from(tf.values);
  const vv = typeof vf.values.toArray === 'function' ? vf.values.toArray() : Array.from(vf.values);

  const labels = [], values = [];
  for (let i = 0; i < tv.length; i++) {
    const val = parseFloat(vv[i]);
    if (isNaN(val)) continue;
    const d = new Date(tv[i]);
    labels.push(
      d.getHours().toString().padStart(2,'0') + ':' +
      d.getMinutes().toString().padStart(2,'0') + ':' +
      d.getSeconds().toString().padStart(2,'0')
    );
    values.push(val);
  }
  return { labels, values, name: s.name || 'Value' };
}

// ── 2. Status (cor + rótulo) a partir do valor ─────────────────
function statusFor(value) {
  if (value > THRESHOLD)        return { cls: 'b-crit', label: 'Crítico', color: '#f87171' };
  if (value > THRESHOLD * 0.85) return { cls: 'b-warn', label: 'Atenção', color: '#facc15' };
  return                              { cls: 'b-ok',   label: 'Normal',  color: '#4ade80' };
}

// ── 3. Atualiza header, gauge e KPIs ────────────────────────────
function updateMeta(values, name, labels) {
  const last = values[values.length - 1];
  const avg  = values.reduce((a,b) => a+b, 0) / values.length;
  const mx   = Math.max(...values);
  const mn   = Math.min(...values);
  const fmt  = v => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1));

  htmlNode.getElementById('kCur').textContent = fmt(last);
  htmlNode.getElementById('kAvg').textContent = fmt(avg);
  htmlNode.getElementById('kMax').textContent = fmt(mx);
  htmlNode.getElementById('kMin').textContent = fmt(mn);
  htmlNode.getElementById('thrLbl').textContent    = THRESHOLD;
  htmlNode.getElementById('metricLbl').textContent = name;
  htmlNode.getElementById('pTitle').textContent    = 'SD-WAN Latência';
  htmlNode.getElementById('pSub').textContent      =
    'FIREWALL-FORTINET · ' + labels[0] + ' – ' + labels[labels.length - 1];
  htmlNode.getElementById('upd').textContent =
    'atualizado ' + new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

  const st = statusFor(last);
  const badge = htmlNode.getElementById('badge');
  badge.className   = 'badge ' + st.cls;
  badge.textContent = st.label;

  // gauge (anel SVG)
  const r    = 40, circ = 2 * Math.PI * r;
  const frac = Math.min(last / THRESHOLD, 1);
  const arc  = htmlNode.getElementById('gaugeArc');
  arc.setAttribute('stroke-dasharray', (frac * circ).toFixed(1) + ' ' + circ.toFixed(1));
  arc.setAttribute('stroke', st.color);
  htmlNode.getElementById('gaugeVal').textContent = fmt(last);
  htmlNode.getElementById('gaugeThr').textContent = 'limiar ' + THRESHOLD + 'ms';
}

// ── 4. Onda — desenha numa região (x0,y0,w,h) de QUALQUER canvas ─
//      Usada tanto no canvas ao vivo quanto na exportação PNG.
function drawWave(ctx, x0, y0, w, h, labels, values) {
  const PAD = { top: 18, right: 40, bottom: 24, left: 38 };
  const cW  = w - PAD.left - PAD.right;
  const cH  = h - PAD.top  - PAD.bottom;

  const mn = 0;
  const mx = Math.max(Math.ceil(Math.max(...values) * 1.4 / 10) * 10, THRESHOLD * 1.6, 10);

  const xPos = i => x0 + PAD.left + (i / (values.length - 1)) * cW;
  const yPos = v => y0 + PAD.top  + cH - ((v - mn) / (mx - mn)) * cH;

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth   = 0.5;
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const yv = mn + (mx - mn) * (i / steps);
    const y  = yPos(yv);
    ctx.beginPath();
    ctx.moveTo(x0 + PAD.left, y);
    ctx.lineTo(x0 + PAD.left + cW, y);
    ctx.stroke();
    ctx.fillStyle = '#2a3344';
    ctx.font      = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(yv) + 'ms', x0 + PAD.left - 6, y + 3);
  }

  // eixo X
  ctx.fillStyle = '#2a3344';
  ctx.font      = '9px Inter, sans-serif';
  ctx.textAlign = 'center';
  const xStep = Math.max(1, Math.floor(labels.length / 8));
  for (let i = 0; i < labels.length; i += xStep) {
    ctx.fillText(labels[i], xPos(i), y0 + h - PAD.bottom + 12);
  }

  // linha de limiar
  const ty = yPos(THRESHOLD);
  ctx.save();
  ctx.strokeStyle = 'rgba(248,113,113,0.28)';
  ctx.lineWidth   = 0.9;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(x0 + PAD.left, ty);
  ctx.lineTo(x0 + PAD.left + cW, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(248,113,113,0.5)';
  ctx.font      = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(THRESHOLD + 'ms', x0 + PAD.left + cW + PAD.right - 2, ty - 4);
  ctx.restore();

  // curva suave (Catmull-Rom → bezier)
  function catmullToBezier(pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      segs.push({ cp1x, cp1y, cp2x, cp2y, x: p2.x, y: p2.y });
    }
    return segs;
  }

  const pts  = values.map((v, i) => ({ x: xPos(i), y: yPos(v) }));
  const segs = catmullToBezier(pts);

  function drawLine() {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    segs.forEach(s => ctx.bezierCurveTo(s.cp1x, s.cp1y, s.cp2x, s.cp2y, s.x, s.y));
  }

  const grad = ctx.createLinearGradient(0, y0 + PAD.top, 0, y0 + PAD.top + cH);
  grad.addColorStop(0,    'rgba(220,80,40,0.55)');
  grad.addColorStop(0.40, 'rgba(200,70,30,0.32)');
  grad.addColorStop(0.75, 'rgba(170,55,20,0.14)');
  grad.addColorStop(1,    'rgba(140,45,15,0.03)');

  drawLine();
  ctx.lineTo(pts[pts.length - 1].x, y0 + PAD.top + cH);
  ctx.lineTo(pts[0].x, y0 + PAD.top + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  const clipY = yPos(THRESHOLD);
  if (clipY > y0 + PAD.top) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + PAD.left, y0 + PAD.top, cW, clipY - (y0 + PAD.top));
    ctx.clip();
    drawLine();
    ctx.lineTo(pts[pts.length - 1].x, clipY);
    ctx.lineTo(pts[0].x, clipY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240,60,40,0.18)';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(249,115,22,0.55)';
  ctx.shadowBlur  = 12;
  drawLine();
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.stroke();
  ctx.restore();

  values.forEach((v, i) => {
    if (v <= THRESHOLD) return;
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(v), 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#f87171';
    ctx.shadowColor = 'rgba(248,113,113,0.5)';
    ctx.shadowBlur  = 6;
    ctx.fill();
    ctx.shadowBlur  = 0;
  });

  return { pts, xPos, yPos };
}

// ── 5. Canvas ao vivo (o que aparece no painel) ─────────────────
function drawCanvas(canvas, labels, values) {
  const W = canvas.offsetWidth  || canvas.parentElement.offsetWidth  || 380;
  const H = canvas.offsetHeight || canvas.parentElement.offsetHeight || 190;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const r = drawWave(ctx, 0, 0, W, H, labels, values);
  canvas._chartData = { ...r, values, labels, W, H };
}

// ── 6. Tooltip on mousemove ──────────────────────────────────────
function attachTooltip(canvas) {
  if (canvas._tooltipAttached) return;
  canvas._tooltipAttached = true;

  const tip = document.createElement('div');
  tip.style.cssText = [
    'position:absolute','background:#0d1117','border:1px solid rgba(255,255,255,0.08)',
    'border-radius:6px','padding:6px 10px','font-size:11px','color:#e2e8f0',
    'pointer-events:none','display:none','z-index:999','white-space:nowrap',
    'font-family:Inter,sans-serif'
  ].join(';');
  canvas.parentElement.style.position = 'relative';
  canvas.parentElement.appendChild(tip);

  canvas.addEventListener('mousemove', e => {
    const d = canvas._chartData;
    if (!d) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;

    let best = 0, bestDist = Infinity;
    d.pts.forEach((p, i) => {
      const dist = Math.abs(p.x - mx);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });

    const v    = d.values[best];
    const lab  = d.labels[best];
    const col  = v > THRESHOLD ? '#f87171' : '#f97316';
    const warn = v > THRESHOLD ? ' — acima do limiar' : '';

    tip.innerHTML =
      `<span style="color:#7a8499">${lab}</span><br>` +
      `<span style="color:${col};font-weight:500">${v.toFixed(1)}ms${warn}</span>`;

    const tx = Math.min(d.pts[best].x + 10, d.W - 140);
    const ty = Math.max(d.pts[best].y - 40, 4);
    tip.style.left    = tx + 'px';
    tip.style.top     = ty + 'px';
    tip.style.display = 'block';
  });

  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// ── 7. Gauge desenhado em canvas (usado só na exportação) ────────
function drawGaugeArc(ctx, cx, cy, r, frac, color, valueLabel) {
  ctx.save();
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = r * 0.225;
  ctx.stroke();

  const start = -Math.PI / 2;
  const end   = start + frac * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = color;
  ctx.lineWidth   = r * 0.225;
  ctx.stroke();

  ctx.fillStyle    = '#e2e8f0';
  ctx.font         = '600 ' + Math.round(r * 0.55) + 'px Inter, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(valueLabel, cx, cy + r * 0.05);

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ── 8. Exporta o card inteiro (gauge + KPIs + gráfico) em PNG ────
function exportPanelPNG() {
  const root = htmlNode.getElementById('panelRoot');
  if (!root) return;

  const dpr      = window.devicePixelRatio || 1;
  const rootRect = root.getBoundingClientRect();
  const W = Math.round(rootRect.width);
  const H = Math.round(rootRect.height);

  const out = document.createElement('canvas');
  out.width  = W * dpr;
  out.height = H * dpr;
  const ctx = out.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, 0, W, H);

  const rel = el => {
    const r = el.getBoundingClientRect();
    return { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height };
  };

  // header
  const hRect = rel(htmlNode.getElementById('headerRow'));
  ctx.textAlign = 'left';
  ctx.fillStyle  = '#c9d1e0';
  ctx.font       = '500 13px Inter, sans-serif';
  ctx.fillText(htmlNode.getElementById('pTitle').textContent, hRect.x, hRect.y + 13);
  ctx.fillStyle = '#3d4a5c';
  ctx.font      = '10px Inter, sans-serif';
  ctx.fillText(htmlNode.getElementById('pSub').textContent, hRect.x, hRect.y + 28);

  // gauge
  const gRect = rel(htmlNode.getElementById('gaugeCard'));
  ctx.fillStyle   = 'rgba(255,255,255,0.025)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 0.5;
  roundRect(ctx, gRect.x, gRect.y, gRect.w, gRect.h, 7);
  ctx.fill(); ctx.stroke();

  const lastVal = parseFloat(htmlNode.getElementById('gaugeVal').textContent) || 0;
  const st      = statusFor(lastVal);
  const ringR   = gRect.h * 0.4;
  const ringCx  = gRect.x + 12 + ringR;
  const ringCy  = gRect.y + gRect.h / 2;
  drawGaugeArc(ctx, ringCx, ringCy, ringR, Math.min(lastVal / THRESHOLD, 1), st.color,
    htmlNode.getElementById('gaugeVal').textContent);

  const metaX = ringCx + ringR + 14;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3d4a5c';
  ctx.font      = '9px Inter, sans-serif';
  ctx.fillText(htmlNode.getElementById('gaugeThr').textContent, metaX, ringCy - 6);
  ctx.fillStyle = st.color;
  ctx.font      = '600 9px Inter, sans-serif';
  ctx.fillText(st.label.toUpperCase(), metaX, ringCy + 12);

  // kpis
  const kRect = rel(htmlNode.getElementById('kpiGrid'));
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  roundRect(ctx, kRect.x, kRect.y, kRect.w, kRect.h, 7);
  ctx.fill(); ctx.stroke();

  const kpis = [
    ['Atual',  htmlNode.getElementById('kCur').textContent],
    ['Média',  htmlNode.getElementById('kAvg').textContent],
    ['Máximo', htmlNode.getElementById('kMax').textContent],
    ['Mínimo', htmlNode.getElementById('kMin').textContent],
  ];
  const cellW = kRect.w / 2, cellH = kRect.h / 2;
  kpis.forEach(([lbl, val], i) => {
    const cx = kRect.x + (i % 2) * cellW + 12;
    const cy = kRect.y + Math.floor(i / 2) * cellH + cellH / 2;
    ctx.fillStyle = '#3d4a5c';
    ctx.font      = '7px Inter, sans-serif';
    ctx.fillText(lbl.toUpperCase(), cx, cy - 6);
    ctx.fillStyle = '#e2e8f0';
    ctx.font      = '500 13px Inter, sans-serif';
    ctx.fillText(val + 'ms', cx, cy + 9);
  });

  // gráfico (reaproveita o mesmo drawWave do canvas ao vivo)
  const cRect = rel(htmlNode.getElementById('chartWrap'));
  const live  = htmlNode.getElementById('mainChart')._chartData;
  if (live) drawWave(ctx, cRect.x, cRect.y, cRect.w, cRect.h, live.labels, live.values);

  // footer
  const fRect = rel(htmlNode.getElementById('footerRow'));
  ctx.fillStyle = '#f97316';
  ctx.fillRect(fRect.x, fRect.y + fRect.h / 2 - 1, 18, 2.5);
  ctx.fillStyle = '#3d4a5c';
  ctx.font      = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(htmlNode.getElementById('metricLbl').textContent, fRect.x + 24, fRect.y + fRect.h / 2 + 3);
  ctx.textAlign = 'right';
  ctx.fillText(htmlNode.getElementById('upd').textContent, fRect.x + fRect.w - 26, fRect.y + fRect.h / 2 + 3);

  // dispara o download (PNG via data URL, sem dependências)
  //
  // IMPORTANTE: a.click() dispara um evento de clique que faz "bubbling"
  // até o document. Como o Grafana intercepta cliques em <a> no document
  // para fazer navegação interna (client-side routing), esse bubbling
  // acaba caindo na tela "Page not found". Por isso disparamos o clique
  // manualmente com bubbles:false, para o evento nunca sair do próprio <a>.
  const url = out.toDataURL('image/png');
  const a   = document.createElement('a');
  a.href     = url;
  a.download = 'sdwan-latencia-' + Date.now() + '.png';
  a.style.display = 'none';
  document.body.appendChild(a);

  const clickEvt = new MouseEvent('click', { bubbles: false, cancelable: true });
  a.dispatchEvent(clickEvt);

  document.body.removeChild(a);
}

// ── Main ──────────────────────────────────────────────────────
const series = extractSeries();
const nodata = htmlNode.getElementById('nodata');
const canvas = htmlNode.getElementById('mainChart');

if (!series || !series.values.length) {
  nodata.classList.add('show');
  htmlNode.getElementById('badge').className  = 'badge b-nd';
  htmlNode.getElementById('badge').textContent = 'sem dados';
  htmlNode.getElementById('pSub').textContent  = 'verifique o item no Zabbix';
} else {
  nodata.classList.remove('show');
  updateMeta(series.values, series.name, series.labels);

  function tryDraw(attempts) {
    const W = canvas.offsetWidth || canvas.parentElement.offsetWidth;
    const H = canvas.offsetHeight || canvas.parentElement.offsetHeight;
    if (W > 0 && H > 0) {
      drawCanvas(canvas, series.labels, series.values);
      attachTooltip(canvas);
    } else if (attempts > 0) {
      setTimeout(() => tryDraw(attempts - 1), 80);
    }
  }
  tryDraw(10);
}

// botão de download (sempre habilitado, mesmo sem dados ainda)
const dlBtn = htmlNode.getElementById('dlBtn');
if (dlBtn && !dlBtn._wired) {
  dlBtn._wired = true;
  dlBtn.addEventListener('click', exportPanelPNG);
}
