const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');
const http = require('http');
const net = require('net');

// ============================================================
// EXPRESS SERVER
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

// Bot state tracking
let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: []
};

// Manual stop flag — when true, auto-reconnect is disabled
let manualStop = false;
// Last measured ping to MC server (ms)
let lastPingMs = null;

// TCP ping to Minecraft server
function measurePing() {
  const sock = new net.Socket();
  const start = Date.now();
  sock.setTimeout(4000);
  sock.connect(config.server.port, config.server.ip, () => {
    lastPingMs = Date.now() - start;
    sock.destroy();
  });
  sock.on('error', () => { lastPingMs = null; sock.destroy(); });
  sock.on('timeout', () => { lastPingMs = null; sock.destroy(); });
}
// Measure ping every 10 seconds
measurePing();
setInterval(measurePing, 10000);

// ── CONTROL PANEL ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${config.name} — Control Panel</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:       #080e1a;
      --surface:  #0f1e2e;
      --card:     #152031;
      --border:   #1e3348;
      --teal:     #2dd4bf;
      --teal-dim: #134e4a;
      --green:    #4ade80;
      --red:      #f87171;
      --yellow:   #fbbf24;
      --gray:     #64748b;
      --text:     #e2e8f0;
      --muted:    #94a3b8;
    }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 24px 16px 40px;
    }
    /* ── Header ── */
    header {
      display: flex; align-items: center; gap: 12px;
      max-width: 820px; margin: 0 auto 28px;
    }
    .logo { font-size: 28px; }
    header h1 { font-size: 22px; font-weight: 700; color: var(--teal); }
    header p  { font-size: 13px; color: var(--muted); margin-top: 2px; }
    #header-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--gray); margin-left: auto;
      box-shadow: 0 0 8px var(--gray);
      transition: background .4s, box-shadow .4s;
      flex-shrink: 0;
    }

    /* ── Grid ── */
    .grid {
      max-width: 820px; margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 22px;
    }
    .card.full { grid-column: 1 / -1; }
    .card-title {
      font-size: 11px; font-weight: 600; letter-spacing: 1.2px;
      text-transform: uppercase; color: var(--muted); margin-bottom: 14px;
    }

    /* ── Status badge ── */
    #status-badge {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 20px; font-weight: 700;
    }
    .dot {
      width: 11px; height: 11px; border-radius: 50%;
      flex-shrink: 0;
    }
    .dot.pulse { animation: pulse 1.8s ease-in-out infinite; }
    @keyframes pulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50%      { opacity: .5; transform: scale(1.25); }
    }

    /* ── Stat rows ── */
    .stat-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { color: var(--muted); }
    .stat-val   { font-weight: 600; color: var(--teal); }

    /* ── Network bar ── */
    .bar-wrap {
      background: var(--border); border-radius: 999px;
      height: 8px; overflow: hidden; margin-top: 6px;
    }
    .bar-fill {
      height: 100%; border-radius: 999px;
      transition: width .6s ease, background .6s;
    }

    /* ── Buttons ── */
    .btn-row { display: flex; gap: 12px; margin-top: 18px; }
    .btn {
      flex: 1; padding: 14px;
      border: none; border-radius: 10px;
      font-size: 15px; font-weight: 700; cursor: pointer;
      transition: opacity .2s, transform .15s;
      letter-spacing: .5px;
    }
    .btn:active { transform: scale(.97); }
    .btn:disabled { opacity: .35; cursor: not-allowed; }
    .btn-start { background: var(--green); color: #071a0e; }
    .btn-stop  { background: var(--red);   color: #1a0707; }

    /* ── Log ── */
    #log-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      max-height: 160px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.7;
    }
    #log-box .entry { display: flex; gap: 8px; }
    #log-box .time  { color: var(--teal-dim); flex-shrink: 0; }
    #log-box .err   { color: var(--red); }
    #log-box .ok    { color: var(--green); }

    /* ── Toast ── */
    #toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #1e293b; border: 1px solid var(--teal);
      color: var(--teal); padding: 10px 22px; border-radius: 8px;
      font-size: 14px; font-weight: 600;
      opacity: 0; pointer-events: none;
      transition: opacity .3s;
    }
    #toast.show { opacity: 1; }
  </style>
</head>
<body>

