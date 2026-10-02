'use strict';

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 5000;
const HISTORY_REFRESH_MS = 60000;

let currentHours = 3;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('am-theme', theme);
}

$('theme-toggle').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});
setTheme(localStorage.getItem('am-theme') || 'dark');

const fmtGB = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)} GB`);
const fmtPct = (v) => (v === null || v === undefined ? null : Number(v).toFixed(0));

function setBar(el, pct) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  el.style.width = `${v}%`;
  el.classList.toggle('high', v >= 85);
}

function setText(id, text) {
  $(id).textContent = text;
}

function na(section) {
  return !section || section.available === false;
}

function renderStatus(s) {
  const ok = s && s.lastCollectAt;
  $('health-dot').className = `brand-dot ${ok ? 'ok' : 'err'}`;
  $('mock-badge').hidden = !s.mock;
  setText('last-update', ok ? `atualizado ${new Date(s.lastCollectAt).toLocaleTimeString()}` : 'sem dados');

  const sys = s.system;
  if (na(sys)) {
    setText('device-model', 'Dispositivo');
    setText('device-details', sys && sys.reason ? sys.reason : 'indisponível');
  } else {
    setText('device-model', `${sys.manufacturer ? sys.manufacturer + ' ' : ''}${sys.model}`);
    const parts = [];
    if (sys.androidVersion) parts.push(`Android ${sys.androidVersion}`);
    if (sys.kernelVersion) parts.push(`kernel ${sys.kernelVersion}`);
    parts.push(`Node ${sys.nodeVersion}`);
    if (sys.isTermux) parts.push('Termux');
    setText('device-details', parts.join(' · '));
    setText('device-uptime', sys.uptime || '—');
    setText('device-cores', sys.cpuCores ?? '—');
  }

  const net = s.network;
  setText('device-ip', na(net) ? '—' : net.ip);
  setText('device-iface', na(net) ? '—' : net.interface);

  const cpu = s.cpu;
  const cpuPct = na(cpu) ? null : (cpu.usagePercent ?? cpu.usageEstimatePercent ?? null);
  if (cpuPct === null) {
    setText('cpu-value', '—');
    setText('cpu-load', cpu && cpu.loadAverage ? `load ${cpu.loadAverage['1m'].toFixed(2)}` : '');
    const parts = [cpu && cpu.reason ? cpu.reason : 'indisponível'];
    if (cpu && cpu.freqsMHz) parts.push(`freq: ${cpu.freqsMHz.map((f) => `${f}MHz`).join(' · ')}`);
    setText('cpu-detail', parts.join(' · '));
    setBar($('cpu-bar'), 0);
  } else {
    const estimated = cpu.usagePercent === null || cpu.usagePercent === undefined;
    $('cpu-value').innerHTML = `${estimated ? '≈' : ''}${fmtPct(cpuPct)}<small>%</small>`;
    setText('cpu-load', cpu.loadAverage ? `load ${cpu.loadAverage['1m'].toFixed(2)}` : '');
    const d = [];
    if (cpu.usageSource === 'loadavg-estimate') d.push('estimado via load avg (SELinux bloqueia /proc/stat)');
    else if (cpu.usageSource === 'cpuidle-sysfs') d.push('via cpuidle/sysfs (SELinux bloqueia /proc/stat)');
    if (cpu.perCoreUsagePercent && cpu.perCoreUsagePercent.length) {
      d.push(`núcleos: ${cpu.perCoreUsagePercent.map((v) => `${v.toFixed(0)}%`).join(' · ')}`);
    } else if (cpu.freqsMHz) {
      d.push(`freq: ${cpu.freqsMHz.map((f) => `${f}MHz`).join(' · ')}`);
    } else {
      d.push(`${cpu.cores ?? '—'} núcleos`);
    }
    if (cpu.pressure && cpu.pressure.some) d.push(`pressão CPU: ${cpu.pressure.some.avg10}%`);
    setText('cpu-detail', d.join(' · '));
    setBar($('cpu-bar'), cpuPct);
  }

  const mem = s.memory;
  if (na(mem)) {
    setText('ram-value', '—');
    setText('ram-detail', mem && mem.reason ? mem.reason : '');
    setBar($('ram-bar'), 0);
  } else {
    $('ram-value').innerHTML = `${fmtGB(mem.usedGB)} <small>/ ${fmtGB(mem.totalGB)}</small>`;
    setText('ram-swap', `${fmtPct(mem.usagePercent)}%`);
    setText('ram-detail', `livre ${fmtGB(mem.availableGB)} · swap ${fmtGB(mem.swapUsedGB)}${mem.swapTotalGB ? ` / ${fmtGB(mem.swapTotalGB)}` : ''}`);
    setBar($('ram-bar'), mem.usagePercent);
  }

  const sto = s.storage && s.storage.primary;
  if (!sto) {
    setText('sto-value', '—');
    setText('sto-detail', s.storage && s.storage.reason ? s.storage.reason : '');
    setBar($('sto-bar'), 0);
  } else {
    setText('sto-path', sto.path);
    $('sto-value').innerHTML = `${fmtPct(sto.usagePercent)}<small>%</small>`;
    setText('sto-detail', `${fmtGB(sto.usedGB)} / ${fmtGB(sto.totalGB)} · livre ${fmtGB(sto.availableGB)}`);
    setBar($('sto-bar'), sto.usagePercent);
  }

  const bat = s.battery;
  if (na(bat)) {
    setText('bat-value', '—');
    setText('bat-status', '');
    setText('bat-detail', bat && bat.reason ? bat.reason : 'indisponível');
    setBar($('bat-bar'), 0);
  } else {
    $('bat-value').innerHTML = `${bat.percentage ?? '—'}<small>%</small>`;
    setText('bat-status', bat.charging ? '⚡ carregando' : bat.status || '—');
    const d = [];
    if (bat.temperatureC !== null) d.push(`${bat.temperatureC}°C`);
    if (bat.health) d.push(bat.health);
    if (bat.powerSource) d.push(`via ${bat.powerSource}`);
    setText('bat-detail', d.join(' · ') || '—');
    setBar($('bat-bar'), bat.percentage);
    $('bat-bar').classList.toggle('high', (bat.percentage ?? 100) <= 15);
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function drawChart(svgId, rows, field, color) {
  const svg = $(svgId);
  svg.innerHTML = '';
  const W = 600;
  const H = 140;
  const PAD = 6;

  const pts = rows
    .map((r) => ({ t: r.timestamp, v: r[field] }))
    .filter((p) => p.v !== null && p.v !== undefined);

  if (pts.length < 2) {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', W / 2);
    t.setAttribute('y', H / 2);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', 'currentColor');
    t.setAttribute('opacity', '0.4');
    t.setAttribute('font-size', '12');
    t.textContent = 'coletando dados…';
    svg.appendChild(t);
    return;
  }

  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const span = Math.max(t1 - t0, 1);
  const x = (t) => PAD + ((t - t0) / span) * (W - PAD * 2);
  const y = (v) => H - PAD - (Math.max(0, Math.min(100, v)) / 100) * (H - PAD * 2);

  const gid = `${svgId}-grad`;
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <line x1="${PAD}" y1="${y(50)}" x2="${W - PAD}" y2="${y(50)}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="4 4"/>
  `;

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = document.createElementNS(SVG_NS, 'path');
  area.setAttribute('d', `${line} L${x(t1).toFixed(1)},${H - PAD} L${x(t0).toFixed(1)},${H - PAD} Z`);
  area.setAttribute('fill', `url(#${gid})`);
  svg.appendChild(area);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', line);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);

  const last = pts[pts.length - 1];
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', x(last.t));
  dot.setAttribute('cy', y(last.v));
  dot.setAttribute('r', '3.5');
  dot.setAttribute('fill', color);
  svg.appendChild(dot);

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', W - PAD - 4);
  label.setAttribute('y', 16);
  label.setAttribute('text-anchor', 'end');
  label.setAttribute('fill', color);
  label.setAttribute('font-size', '12');
  label.setAttribute('font-family', 'monospace');
  label.textContent = `${Number(last.v).toFixed(1)}%`;
  svg.appendChild(label);
}

