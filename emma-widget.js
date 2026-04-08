(function (global) {
  'use strict';

  const EMMA_WIDGET_VERSION = '0.3.5';

  // ── Already loaded guard ──
  if (global.EmmaChat) return;

  // ── Default config ──
  const DEFAULTS = {
    webhookUrl: '',
    webhookRoute: 'general',
    // Optional request hardening / sessioning
    // webhookHeaders: extra headers added to the fetch() call (e.g. { "X-Emma-Secret": "..." })
    webhookHeaders: {},
    // Si défini, envoyé aussi dans le JSON (champ emmaSecret) — nécessaire pour le trigger Chat n8n qui n’expose pas toujours les headers HTTP dans $json.
    sharedSecret: null,
    // sessionId: custom session id string. If omitted, the widget will generate one and persist it in localStorage.
    sessionId: null,
    // sessionScope:
    // - "browser" (default): one session per browser (persisted in localStorage)
    // - "tab": one session per tab (persisted in sessionStorage)
    // - "conversation": new session each time the widget is started (not persisted)
    sessionScope: 'browser',
    sessionStorageKey: 'emma_chat_session_id',
    // requestTimeoutMs: max wait for the whole request (headers + streaming body). 0 = disabled.
    requestTimeoutMs: 90000,
    timeoutMessage: 'Délai dépassé. Veuillez réessayer dans un instant.',
    // Message si le serveur répond avec un code HTTP d’erreur (null = texte par défaut avec status).
    httpErrorMessage: null,
    agentName: 'Emma',
    agentStatus: 'En ligne',
    logoUrl: 'https://i.postimg.cc/NGSs02yS/des.png',
    welcomeText: 'Bonjour ! Comment puis-je vous aider ?',
    inputPlaceholder: 'Ecrivez votre question...',
    buttonText: 'Poser une question',
    responseTimeText: 'Nous traitons rapidement vos préoccupations.',
    // Texte affiché à côté des points pendant l’attente de la réponse (stream).
    typingLabel: 'En train d\'écrire…',
    suggestions: [],
    position: 'right',       // 'right' | 'left'
    primaryColor: '#3B5BDB',
    launcherSize: 62,
    widgetWidth: 380,
    widgetHeight: 580,
    autoOpen: false,
    onOpen: null,
    onClose: null,
    onMessage: null,
    // onError: (info) => {} — info: { kind, version, status?, message?, name? }
    onError: null,
  };

  /** Échappement HTML (contenu texte / nœuds). */
  function escapeHtmlStr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Échappement attribut HTML (placeholder, src, alt, etc.). */
  function escapeAttrStr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Couleur CSS : uniquement hex ou rgb/rgba (évite injection dans les styles). */
  function sanitizePrimaryColor(raw) {
    const s = String(raw || '').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*[\d.]+\s*)?\)$/i.test(s)) return s;
    return DEFAULTS.primaryColor;
  }

  /** URL d’image / logo : http(s) ou chemin relatif sûr (pas //…). */
  function sanitizeImageUrl(raw, fallback) {
    const u = String(raw || '').trim();
    if (!u) return fallback;
    if (/^https:\/\//i.test(u) || /^http:\/\//i.test(u)) return u;
    if (u.startsWith('/') && !u.startsWith('//')) return u;
    try {
      const p = new URL(u, typeof document !== 'undefined' ? document.baseURI : 'https://invalid/');
      if (p.protocol === 'https:' || p.protocol === 'http:') return p.href;
    } catch (_) {}
    return fallback;
  }

  function clampNum(n, min, max, fallback) {
    const v = Number(n);
    if (Number.isNaN(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  }

  function safeGetLocalStorage() {
    try {
      return global.localStorage || null;
    } catch {
      return null;
    }
  }

  function safeGetSessionStorage() {
    try {
      return global.sessionStorage || null;
    } catch {
      return null;
    }
  }

  function createSessionId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch {}
    // Fallback: timestamp + random
    return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function resolveSessionId(cfg, opts) {
    if (cfg.sessionId && String(cfg.sessionId).trim()) return String(cfg.sessionId).trim();
    const scope = (cfg.sessionScope || 'browser').toLowerCase();

    // conversation scope: always new (unless explicitly overridden by cfg.sessionId)
    if (scope === 'conversation' || (opts && opts.forceNew)) return createSessionId();

    const storage = scope === 'tab' ? safeGetSessionStorage() : safeGetLocalStorage();
    if (!storage) return createSessionId();

    const existing = storage.getItem(cfg.sessionStorageKey);
    if (existing && existing.trim()) return existing.trim();

    const fresh = createSessionId();
    storage.setItem(cfg.sessionStorageKey, fresh);
    return fresh;
  }

  // ── CSS injection ──
  function injectStyles(primaryColor, position, launcherSize) {
    const pc = sanitizePrimaryColor(primaryColor);
    const right = position === 'left' ? 'auto' : '28px';
    const left  = position === 'left' ? '28px' : 'auto';

    const css = `
      #emma-launcher {
        position:fixed; bottom:28px; right:${right}; left:${left};
        width:${launcherSize}px; height:${launcherSize}px;
        border-radius:50%; background:${pc}; border:none;
        cursor:pointer; display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 24px rgba(0,0,0,0.22);
        transition:transform .2s ease,box-shadow .2s ease; z-index:2147483646;
        font-family:inherit;
      }
      #emma-launcher:hover { transform:scale(1.07); box-shadow:0 8px 32px rgba(0,0,0,0.3); }
      #emma-launcher.open .emma-icon-chat { display:none; }
      #emma-launcher.open .emma-icon-close { display:block !important; }

      #emma-widget {
        position:fixed; bottom:${launcherSize + 44}px; right:${right}; left:${left};
        background:#fff; border-radius:20px;
        box-shadow:0 8px 48px rgba(0,0,0,0.14),0 2px 8px rgba(0,0,0,0.06);
        display:flex; flex-direction:column; overflow:hidden;
        z-index:2147483645;
        font-family:'Inter',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
        font-feature-settings:'kern' 1,'liga' 1;
        transform:scale(0.94) translateY(18px); opacity:0; pointer-events:none;
        transition:transform .28s cubic-bezier(.34,1.56,.64,1),opacity .22s ease;
      }
      #emma-widget.open { transform:scale(1) translateY(0); opacity:1; pointer-events:all; }

      .emma-header {
        background:#fff; padding:16px 18px 14px;
        display:flex; align-items:center; justify-content:space-between;
        border-bottom:1px solid #EDEEF2; flex-shrink:0;
      }
      .emma-brand { display:flex; align-items:center; gap:12px; }
      .emma-avatar-wrap { position:relative; }
      .emma-avatar {
        width:44px; height:44px; border-radius:50%;
        background:#D0D8F8; display:flex; align-items:center; justify-content:center;
        overflow:hidden;
      }
      .emma-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
      .emma-online {
        position:absolute; bottom:2px; right:2px;
        width:10px; height:10px; background:#22c55e;
        border-radius:50%; border:2px solid #fff;
      }
      .emma-agent-name { font-size:15px; font-weight:600; color:#1a1a2e; line-height:1.2; }
      .emma-agent-status { font-size:12px; color:#22c55e; font-weight:400; margin-top:1px; }
      .emma-close-btn {
        width:32px; height:32px; border-radius:50%;
        background:#F5F5F7; border:none; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        transition:background .15s;
      }
      .emma-close-btn:hover { background:#EDEEF2; }

      .emma-welcome {
        flex:1; display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        padding:40px 28px 32px; text-align:center; gap:24px;
        background:#EEF0F5;
      }
      .emma-welcome-text { font-size:22px; font-weight:600; color:#1a1a2e; line-height:1.35; }
      .emma-start-btn {
        background:${pc}; color:#fff; border:none;
        border-radius:24px; padding:14px 32px;
        font-size:15px; font-weight:500; font-family:inherit;
        cursor:pointer; display:flex; align-items:center; gap:9px;
        width:100%; justify-content:center;
        box-shadow:0 4px 16px rgba(0,0,0,0.18);
        transition:opacity .2s,transform .15s;
      }
      .emma-start-btn:hover { opacity:0.9; transform:translateY(-1px); }
      .emma-response-time { font-size:13px; color:#9098A3; margin-top:-10px; }

      .emma-chat { display:none; flex-direction:column; flex:1; overflow:hidden; }
      .emma-chat.active { display:flex; }

      .emma-messages {
        flex:1; overflow-y:auto; padding:22px 14px 24px;
        display:flex; flex-direction:column; gap:20px;
        scroll-behavior:smooth; background:#EEF0F5;
      }
      .emma-messages::-webkit-scrollbar { width:4px; }
      .emma-messages::-webkit-scrollbar-thumb { background:#D0D8F8; border-radius:4px; }

      .emma-bot-row { display:flex; align-items:flex-end; gap:9px; }
      .emma-bot-avatar {
        width:30px; height:30px; border-radius:50%;
        background:#D0D8F8; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
      }
      .emma-bot-block {
        display:flex; flex-direction:column; gap:6px;
        flex:1; min-width:0; max-width:calc(100% - 40px);
      }
      .emma-bot-name-label { font-size:11px; color:#9098A3; padding-left:4px; letter-spacing:0.02em; }
      .emma-msg-bot {
        background:#fff; border-radius:20px 20px 20px 6px;
        padding:16px 18px 17px; font-size:15px; color:#1f2937;
        line-height:1.72; letter-spacing:0;
        max-width:100%; width:fit-content; box-sizing:border-box;
        box-shadow:0 1px 3px rgba(0,0,0,0.05), 0 4px 20px rgba(0,0,0,0.04);
        animation:emmaMsgIn .2s ease;
        word-wrap:break-word; overflow-wrap:break-word;
      }
      .emma-msg-content { display:block; }
      .emma-msg-content .emma-msg-p {
        margin:0 0 0.85em; line-height:1.72;
      }
      .emma-msg-content .emma-msg-p:last-child { margin-bottom:0; }
      .emma-msg-content .emma-msg-p + .emma-msg-p { margin-top:0.35em; }
      .emma-msg-lead {
        display:block; font-weight:600; font-size:16px; line-height:1.45;
        color:#111827; margin:0 0 0.55em;
      }
      .emma-msg-sep {
        border:none; height:1px; margin:1.05em 0;
        background:linear-gradient(90deg, transparent 0%, #dfe3ea 12%, #dfe3ea 88%, transparent 100%);
      }
      .emma-user-row { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
      .emma-user-label { font-size:11px; color:#9098A3; padding-right:2px; }
      .emma-msg-user {
        background:${pc}; border-radius:20px 20px 6px 20px;
        padding:14px 18px; font-size:15px; color:#fff;
        line-height:1.72; max-width:min(100%, 300px); box-sizing:border-box;
        word-wrap:break-word;
        animation:emmaMsgIn .2s ease;
      }
      @keyframes emmaMsgIn {
        from { opacity:0; transform:translateY(6px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .emma-thinking {
        padding:0 !important; background:transparent !important; box-shadow:none !important;
        max-width:100%;
      }
      .emma-thinking-pill {
        display:inline-flex; align-items:center; gap:10px;
        padding:10px 14px 10px 12px; border-radius:18px;
        background:linear-gradient(110deg,#EEF0F5 0%,#f7f8fb 40%,#E8EBF2 80%,#EEF0F5 100%);
        background-size:220% 100%;
        animation:emmaShimmer 2.2s ease-in-out infinite;
        box-shadow:0 1px 4px rgba(0,0,0,0.06);
      }
      @keyframes emmaShimmer {
        0%,100% { background-position:0% 50%; }
        50% { background-position:100% 50%; }
      }
      .emma-thinking-dots { display:flex; gap:4px; align-items:center; }
      .emma-dot {
        width:6px; height:6px; border-radius:50%;
        background:${pc}; opacity:0.45;
        animation:emmaBounce 1.05s ease-in-out infinite;
      }
      .emma-dot:nth-child(2) { animation-delay:.15s; }
      .emma-dot:nth-child(3) { animation-delay:.3s; }
      @keyframes emmaBounce {
        0%,100% { transform:translateY(0); opacity:0.35; }
        30% { transform:translateY(-4px); opacity:1; }
        60% { transform:translateY(0); opacity:0.55; }
      }
      .emma-thinking-label {
        font-size:12.5px; font-weight:500; color:#6b7280; letter-spacing:0.01em;
        white-space:nowrap;
      }
      .emma-streaming { animation:emmaMsgIn .22s ease; }

      .emma-chips { display:flex; flex-wrap:wrap; gap:8px; padding-left:39px; }
      .emma-chip {
        background:#fff; border-radius:20px; padding:8px 14px;
        font-size:13px; color:#1a1a2e; font-family:inherit;
        cursor:pointer; border:none;
        box-shadow:0 1px 4px rgba(0,0,0,0.07);
        transition:box-shadow .15s,transform .12s; white-space:nowrap;
      }
      .emma-chip:hover { box-shadow:0 2px 10px rgba(0,0,0,0.12); transform:translateY(-1px); }
      .emma-chip:disabled { opacity:0.55; cursor:not-allowed; transform:none; }
      .emma-chip:disabled:hover { box-shadow:0 1px 4px rgba(0,0,0,0.07); transform:none; }

      .emma-input-area {
        padding:12px 14px 14px; border-top:1px solid #EDEEF2;
        display:flex; align-items:center; gap:10px;
        background:#fff; flex-shrink:0;
      }
      .emma-input-area input {
        flex:1; border:none; outline:none;
        font-size:15px; font-family:inherit;
        color:#1a1a2e; background:transparent; padding:4px 0;
      }
      .emma-input-area input::placeholder { color:#B8BCC8; }
      .emma-action-btn {
        width:34px; height:34px; border-radius:50%; border:none;
        cursor:pointer; display:flex; align-items:center; justify-content:center;
        transition:transform .15s,opacity .15s; flex-shrink:0;
      }
      .emma-action-btn:hover { transform:scale(1.08); }
      .emma-btn-attach { background:#F5F5F7; color:#888; }
      .emma-btn-send {
        background:${pc}; color:#fff;
        box-shadow:0 2px 10px rgba(0,0,0,0.2);
        position:relative;
      }
      .emma-btn-send:hover:not(:disabled) { opacity:0.88; }
      .emma-btn-send.emma-send-loading svg { visibility:hidden; }
      .emma-btn-send.emma-send-loading::after {
        content:''; position:absolute; width:15px; height:15px;
        border:2px solid rgba(255,255,255,0.35); border-top-color:#fff;
        border-radius:50%; animation:emmaSpin 0.65s linear infinite;
      }
      @keyframes emmaSpin { to { transform:rotate(360deg); } }
    `;

    const style = document.createElement('style');
    style.id = 'emma-widget-styles';
    style.textContent = css;
    document.head.appendChild(style);

    // Inter : lisibilité forte pour le chat (UI / longues réponses)
    if (!document.querySelector('link[data-emma-font="1"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
      link.setAttribute('data-emma-font', '1');
      document.head.appendChild(link);
    }
  }

  // ── Build HTML ──
  function buildWidget(cfg) {
    let sessionId = resolveSessionId(cfg);
    let isSending = false;

    function emitError(payload) {
      if (typeof cfg.onError !== 'function') return;
      try {
        cfg.onError(Object.assign({ version: EMMA_WIDGET_VERSION }, payload));
      } catch (_) {}
    }

    function extractReplyFromJson(data) {
      if (!data || typeof data !== 'object') return '';
      const str = (v) => (typeof v === 'string' ? v : '');
      // Erreurs n8n / chat : { type: "error", content: "…" }
      if (String(data.type || '').toLowerCase() === 'error' && str(data.content)) return data.content;
      let out = str(data.output) || str(data.text) || '';
      if (!out && data.message != null) {
        if (typeof data.message === 'string') out = data.message;
        else if (typeof data.message === 'object' && typeof data.message.content === 'string') {
          out = data.message.content;
        }
      }
      if (!out) out = str(data.content);
      return out;
    }

    function tryParseJsonReply(raw) {
      try {
        return extractReplyFromJson(JSON.parse(raw));
      } catch {
        return '';
      }
    }

    /** Extrait un morceau de texte depuis une ligne/chunk JSON (n8n, NDJSON, SSE, OpenAI-like). */
    function extractStreamDelta(parsed) {
      if (!parsed || typeof parsed !== 'object') return '';
      const t = String(parsed.type || '').toLowerCase();
      // Streaming n8n (AI Agent) : begin/end = cadres d’exécution + metadata uniquement — pas de texte à afficher
      if (t === 'begin' || t === 'end') return '';
      if (t === 'item' && typeof parsed.content === 'string') return parsed.content;
      if (typeof parsed.content === 'string') return parsed.content;
      const fromFields = extractReplyFromJson(parsed);
      if (fromFields) return fromFields;
      if (parsed.delta) {
        if (typeof parsed.delta.content === 'string') return parsed.delta.content;
        if (typeof parsed.delta.text === 'string') return parsed.delta.text;
      }
      if (parsed.message && typeof parsed.message.content === 'string') return parsed.message.content;
      return '';
    }

    function normalizeStreamLine(line) {
      let s = String(line).trim();
      if (!s) return '';
      if (s.startsWith('data:')) s = s.slice(5).trim();
      if (s === '[DONE]') return '';
      return s;
    }

    /** Concatène le texte utile depuis un corps NDJSON / lignes SSE (n8n chat stream mal typé en application/json). */
    function accumulateNdjsonText(raw) {
      if (!raw || !String(raw).trim()) return '';
      let acc = '';
      String(raw).split(/\r?\n/).forEach((line) => {
        const norm = normalizeStreamLine(line);
        if (!norm) return;
        try {
          acc += extractStreamDelta(JSON.parse(norm));
        } catch (_) {}
      });
      return acc;
    }

    // Launcher
    const launcher = document.createElement('button');
    launcher.id = 'emma-launcher';
    launcher.innerHTML = `
      <svg class="emma-icon-chat" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="emma-icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" style="display:none;">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;

    // Widget container
    const widget = document.createElement('div');
    widget.id = 'emma-widget';
    widget.style.width = cfg.widgetWidth + 'px';
    widget.style.height = cfg.widgetHeight + 'px';

    widget.innerHTML = `
      <!-- Header -->
      <div class="emma-header">
        <div class="emma-brand">
          <div class="emma-avatar-wrap">
            <div class="emma-avatar">
              <img src="${escapeAttrStr(cfg.logoUrl)}" alt="${escapeAttrStr(cfg.agentName)}" onerror="this.style.display='none'">
            </div>
            <div class="emma-online"></div>
          </div>
          <div>
            <div class="emma-agent-name">${escapeHtmlStr(cfg.agentName)}</div>
            <div class="emma-agent-status">${escapeHtmlStr(cfg.agentStatus)}</div>
          </div>
        </div>
        <button class="emma-close-btn" id="emma-close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2.2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Welcome -->
      <div class="emma-welcome" id="emma-welcome">
        <div class="emma-welcome-text">${escapeHtmlStr(cfg.welcomeText)}</div>
        <button class="emma-start-btn" id="emma-start">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          ${escapeHtmlStr(cfg.buttonText)}
        </button>
        <span class="emma-response-time">${escapeHtmlStr(cfg.responseTimeText)}</span>
      </div>

      <!-- Chat -->
      <div class="emma-chat" id="emma-chat">
        <div class="emma-messages" id="emma-messages">
          <div id="emma-chips-wrap"></div>
        </div>
        <div class="emma-input-area">
          <input type="text" id="emma-input" placeholder="${escapeAttrStr(cfg.inputPlaceholder)}">
          <label class="emma-action-btn emma-btn-attach" style="cursor:pointer;" title="Image">
            <input type="file" accept="image/*" style="display:none;" id="emma-file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </label>
          <button class="emma-action-btn emma-btn-send" id="emma-send">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(widget);

    // ── Event listeners ──
    const botAvatarSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cfg.primaryColor}" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

    launcher.addEventListener('click', () => toggle());
    widget.querySelector('#emma-close').addEventListener('click', () => close());
    widget.querySelector('#emma-start').addEventListener('click', () => startChat());
    widget.querySelector('#emma-send').addEventListener('click', () => sendMessage());
    widget.querySelector('#emma-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
    widget.querySelector('#emma-file').addEventListener('change', handleImage);

    const elMessages = widget.querySelector('#emma-messages');

    function toggle() {
      const isOpen = widget.classList.contains('open');
      isOpen ? close() : open();
    }
    function open() {
      widget.classList.add('open');
      launcher.classList.add('open');
      if (typeof cfg.onOpen === 'function') cfg.onOpen();
    }
    function close() {
      widget.classList.remove('open');
      launcher.classList.remove('open');
      if (typeof cfg.onClose === 'function') cfg.onClose();
    }
    function startChat() {
      if (String(cfg.sessionScope || '').toLowerCase() === 'conversation') {
        sessionId = resolveSessionId(cfg, { forceNew: true });
      }
      widget.querySelector('#emma-welcome').style.display = 'none';
      widget.querySelector('#emma-chat').classList.add('active');
      renderChips();
      widget.querySelector('#emma-input').focus();
    }
    function renderChips() {
      const wrap = widget.querySelector('#emma-chips-wrap');
      if (!cfg.suggestions.length) return;
      const container = document.createElement('div');
      container.className = 'emma-chips';
      container.id = 'emma-chips';
      cfg.suggestions.forEach(text => {
        const btn = document.createElement('button');
        btn.className = 'emma-chip';
        btn.textContent = text;
        btn.onclick = () => sendText(text);
        container.appendChild(btn);
      });
      wrap.appendChild(container);
    }
    function setSendingUI(busy) {
      const input = widget.querySelector('#emma-input');
      const sendBtn = widget.querySelector('#emma-send');
      input.disabled = busy;
      sendBtn.disabled = busy;
      sendBtn.classList.toggle('emma-send-loading', busy);
      sendBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
      // Les chips sont masquées dès l’envoi : pas de désactivation (évite l’effet « boutons grisés »).
    }

    function sendMessage() {
      if (isSending) return;
      const input = widget.querySelector('#emma-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendText(text);
    }
    async function sendText(text) {
      if (isSending) return;
      isSending = true;
      const chips = widget.querySelector('#emma-chips');
      if (chips) chips.style.display = 'none';
      setSendingUI(true);
      addUserMessage(text);
      if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'user', text });
      const thinkingEl = addThinking();
      /** Déclaré hors du try pour pouvoir annuler le rAF dans le catch (stream). */
      let pendingStreamRaf = null;

      const controller = new AbortController();
      let timeoutId = null;
      const timeoutMs = Number(cfg.requestTimeoutMs);
      if (timeoutMs > 0 && !Number.isNaN(timeoutMs)) {
        timeoutId = global.setTimeout(() => controller.abort(), timeoutMs);
      }

      try {
        const extraHeaders =
          cfg.webhookHeaders && typeof cfg.webhookHeaders === 'object' && !Array.isArray(cfg.webhookHeaders)
            ? cfg.webhookHeaders
            : {};
        const fromHeader = extraHeaders['X-Emma-Secret'] || extraHeaders['x-emma-secret'];
        const fromCfg = cfg.sharedSecret && String(cfg.sharedSecret).trim();
        const emmaSecret = (fromCfg || (fromHeader && String(fromHeader).trim()) || '') || null;

        const res = await fetch(cfg.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
          body: JSON.stringify({
            action: 'sendMessage',
            chatInput: text,
            route: cfg.webhookRoute,
            sessionId,
            ...(emmaSecret ? { emmaSecret } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          thinkingEl.remove();
          emitError({ kind: 'http', status: res.status });
          const errMsg =
            cfg.httpErrorMessage ||
            `Service indisponible (${res.status}). Veuillez réessayer plus tard.`;
          addBotMessage(errMsg);
          if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: errMsg });
          return;
        }

        const contentType = res.headers.get('content-type') || '';
        const ct = contentType.toLowerCase();
        const canStreamBody = !!(res.body && typeof res.body.getReader === 'function');
        // Tant qu’un ReadableStream existe, on lit au fil de l’eau (NDJSON / SSE n8n).
        // Éviter application/json + res.text() : ça attend tout le corps → plus d’affichage progressif.
        const preferBufferedJson =
          !canStreamBody &&
          ct.includes('application/json') &&
          !ct.includes('ndjson') &&
          !ct.includes('x-ndjson') &&
          !ct.includes('text/event-stream');

        if (preferBufferedJson) {
          let data;
          let rawText;
          try {
            rawText = await res.text();
            data = JSON.parse(rawText);
          } catch (err) {
            thinkingEl.remove();
            emitError({ kind: 'parse', message: err && err.message });
            console.error('[EmmaChat] JSON parse failed. Content-Type:', contentType, 'Body length:', rawText && rawText.length);
            const fromNdjson = accumulateNdjsonText(rawText);
            if (fromNdjson) {
              addBotMessage(fromNdjson);
              if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: fromNdjson });
              return;
            }
            const fallback = rawText && rawText.trim();
            if (fallback) {
              addBotMessage(fallback);
              if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: fallback });
            } else {
              const errMsg = 'Réponse invalide du serveur.';
              addBotMessage(errMsg);
              if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: errMsg });
            }
            return;
          }
          thinkingEl.remove();
          let reply = '';
          if (Array.isArray(data)) {
            reply = data.map((item) => extractStreamDelta(item)).join('');
          } else {
            reply = extractReplyFromJson(data);
          }
          reply = reply || 'Aucune réponse reçue.';
          addBotMessage(reply);
          if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: reply });
          return;
        }

        if (!res.body) {
          const raw = await res.text();
          thinkingEl.remove();
          const reply = tryParseJsonReply(raw.trim()) || raw.trim() || 'Aucune réponse reçue.';
          addBotMessage(reply);
          if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: reply });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let rawBuf = '';
        let lineBuf = '';
        let streamBubble = null;
        /** Throttle rendu markdown pendant le stream (évite ** bruts tout en limitant le coût regex). */
        let lastStreamPaintMs = 0;
        const STREAM_MARKDOWN_MIN_MS = 60;
        /** Limite mémoire / DoS : corps stream brut (NDJSON) */
        const MAX_STREAM_RAW_CHARS = 4 * 1024 * 1024;
        function ensureStreamBubble() {
          if (streamBubble) return streamBubble;
          const el = thinkingEl.querySelector('.emma-msg-bot');
          el.classList.remove('emma-thinking');
          el.classList.add('emma-streaming');
          el.innerHTML = '';
          streamBubble = el;
          return streamBubble;
        }
        function paintStreamToDom() {
          pendingStreamRaf = null;
          if (!fullText || !thinkingEl.isConnected) return;
          const now = global.Date.now();
          if (now - lastStreamPaintMs < STREAM_MARKDOWN_MIN_MS) {
            pendingStreamRaf = global.requestAnimationFrame(paintStreamToDom);
            return;
          }
          lastStreamPaintMs = now;
          const div = ensureStreamBubble();
          div.innerHTML = formatMessage(fullText);
          scrollBottom();
        }
        function appendStreamDelta(delta) {
          if (!delta) return;
          fullText += delta;
          ensureStreamBubble();
          if (pendingStreamRaf == null) {
            pendingStreamRaf = global.requestAnimationFrame(paintStreamToDom);
          }
        }
        function flushStreamImmediately() {
          if (pendingStreamRaf != null) {
            global.cancelAnimationFrame(pendingStreamRaf);
            pendingStreamRaf = null;
          }
          if (!fullText || !thinkingEl.isConnected) return;
          // Rendu markdown complet une seule fois à la fin du stream.
          ensureStreamBubble().innerHTML = formatMessage(fullText);
          scrollBottom();
        }
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          rawBuf += chunk;
          if (rawBuf.length > MAX_STREAM_RAW_CHARS) {
            try {
              await reader.cancel();
            } catch (_) {}
            break;
          }
          lineBuf += chunk;
          const lines = lineBuf.split(/\r?\n/);
          lineBuf = lines.pop() || '';
          for (let i = 0; i < lines.length; i++) {
            const norm = normalizeStreamLine(lines[i]);
            if (!norm) continue;
            try {
              const parsed = JSON.parse(norm);
              appendStreamDelta(extractStreamDelta(parsed));
            } catch (_) {}
          }
        }
        const tail = normalizeStreamLine(lineBuf);
        if (tail) {
          try {
            appendStreamDelta(extractStreamDelta(JSON.parse(tail)));
          } catch (_) {}
        }
        flushStreamImmediately();
        if (!fullText && rawBuf.trim()) {
          let fallback = tryParseJsonReply(rawBuf.trim());
          if (!fallback) {
            let acc = '';
            rawBuf.split(/\r?\n/).forEach(l => {
              const norm = normalizeStreamLine(l);
              if (!norm) return;
              try {
                acc += extractStreamDelta(JSON.parse(norm));
              } catch (_) {}
            });
            fallback = acc;
          }
          if (fallback) {
            fullText = fallback;
            ensureStreamBubble().innerHTML = formatMessage(fullText);
            scrollBottom();
          }
        }
        if (!fullText) {
          const el = streamBubble || thinkingEl.querySelector('.emma-msg-bot');
          el.classList.remove('emma-thinking');
          el.classList.remove('emma-streaming');
          el.innerHTML = '';
          el.textContent = 'Aucune réponse reçue.';
        }
        if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: fullText });
      } catch (e) {
        if (pendingStreamRaf != null) {
          global.cancelAnimationFrame(pendingStreamRaf);
          pendingStreamRaf = null;
        }
        thinkingEl.remove();
        const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
        if (aborted) {
          emitError({ kind: 'timeout', message: e && e.message, name: e && e.name });
          addBotMessage(cfg.timeoutMessage || 'Délai dépassé. Veuillez réessayer dans un instant.');
        } else {
          emitError({ kind: 'network', message: e && e.message, name: e && e.name });
          addBotMessage('Une erreur est survenue. Veuillez réessayer.');
        }
      } finally {
        if (timeoutId) global.clearTimeout(timeoutId);
        isSending = false;
        setSendingUI(false);
      }
    }
    function addUserMessage(text) {
      const row = document.createElement('div');
      row.className = 'emma-user-row';
      row.innerHTML = `<div class="emma-user-label">Vous</div><div class="emma-msg-user">${escapeHtmlStr(text)}</div>`;
      elMessages.appendChild(row);
      scrollBottom();
    }
    function addBotMessage(text) {
      const el = addBotMessageEl('');
      el.innerHTML = formatMessage(text);
      scrollBottom();
    }
    function addBotMessageEl(text) {
      const row = document.createElement('div');
      row.className = 'emma-bot-row';
      const msgDiv = document.createElement('div');
      msgDiv.className = 'emma-msg-bot';
      if (text) msgDiv.innerHTML = formatMessage(text);
      const block = document.createElement('div');
      block.className = 'emma-bot-block';
      block.innerHTML = `<div class="emma-bot-name-label">${escapeHtmlStr(cfg.agentName)}</div>`;
      block.appendChild(msgDiv);
      row.innerHTML = `<div class="emma-bot-avatar">${botAvatarSVG}</div>`;
      row.appendChild(block);
      elMessages.appendChild(row);
      scrollBottom();
      return msgDiv;
    }
    function addThinking() {
      const row = document.createElement('div');
      row.className = 'emma-bot-row';
      row.innerHTML = `<div class="emma-bot-avatar">${botAvatarSVG}</div>`;
      const block = document.createElement('div');
      block.className = 'emma-bot-block';
      const nameLabel = document.createElement('div');
      nameLabel.className = 'emma-bot-name-label';
      nameLabel.textContent = cfg.agentName;
      const msg = document.createElement('div');
      msg.className = 'emma-msg-bot emma-thinking';
      msg.setAttribute('role', 'status');
      msg.setAttribute('aria-live', 'polite');
      msg.setAttribute('aria-label', cfg.typingLabel || 'En train d\'écrire');
      msg.innerHTML =
        '<div class="emma-thinking-pill">' +
        '<span class="emma-thinking-dots" aria-hidden="true">' +
        '<span class="emma-dot"></span><span class="emma-dot"></span><span class="emma-dot"></span>' +
        '</span><span class="emma-thinking-label"></span></div>';
      msg.querySelector('.emma-thinking-label').textContent = cfg.typingLabel || 'En train d\'écrire…';
      block.appendChild(nameLabel);
      block.appendChild(msg);
      row.appendChild(block);
      elMessages.appendChild(row);
      scrollBottom();
      return row;
    }
    function handleImage(e) {
      const file = e.target.files[0];
      if (!file) return;
      const chips = widget.querySelector('#emma-chips');
      if (chips) chips.style.display = 'none';
      const row = document.createElement('div');
      row.className = 'emma-user-row';
      const label = document.createElement('div');
      label.className = 'emma-user-label';
      label.textContent = 'Vous';
      const img = document.createElement('img');
      img.style.cssText = 'max-width:200px;border-radius:12px;display:block;';
      const objUrl = URL.createObjectURL(file);
      img.src = objUrl;
      img.onload = () => {
        global.setTimeout(() => {
          try {
            URL.revokeObjectURL(objUrl);
          } catch (_) {}
        }, 3000);
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(objUrl);
        } catch (_) {}
      };
      row.appendChild(label);
      row.appendChild(img);
      elMessages.appendChild(row);
      scrollBottom();
      e.target.value = '';
    }
    function scrollBottom() {
      elMessages.scrollTop = elMessages.scrollHeight;
    }
    function formatMessage(text) {
      let t = String(text)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\r\n/g,'\n');
      // Séparateurs type --- / *** / ___ sur leur propre ligne → filet discret (style chat pro)
      t = t.replace(/(?:^|\n)(\s*[-_*]{3,}\s*)(?=\n|$)/g, '\n\n<hr class="emma-msg-sep" />\n\n');
      t = t.replace(/\*\*([\s\S]+?)\*\*/g,'<strong>$1</strong>');
      t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>');
      t = t.replace(/#{1,3}\s+(.+)/g,'<span class="emma-msg-lead">$1</span>');
      function blockToHtml(block) {
        block = block.trim();
        if (!block) return '';
        if (/^<hr class="emma-msg-sep" \/>$/.test(block)) return block;
        const parts = block.split(/<hr class="emma-msg-sep" \/>/);
        return parts
          .map((bit, idx) => {
            bit = bit.trim().replace(/^(<br\s*\/?>)+|(<br\s*\/?>)+$/gi,'');
            if (!bit) return idx ? '<hr class="emma-msg-sep" />' : '';
            const hr = idx ? '<hr class="emma-msg-sep" />' : '';
            return hr + '<p class="emma-msg-p">' + bit.replace(/\n/g,'<br>') + '</p>';
          })
          .join('');
      }
      const html = t.split(/\n\n+/).map(blockToHtml).join('');
      return '<div class="emma-msg-content">' + html + '</div>';
    }
    if (cfg.autoOpen) setTimeout(open, 300);

    // ── Public API ──
    return { open, close, toggle };
  }

  // ── Public EmmaChat API ──
  global.EmmaChat = {
    VERSION: EMMA_WIDGET_VERSION,
    /**
     * Initialize the chat widget
     * @param {object} options - Configuration options
     */
    init: function (options) {
      const cfg = Object.assign({}, DEFAULTS, options);
      cfg.primaryColor = sanitizePrimaryColor(cfg.primaryColor);
      cfg.logoUrl = sanitizeImageUrl(cfg.logoUrl, DEFAULTS.logoUrl);
      cfg.position = String(cfg.position || '').toLowerCase() === 'left' ? 'left' : 'right';
      cfg.launcherSize = clampNum(cfg.launcherSize, 44, 120, DEFAULTS.launcherSize);
      cfg.widgetWidth = clampNum(cfg.widgetWidth, 280, 560, DEFAULTS.widgetWidth);
      cfg.widgetHeight = clampNum(cfg.widgetHeight, 400, 900, DEFAULTS.widgetHeight);
      const tmo = Number(cfg.requestTimeoutMs);
      cfg.requestTimeoutMs = Number.isNaN(tmo) ? DEFAULTS.requestTimeoutMs : Math.min(600000, Math.max(0, tmo));
      injectStyles(cfg.primaryColor, cfg.position, cfg.launcherSize);
      const api = buildWidget(cfg);
      this._api = api;
      return this;
    },
    open:   function () { this._api && this._api.open(); },
    close:  function () { this._api && this._api.close(); },
    toggle: function () { this._api && this._api.toggle(); },
  };

})(window);