<header>
  <span class="logo">🤖</span>
  <div>
    <h1>${config.name}</h1>
    <p>${config.server.ip}:${config.server.port} &nbsp;·&nbsp; MC ${config.server.version}</p>
  </div>
  <div id="header-dot"></div>
</header>

<div class="grid">

  <!-- Status + Controls -->
  <div class="card full">
    <div class="card-title">Bot Status</div>
    <div id="status-badge">
      <span class="dot pulse" id="status-dot" style="background:var(--gray);box-shadow:0 0 8px var(--gray)"></span>
      <span id="status-text">Loading…</span>
    </div>
    <div class="btn-row">
      <button class="btn btn-start" id="btn-start" onclick="control('start')">▶ Start Bot</button>
      <button class="btn btn-stop"  id="btn-stop"  onclick="control('stop')">■ Stop Bot</button>
    </div>
  </div>

  <!-- Uptime & Coords -->
  <div class="card">
    <div class="card-title">Session</div>
    <div class="stat-row"><span class="stat-label">Uptime</span>      <span class="stat-val" id="uptime">—</span></div>
    <div class="stat-row"><span class="stat-label">Coordinates</span> <span class="stat-val" id="coords">—</span></div>
    <div class="stat-row"><span class="stat-label">Reconnects</span>  <span class="stat-val" id="reconnects">—</span></div>
  </div>

  <!-- Network -->
  <div class="card">
    <div class="card-title">Network</div>
    <div class="stat-row"><span class="stat-label">Ping to Server</span> <span class="stat-val" id="ping">—</span></div>
    <div class="stat-row"><span class="stat-label">Quality</span>        <span class="stat-val" id="quality">—</span></div>
    <div class="stat-row"><span class="stat-label">Memory (heap)</span>  <span class="stat-val" id="memory">—</span></div>
    <div class="bar-wrap"><div class="bar-fill" id="ping-bar" style="width:0%;background:var(--green)"></div></div>
  </div>

  <!-- Log -->
  <div class="card full">
    <div class="card-title">Recent Events</div>
    <div id="log-box"><div class="entry"><span class="time">--:--:--</span><span>Waiting for data…</span></div></div>
  </div>

</div>

<div id="toast"></div>