async function refreshStatus() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();
    renderStatus(s);
  } catch (err) {
    $('health-dot').className = 'brand-dot err';
    setText('last-update', 'servidor inacessível');
  }
}

async function refreshHistory() {
  try {
    const res = await fetch(`/api/history?hours=${currentHours}`);
    const h = await res.json();
    if (!h.available) {
      setText('history-note', `histórico indisponível: ${h.reason || 'desconhecido'}`);
      return;
    }
    setText('history-note', `${h.count} pontos nas últimas ${currentHours}h`);
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    drawChart('chart-cpu', h.rows, 'cpu_usage', css('--cpu'));
    drawChart('chart-ram', h.rows, 'ram_percent', css('--ram'));
    drawChart('chart-bat', h.rows, 'battery_percent', css('--bat'));
    drawChart('chart-sto', h.rows, 'storage_percent', css('--sto'));
  } catch (err) {
    setText('history-note', `falha ao buscar histórico: ${err.message}`);
  }
}

document.querySelectorAll('#range-btns button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#range-btns button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentHours = Number(btn.dataset.hours);
    refreshHistory();
  });
});

// ===== Terminal =====

const MAX_TERM_LEN = 200000;
const term = {
  es: null,
  id: null,
  token: sessionStorage.getItem('am-term-token') || '',
  history: [],
  histIdx: -1,
  len: 0,
};