<script>
  const fmt = s => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
    return h+'h '+m+'m '+ss+'s';
  };
  const fmtTime = () => new Date().toTimeString().slice(0,8);

  const logEntries = [];
  function addLog(msg, cls='') {
    logEntries.unshift({ time: fmtTime(), msg, cls });
    if (logEntries.length > 30) logEntries.pop();
    renderLog();
  }
  function renderLog() {
    const box = document.getElementById('log-box');
    box.innerHTML = logEntries.map(e =>
      '<div class="entry"><span class="time">'+e.time+'</span><span class="'+e.cls+'">'+e.msg+'</span></div>'
    ).join('');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  let lastStatus = null;

  async function poll() {
    try {
      const r = await fetch('/health');
      const d = await r.json();

      const dot    = document.getElementById('status-dot');
      const txt    = document.getElementById('status-text');
      const hdr    = document.getElementById('header-dot');
      const startB = document.getElementById('btn-start');
      const stopB  = document.getElementById('btn-stop');

      let color, label;
      if (d.manualStop) {
        color = 'var(--gray)'; label = 'Stopped (manual)';
        startB.disabled = false; stopB.disabled = true;
      } else if (d.status === 'connected') {
        color = 'var(--green)'; label = '🟢 Online & Running';
        startB.disabled = true; stopB.disabled = false;
      } else {
        color = 'var(--yellow)'; label = '🟡 Reconnecting…';
        startB.disabled = true; stopB.disabled = false;
      }

      dot.style.background  = color;
      dot.style.boxShadow   = '0 0 10px '+color;
      hdr.style.background  = color;
      hdr.style.boxShadow   = '0 0 8px '+color;
      txt.textContent = label;

      if (lastStatus !== null && lastStatus !== d.status) {
        addLog(d.status === 'connected' ? 'Bot connected to server' : 'Bot disconnected', d.status === 'connected' ? 'ok' : 'err');
      }
      lastStatus = d.status;

      document.getElementById('uptime').textContent     = fmt(d.uptime);
      document.getElementById('reconnects').textContent = d.reconnectAttempts;
      document.getElementById('memory').textContent     = d.memoryMB.toFixed(1)+' MB';

      if (d.coords) {
        document.getElementById('coords').textContent =
          Math.floor(d.coords.x)+', '+Math.floor(d.coords.y)+', '+Math.floor(d.coords.z);
      } else {
        document.getElementById('coords').textContent = 'Not in-game';
      }

      // Network ping
      const pingEl = document.getElementById('ping');
      const qualEl = document.getElementById('quality');
      const bar    = document.getElementById('ping-bar');
      if (d.pingMs !== null) {
        pingEl.textContent = d.pingMs+'ms';
        let q, qcolor, pct;
        if      (d.pingMs < 80)  { q='Excellent'; qcolor='var(--green)';  pct=100; }
        else if (d.pingMs < 150) { q='Good';      qcolor='var(--teal)';   pct=75;  }
        else if (d.pingMs < 300) { q='Fair';      qcolor='var(--yellow)'; pct=45;  }
        else                     { q='Poor';      qcolor='var(--red)';    pct=20;  }
        qualEl.textContent     = q;
        qualEl.style.color     = qcolor;
        bar.style.width        = pct+'%';
        bar.style.background   = qcolor;
      } else {
        pingEl.textContent = 'Unreachable';
        qualEl.textContent = 'Offline';
        qualEl.style.color = 'var(--red)';
        bar.style.width = '5%'; bar.style.background = 'var(--red)';
      }
    } catch(e) {
      document.getElementById('status-text').textContent = '⚠ Server Offline';
    }
  }

  async function control(action) {
    const startB = document.getElementById('btn-start');
    const stopB  = document.getElementById('btn-stop');
    startB.disabled = true; stopB.disabled = true;
    try {
      const r = await fetch('/control/'+action, { method:'POST' });
      const d = await r.json();
      showToast(d.message || action+' sent');
      addLog('Manual '+action+' triggered', action==='start'?'ok':'err');
    } catch(e) { showToast('Request failed'); }
    setTimeout(poll, 600);
  }

  setInterval(poll, 1500);
  poll();
  addLog('Control panel loaded', 'ok');
</script>
</body>
</html>`);
});

// ── API: Start / Stop ──────────────────────────────────────
app.post('/control/start', (req, res) => {
  if (!manualStop && botState.connected) {
    return res.json({ ok: false, message: 'Bot is already running.' });
  }
  manualStop = false;
  botState.reconnectAttempts = 0;
  console.log('[Control] Manual START triggered');
  // Small delay so the response goes out first
  setTimeout(() => createBot(), 300);
  res.json({ ok: true, message: 'Bot starting…' });
});

app.post('/control/stop', (req, res) => {
  manualStop = true;
  console.log('[Control] Manual STOP triggered');
  if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
  isReconnecting = false;
  if (bot) {
    clearAllIntervals();
    try { bot.removeAllListeners(); bot.end('Manual stop'); } catch(e) {}
    bot = null;
  }
  botState.connected = false;
  res.json({ ok: true, message: 'Bot stopped.' });
});

// ── Health JSON ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: botState.connected ? 'connected' : 'disconnected',
    manualStop,
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: (bot && bot.entity) ? bot.entity.position : null,
    lastActivity: botState.lastActivity,
    reconnectAttempts: botState.reconnectAttempts,
    memoryMB: process.memoryUsage().heapUsed / 1024 / 1024,
    pingMs: lastPingMs
  });
});

app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP server started on port ${PORT}`);
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// ============================================================
// SELF-PING - Prevent Render from sleeping
// ============================================================
const SELF_PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

const https = require('https');

function startSelfPing() {
  setInterval(() => {
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(`${url}/ping`, (res) => {
      // console.log(`[KeepAlive] Self-ping: ${res.statusCode}`); // Optional: reduce spam
    }).on('error', (err) => {
      console.log(`[KeepAlive] Self-ping failed: ${err.message}`);
    });
  }, SELF_PING_INTERVAL);
  console.log('[KeepAlive] Self-ping system started (every 10 min)');
}

startSelfPing();

// ============================================================
// MEMORY MONITORING
// ============================================================
setInterval(() => {
  const mem = process.memoryUsage();
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
  console.log(`[Memory] Heap: ${heapMB} MB`);
}, 5 * 60 * 1000); // Every 5 minutes

// ============================================================
// BOT CREATION WITH RECONNECTION LOGIC
// ============================================================
let bot = null;
let activeIntervals = [];
let reconnectTimeout = null;
let isReconnecting = false;

function clearAllIntervals() {
  console.log(`[Cleanup] Clearing ${activeIntervals.length} intervals`);
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals = [];
}

function addInterval(callback, delay) {
  const id = setInterval(callback, delay);
  activeIntervals.push(id);
  return id;
}

function getReconnectDelay() {
  // Aggressive reconnection: fast, flat delay or very subtle backoff
  const baseDelay = config.utils['auto-reconnect-delay'] || 2000;
  const maxDelay = config.utils['max-reconnect-delay'] || 15000;

  // Use a much gentler backoff or just a flat delay if user wants "lower"
  // Current logic: attempts * 1000 + base, capped at max
  const delay = Math.min(baseDelay + (botState.reconnectAttempts * 1000), maxDelay);

  return delay;
}

function createBot() {
  if (manualStop) {
    console.log('[Bot] Manual stop active — skipping createBot.');
    return;
  }
  if (isReconnecting) {
    console.log('[Bot] Already reconnecting, skipping...');
    return;
  }

  // Cleanup previous bot
  if (bot) {
    clearAllIntervals();
    try {
      bot.removeAllListeners();
      bot.end();
    } catch (e) {
      console.log('[Cleanup] Error ending previous bot:', e.message);
    }
    bot = null;
  }

  console.log(`[Bot] Creating bot instance...`);
  console.log(`[Bot] Connecting to ${config.server.ip}:${config.server.port}`);

  try {
    bot = mineflayer.createBot({
      username: config['bot-account'].username,
      password: config['bot-account'].password || undefined,
      auth: config['bot-account'].type,
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version,
      hideErrors: false,
      checkTimeoutInterval: 120000 // 2 minutes - detects dead connections without false-positive disconnects
    });

    bot.loadPlugin(pathfinder);

    // Connection timeout - if no spawn in 3 minutes, reconnect (Aternos queues can be slow)
    const connectionTimeout = setTimeout(() => {
      if (!botState.connected) {
        console.log('[Bot] Connection timeout - no spawn received');
        scheduleReconnect();
      }
    }, 3 * 60 * 1000);

    bot.once('spawn', () => {
      clearTimeout(connectionTimeout);
      botState.connected = true;
      botState.lastActivity = Date.now();
      botState.reconnectAttempts = 0;
      isReconnecting = false;

      console.log(`[Bot] [+] Successfully spawned on server!`);
      if (config.discord && config.discord.events.connect) {
        sendDiscordWebhook(`[+] **Connected** to \`${config.server.ip}\``, 0x4ade80); // Green
      }

      const mcData = require('minecraft-data')(config.server.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.allowFreeMotion = false;
      defaultMove.canDig = false;
      defaultMove.liquidCost = 1000;
      defaultMove.fallDamageCost = 1000;

      // Start all modules
      initializeModules(bot, mcData, defaultMove);

      // Setup enhanced Leave/Rejoin logic
      setupLeaveRejoin(bot, createBot);

      setTimeout(() => {
        if (bot && botState.connected) {
          bot.chat('/gamerule sendCommandFeedback false');
        }
      }, 3000);

      // Attempt creative mode (only works if bot has OP)
      setTimeout(() => {
        if (bot && botState.connected) {
          bot.chat('/gamemode creative');
          console.log('[INFO] Attempted to set creative mode (requires OP)');
        }
      }, 3000);

      bot.on('messagestr', (message) => {
        if (
          message.includes('commands.gamemode.success.self') ||
          message.includes('Set own game mode to Creative Mode')
        ) {
          console.log('[INFO] Bot is now in Creative Mode.');
           
          bot.chat('/gamerule sendCommandFeedback false');
          
        }
      });
    });

    

    // Handle disconnection
    bot.on('end', (reason) => {
      const wasSpawned = botState.connected;
      console.log(`[Bot] Disconnected: ${reason || 'Unknown reason'}`);
      botState.connected = false;
      clearAllIntervals();

      if (config.discord && config.discord.events.disconnect && reason !== 'Periodic Rejoin') {
        sendDiscordWebhook(`[-] **Disconnected**: ${reason || 'Unknown'}`, 0xf87171); // Red
      }

      if (config.utils['auto-reconnect']) {
        scheduleReconnect();
      }
    });

    bot.on('kicked', (reason) => {
      const wasSpawned = botState.connected;
      console.log(`[Bot] Kicked: ${reason}`);
      botState.connected = false;
      botState.errors.push({ type: 'kicked', reason, time: Date.now() });
      clearAllIntervals();

      if (config.discord && config.discord.events.disconnect) {
        sendDiscordWebhook(`[!] **Kicked**: ${reason}`, 0xff0000); // Bright Red
      }

      if (config.utils['auto-reconnect']) {
        // If throttled by server, wait 30s before retrying to avoid ban
        const isThrottled = typeof reason === 'string' && reason.toLowerCase().includes('throttl');
        scheduleReconnect(isThrottled ? 30000 : null);
      }
    });

    bot.on('error', (err) => {
      console.log(`[Bot] Error: ${err.message}`);
      botState.errors.push({ type: 'error', message: err.message, time: Date.now() });
      // Don't immediately reconnect on error - let 'end' event handle it
    });

  } catch (err) {
    console.log(`[Bot] Failed to create bot: ${err.message}`);
    scheduleReconnect();
  }
}

function scheduleReconnect(overrideDelay = null) {
  if (manualStop) {
    console.log('[Bot] Manual stop active — skipping reconnect.');
    return;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  if (isReconnecting) {
    return;
  }

  isReconnecting = true;
  botState.reconnectAttempts++;

  const delay = overrideDelay !== null ? overrideDelay : getReconnectDelay();
  console.log(`[Bot] Reconnecting in ${delay / 1000}s (attempt #${botState.reconnectAttempts})`);

  reconnectTimeout = setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, delay);
}

// ============================================================
// MODULE INITIALIZATION
// ============================================================
function initializeModules(bot, mcData, defaultMove) {
  console.log('[Modules] Initializing all modules...');

  // ---------- AUTO AUTH ----------
  if (config.utils['auto-auth'].enabled) {
    const password = config.utils['auto-auth'].password;
    setTimeout(() => {
      bot.chat(`/register ${password} ${password}`);
      bot.chat(`/login ${password}`);
      console.log('[Auth] Sent login commands');
    }, 1000);
  }

  // ---------- CHAT MESSAGES ----------
  if (config.utils['chat-messages'].enabled) {
    const messages = config.utils['chat-messages'].messages;
    if (config.utils['chat-messages'].repeat) {
      let i = 0;
      addInterval(() => {
        if (bot && botState.connected) {
          bot.chat(messages[i]);
          botState.lastActivity = Date.now();
          i = (i + 1) % messages.length;
        }
      }, config.utils['chat-messages']['repeat-delay'] * 1000);
    } else {
      messages.forEach((msg, idx) => {
        setTimeout(() => bot.chat(msg), idx * 1000);
      });
    }
  }

  // ---------- MOVE TO POSITION ----------
  if (config.position.enabled) {
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
  }

  // ---------- ANTI-AFK (Simple) ----------
  if (config.utils['anti-afk'].enabled) {
    addInterval(() => {
      if (bot && botState.connected) {
        bot.setControlState('jump', true);
        setTimeout(() => {
          if (bot) bot.setControlState('jump', false);
        }, 100);
        botState.lastActivity = Date.now();
      }
    }, 3000); // Jump every 30 seconds

    if (config.utils['anti-afk'].sneak) {
      bot.setControlState('sneak', true);
    }
  }

  // ---------- MOVEMENT MODULES ----------
  if (config.movement['circle-walk'].enabled) {
    startCircleWalk(bot, defaultMove);
  }
  if (config.movement['random-jump'].enabled) {
    startRandomJump(bot);
  }
  if (config.movement['look-around'].enabled) {
    startLookAround(bot);
  }

  // ---------- CUSTOM MODULES ----------
  if (config.modules.avoidMobs) avoidMobs(bot);
  if (config.modules.combat) combatModule(bot, mcData);
  if (config.modules.beds) bedModule(bot, mcData);
  if (config.modules.chat) chatModule(bot);

  // Periodic Rejoin
  if (config.utils['periodic-rejoin'] && config.utils['periodic-rejoin'].enabled) {
    periodicRejoin(bot);
  }

  console.log('[Modules] All modules initialized!');
}

// Periodic Rejoin Module
const setupLeaveRejoin = require('./leaveRejoin');

// Periodic Rejoin Module - Handled by leaveRejoin.js now
function periodicRejoin(bot) {
  // Deprecated in favor of leaveRejoin.js
  console.log('[Rejoin] Using new leaveRejoin system.');
}

// ============================================================
// MOVEMENT HELPERS
// ============================================================
function startCircleWalk(bot, defaultMove) {
  const radius = config.movement['circle-walk'].radius;
  let angle = 0;
  let lastPathTime = 0;

  addInterval(() => {
    if (!bot || !botState.connected) return;

    // Rate limit pathfinding
    const now = Date.now();
    if (now - lastPathTime < 2000) return;
    lastPathTime = now;

    try {
      const x = bot.entity.position.x + Math.cos(angle) * radius;
      const z = bot.entity.position.z + Math.sin(angle) * radius;
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(Math.floor(x), Math.floor(bot.entity.position.y), Math.floor(z)));
      angle += Math.PI / 4;
      botState.lastActivity = Date.now();
    } catch (e) {
      console.log('[CircleWalk] Error:', e.message);
    }
  }, config.movement['circle-walk'].speed);
}