function termAppend(text) {
  const pre = $('term-output');
  pre.appendChild(document.createTextNode(text));
  term.len += text.length;
  while (term.len > MAX_TERM_LEN && pre.firstChild) {
    term.len -= pre.firstChild.textContent.length;
    pre.removeChild(pre.firstChild);
  }
  pre.scrollTop = pre.scrollHeight;
}

function termSetConnected(on) {
  $('term-output').hidden = !on;
  $('term-form').hidden = !on;
  $('term-ctrlc').disabled = !on;
  $('term-clear').disabled = !on;
  $('term-toggle').textContent = on ? 'desconectar' : 'conectar';
  $('term-toggle').classList.toggle('primary', !on);
  $('term-state').textContent = on ? `sessão ${term.id ? term.id.slice(0, 6) : ''}` : 'desconectado';
  if (on) $('term-input').focus();
}

async function termApi(path, opts = {}, retried = false) {
  opts.headers = Object.assign({}, opts.headers, { 'Content-Type': 'application/json' });
  if (term.token) opts.headers['x-terminal-token'] = term.token;
  const res = await fetch(path, opts);
  if (res.status === 401 && !retried) {
    const t = prompt('Token do terminal (TERMINAL_TOKEN):');
    if (!t) throw new Error('token necessário');
    term.token = t;
    sessionStorage.setItem('am-term-token', t);
    return termApi(path, opts, true);
  }
  return res;
}

async function termConnect() {
  if (term.id) return termDisconnect();
  try {
    const res = await termApi('/api/terminal/start', { method: 'POST', body: '{}' });
    if (res.status === 403) {
      termAppend('terminal desativado no servidor (TERMINAL_ENABLED=0)\n');
      $('term-output').hidden = false;
      return;
    }
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    const j = await res.json();
    term.id = j.sessionId;

    const qs = term.token ? `?token=${encodeURIComponent(term.token)}` : '';
    term.es = new EventSource(`/api/terminal/stream/${term.id}${qs}`);
    term.es.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'output') termAppend(m.data);
      if (m.type === 'exit') {
        termAppend(`\n[shell encerrado, código ${m.code ?? '?'}]\n`);
        termCleanup();
      }
    };
    term.es.onerror = () => {
      termAppend('\n[conexão perdida]\n');
      termCleanup();
    };
    termSetConnected(true);
  } catch (err) {
    termAppend(`\n[erro: ${err.message}]\n`);
    $('term-output').hidden = false;
    termCleanup();
  }
}

function termCleanup() {
  if (term.es) { term.es.close(); term.es = null; }
  term.id = null;
  termSetConnected(false);
}

function termDisconnect() {
  if (term.id) termApi(`/api/terminal/stop/${term.id}`, { method: 'POST', body: '{}' }).catch(() => {});
  termCleanup();
}

$('term-toggle').addEventListener('click', termConnect);
$('term-clear').addEventListener('click', () => { $('term-output').textContent = ''; term.len = 0; });
$('term-ctrlc').addEventListener('click', () => {
  if (term.id) termApi(`/api/terminal/signal/${term.id}`, { method: 'POST', body: JSON.stringify({ signal: 'SIGINT' }) }).catch(() => {});
});

$('term-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('term-input');
  const cmd = input.value;
  input.value = '';
  if (!term.id) return;
  term.history.push(cmd);
  term.histIdx = term.history.length;
  termApi(`/api/terminal/input/${term.id}`, { method: 'POST', body: JSON.stringify({ data: `${cmd}\n` }) })
    .then((res) => { if (res.status === 404) { termAppend('[sessão expirada]\n'); termCleanup(); } })
    .catch((err) => termAppend(`[erro: ${err.message}]\n`));
});

$('term-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (term.histIdx > 0) { term.histIdx--; e.target.value = term.history[term.histIdx]; }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (term.histIdx < term.history.length - 1) { term.histIdx++; e.target.value = term.history[term.histIdx]; }
    else { term.histIdx = term.history.length; e.target.value = ''; }
  }
});

refreshStatus();
refreshHistory();
setInterval(refreshStatus, REFRESH_MS);
setInterval(refreshHistory, HISTORY_REFRESH_MS);