function startRandomJump(bot) {
  addInterval(() => {
    if (!bot || !botState.connected) return;
    try {
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot) bot.setControlState('jump', false);
      }, 300);
      botState.lastActivity = Date.now();
    } catch (e) {
      console.log('[RandomJump] Error:', e.message);
    }
  }, config.movement['random-jump'].interval);
}

function startLookAround(bot) {
  addInterval(() => {
    if (!bot || !botState.connected) return;
    try {
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * Math.PI / 4;
      bot.look(yaw, pitch, true);
      botState.lastActivity = Date.now();
    } catch (e) {
      console.log('[LookAround] Error:', e.message);
    }
  }, config.movement['look-around'].interval);
}

// ============================================================
// CUSTOM MODULES
// ============================================================

// Avoid mobs/players
function avoidMobs(bot) {
  const safeDistance = 5;
  addInterval(() => {
    if (!bot || !botState.connected) return;
    try {
      const entities = Object.values(bot.entities).filter(e =>
        e.type === 'mob' || (e.type === 'player' && e.username !== bot.username)
      );
      for (const e of entities) {
        if (!e.position) continue;
        const distance = bot.entity.position.distanceTo(e.position);
        if (distance < safeDistance) {
          bot.setControlState('back', true);
          setTimeout(() => {
            if (bot) bot.setControlState('back', false);
          }, 500);
          break;
        }
      }
    } catch (e) {
      console.log('[AvoidMobs] Error:', e.message);
    }
  }, 2000);
}

// Combat module
function combatModule(bot, mcData) {
  addInterval(() => {
    if (!bot || !botState.connected) return;
    try {
      if (config.combat['attack-mobs']) {
        const mobs = Object.values(bot.entities).filter(e =>
          e.type === 'mob' && e.position &&
          bot.entity.position.distanceTo(e.position) < 4
        );
        if (mobs.length > 0) {
          bot.attack(mobs[0]);
        }
      }
    } catch (e) {
      console.log('[Combat] Error:', e.message);
    }
  }, 1500);

  bot.on('health', () => {
    if (!config.combat['auto-eat']) return;
    try {
      if (bot.food < 14) {
        const food = bot.inventory.items().find(i => {
          const itemData = mcData.itemsByName[i.name];
          return itemData && itemData.food;
        });
        if (food) {
          bot.equip(food, 'hand')
            .then(() => bot.consume())
            .catch(e => console.log('[AutoEat] Error:', e.message));
        }
      }
    } catch (e) {
      console.log('[AutoEat] Error:', e.message);
    }
  });
}

// Bed module (FIXED - beds are blocks, not entities)
function bedModule(bot, mcData) {
  addInterval(async () => {
    if (!bot || !botState.connected) return;

    try {
      const isNight = bot.time.timeOfDay >= 12500 && bot.time.timeOfDay <= 23500;

      if (config.beds['place-night'] && isNight && !bot.isSleeping) {
        // Find nearby bed blocks
        const bedBlock = bot.findBlock({
          matching: block => block.name.includes('bed'),
          maxDistance: 8
        });

        if (bedBlock) {
          try {
            await bot.sleep(bedBlock);
            console.log('[Bed] Sleeping...');
          } catch (e) {
            // Can't sleep - maybe not night enough or monsters nearby
          }
        }
      }
    } catch (e) {
      console.log('[Bed] Error:', e.message);
    }
  }, 10000);
}

// Chat module
function chatModule(bot) {
  bot.on('chat', (username, message) => {
    if (!bot || username === bot.username) return;

    try {
      if (config.chat.respond) {
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
          bot.chat(`Hello, ${username}!`);
        }
        if (message.startsWith('!tp ') && config.chat.respond) {
          const target = message.split(' ')[1];
          if (target) bot.chat(`/tp ${target}`);
        }
      }
    } catch (e) {
      console.log('[Chat] Error:', e.message);
    }
  });
}

// ============================================================
// CONSOLE COMMANDS
// ============================================================
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!bot || !botState.connected) {
    console.log('[Console] Bot not connected');
    return;
  }

  const trimmed = line.trim();
  if (trimmed.startsWith('say ')) {
    bot.chat(trimmed.slice(4));
  } else if (trimmed.startsWith('cmd ')) {
    bot.chat('/' + trimmed.slice(4));
  } else if (trimmed === 'status') {
    console.log(`Connected: ${botState.connected}, Uptime: ${formatUptime(Math.floor((Date.now() - botState.startTime) / 1000))}`);
  } else if (trimmed === 'reconnect') {
    console.log('[Console] Manual reconnect requested');
    bot.end();
  } else {
    bot.chat(trimmed);
  }
});

// ============================================================
// DISCORD WEBHOOK INTEGRATION
// ============================================================
function sendDiscordWebhook(content, color = 0x0099ff) {
  if (!config.discord || !config.discord.enabled || !config.discord.webhookUrl || config.discord.webhookUrl.includes('YOUR_DISCORD')) return;

  const protocol = config.discord.webhookUrl.startsWith('https') ? https : http;
  const urlParts = new URL(config.discord.webhookUrl);

  const payload = JSON.stringify({
    username: config.name,
    embeds: [{
      description: content,
      color: color,
      timestamp: new Date().toISOString(),
      footer: { text: 'Slobos AFK Bot' }
    }]
  });

  const options = {
    hostname: urlParts.hostname,
    port: 443,
    path: urlParts.pathname + urlParts.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };

  const req = protocol.request(options, (res) => {
    // console.log(`[Discord] Sent webhook: ${res.statusCode}`);
  });

  req.on('error', (e) => {
    console.log(`[Discord] Error sending webhook: ${e.message}`);
  });

  req.write(payload);
  req.end();
}

// ============================================================
// CRASH RECOVERY - IMMORTAL MODE
// ============================================================
process.on('uncaughtException', (err) => {
  console.log(`[FATAL] Uncaught Exception: ${err.message}`);
  // console.log(err.stack); // Optional: keep logs cleaner
  botState.errors.push({ type: 'uncaught', message: err.message, time: Date.now() });

  // CRITICAL: DO NOT EXIT.
  // The user wants the server to stay up "all the time no matter what".
  // We just clear intervals and try to restart the bot logic.
  if (config.utils['auto-reconnect']) {
    clearAllIntervals();
    // Wrap in a tiny timeout to prevent tight loops if the error is synchronous
    setTimeout(() => {
      scheduleReconnect();
    }, 1000);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(`[FATAL] Unhandled Rejection: ${reason}`);
  botState.errors.push({ type: 'rejection', message: String(reason), time: Date.now() });
  // Do not exit.
});

// Graceful shutdown from external signals (still allowed to exit if system demands it)
process.on('SIGTERM', () => {
  console.log('[System] SIGTERM received. Ignoring to stay alive? (Render might force kill)');
  // If we mistakenly exit here, the web server dies. 
  // User asked for "all the time on no matter what".
  // Note: Render will SIGKILL if we don't exit, but this keeps us up as long as possible.
  process.exit(0);
});

process.on('SIGINT', () => {
  // Local Ctrl+C
  console.log('[System] Manual stop requested. Exiting...');
  process.exit(0);
});

// ============================================================
// START THE BOT
// ============================================================
console.log('='.repeat(50));
console.log('  Minecraft AFK Bot v2.3 - Bug Fix Edition');
console.log('='.repeat(50));
console.log(`Server: ${config.server.ip}:${config.server.port}`);
console.log(`Version: ${config.server.version}`);
console.log(`Auto-Reconnect: ${config.utils['auto-reconnect'] ? 'Enabled' : 'Disabled'}`);
console.log('='.repeat(50));

createBot();
