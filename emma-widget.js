(function (global) {
  'use strict';

  // ── Already loaded guard ──
  if (global.EmmaChat) return;

  // ── Default config ──
  const DEFAULTS = {
    webhookUrl: '',
    webhookRoute: 'general',
    // Optional request hardening / sessioning
    // webhookHeaders: extra headers added to the fetch() call (e.g. { "X-Emma-Secret": "..." })
    webhookHeaders: {},
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
  };

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
    const right = position === 'left' ? 'auto' : '28px';
    const left  = position === 'left' ? '28px' : 'auto';

    const css = `
      #emma-launcher {
        position:fixed; bottom:28px; right:${right}; left:${left};
        width:${launcherSize}px; height:${launcherSize}px;
        border-radius:50%; background:${primaryColor}; border:none;
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
        z-index:2147483645; font-family:'DM Sans',system-ui,sans-serif;
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
        background:${primaryColor}; color:#fff; border:none;
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
        flex:1; overflow-y:auto; padding:20px 16px 10px;
        display:flex; flex-direction:column; gap:18px;
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
      .emma-bot-block { display:flex; flex-direction:column; gap:4px; }
      .emma-bot-name-label { font-size:11px; color:#9098A3; padding-left:2px; }
      .emma-msg-bot {
        background:#fff; border-radius:18px 18px 18px 4px;
        padding:12px 16px; font-size:14px; color:#1a1a2e;
        line-height:1.55; max-width:260px;
        box-shadow:0 1px 4px rgba(0,0,0,0.06);
        animation:emmaMsgIn .2s ease;
      }
      .emma-user-row { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
      .emma-user-label { font-size:11px; color:#9098A3; padding-right:2px; }
      .emma-msg-user {
        background:${primaryColor}; border-radius:18px 18px 4px 18px;
        padding:12px 16px; font-size:14px; color:#fff;
        line-height:1.55; max-width:260px;
        animation:emmaMsgIn .2s ease;
      }
      @keyframes emmaMsgIn {
        from { opacity:0; transform:translateY(6px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .emma-thinking { display:flex; gap:5px; align-items:center; padding:14px 18px !important; }
      .emma-dot {
        width:7px; height:7px; border-radius:50%;
        background:#D0D8F8; animation:emmaBlink 1.2s infinite;
      }
      .emma-dot:nth-child(2) { animation-delay:.2s; }
      .emma-dot:nth-child(3) { animation-delay:.4s; }
      @keyframes emmaBlink { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }

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
        font-size:14px; font-family:inherit;
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
        background:${primaryColor}; color:#fff;
        box-shadow:0 2px 10px rgba(0,0,0,0.2);
      }
      .emma-btn-send:hover { opacity:0.88; }
    `;

    const style = document.createElement('style');
    style.id = 'emma-widget-styles';
    style.textContent = css;
    document.head.appendChild(style);

    // Load DM Sans font
    if (!document.querySelector('link[href*="DM+Sans"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap';
      document.head.appendChild(link);
    }
  }

  // ── Build HTML ──
  function buildWidget(cfg) {
    let sessionId = resolveSessionId(cfg);
    let isSending = false;

    function extractReplyFromJson(data) {
      if (!data || typeof data !== 'object') return '';
      return data.output || data.text || data.message || '';
    }

    function tryParseJsonReply(raw) {
      try {
        return extractReplyFromJson(JSON.parse(raw));
      } catch {
        return '';
      }
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
              <img src="${cfg.logoUrl}" alt="${cfg.agentName}" onerror="this.style.display='none'">
            </div>
            <div class="emma-online"></div>
          </div>
          <div>
            <div class="emma-agent-name">${cfg.agentName}</div>
            <div class="emma-agent-status">${cfg.agentStatus}</div>
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
        <div class="emma-welcome-text">${cfg.welcomeText}</div>
        <button class="emma-start-btn" id="emma-start">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          ${cfg.buttonText}
        </button>
        <span class="emma-response-time">${cfg.responseTimeText}</span>
      </div>

      <!-- Chat -->
      <div class="emma-chat" id="emma-chat">
        <div class="emma-messages" id="emma-messages">
          <div id="emma-chips-wrap"></div>
        </div>
        <div class="emma-input-area">
          <input type="text" id="emma-input" placeholder="${cfg.inputPlaceholder}">
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
      sendBtn.style.opacity = busy ? '0.55' : '';
      sendBtn.style.pointerEvents = busy ? 'none' : '';
      widget.querySelectorAll('.emma-chip').forEach(btn => {
        btn.disabled = busy;
      });
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
      setSendingUI(true);

      const chips = widget.querySelector('#emma-chips');
      if (chips) chips.style.display = 'none';
      addUserMessage(text);
      if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'user', text });
      const thinkingEl = addThinking();

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

        const res = await fetch(cfg.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
          body: JSON.stringify({
            action: 'sendMessage',
            chatInput: text,
            route: cfg.webhookRoute,
            sessionId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          thinkingEl.remove();
          const errMsg =
            cfg.httpErrorMessage ||
            `Service indisponible (${res.status}). Veuillez réessayer plus tard.`;
          addBotMessage(errMsg);
          if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: errMsg });
          return;
        }

        const contentType = res.headers.get('content-type') || '';
        const ct = contentType.toLowerCase();
        const preferJson =
          ct.includes('application/json') &&
          !ct.includes('ndjson') &&
          !ct.includes('x-ndjson') &&
          !ct.includes('text/event-stream');

        if (preferJson) {
          const data = await res.json();
          thinkingEl.remove();
          const reply = extractReplyFromJson(data) || 'Aucune réponse reçue.';
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
        thinkingEl.remove();
        const botDiv = addBotMessageEl('');
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          rawBuf += chunk;
          chunk.split('\n').filter(l => l.trim()).forEach(line => {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'item' && parsed.content) {
                fullText += parsed.content;
                botDiv.innerHTML = formatMessage(fullText);
                scrollBottom();
              }
            } catch {}
          });
        }
        if (!fullText && rawBuf.trim()) {
          const fallback = tryParseJsonReply(rawBuf.trim());
          if (fallback) {
            fullText = fallback;
            botDiv.innerHTML = formatMessage(fullText);
            scrollBottom();
          }
        }
        if (!fullText) botDiv.textContent = 'Aucune réponse reçue.';
        if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: fullText });
      } catch (e) {
        thinkingEl.remove();
        const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
        if (aborted) {
          addBotMessage(cfg.timeoutMessage || 'Délai dépassé. Veuillez réessayer dans un instant.');
        } else {
          addBotMessage('Une erreur est survenue. Veuillez réessayer.');
        }
      } finally {
        if (timeoutId) global.clearTimeout(timeoutId);
        isSending = false;
        setSendingUI(false);
      }
    }
    function addUserMessage(text) {
      const area = widget.querySelector('#emma-messages');
      const row = document.createElement('div');
      row.className = 'emma-user-row';
      row.innerHTML = `<div class="emma-user-label">Vous</div><div class="emma-msg-user">${escapeHtml(text)}</div>`;
      area.appendChild(row);
      scrollBottom();
    }
    function addBotMessage(text) {
      const el = addBotMessageEl('');
      el.innerHTML = formatMessage(text);
      scrollBottom();
    }
    function addBotMessageEl(text) {
      const area = widget.querySelector('#emma-messages');
      const row = document.createElement('div');
      row.className = 'emma-bot-row';
      const msgDiv = document.createElement('div');
      msgDiv.className = 'emma-msg-bot';
      if (text) msgDiv.innerHTML = formatMessage(text);
      const block = document.createElement('div');
      block.className = 'emma-bot-block';
      block.innerHTML = `<div class="emma-bot-name-label">${cfg.agentName}</div>`;
      block.appendChild(msgDiv);
      row.innerHTML = `<div class="emma-bot-avatar">${botAvatarSVG}</div>`;
      row.appendChild(block);
      area.appendChild(row);
      scrollBottom();
      return msgDiv;
    }
    function addThinking() {
      const area = widget.querySelector('#emma-messages');
      const row = document.createElement('div');
      row.className = 'emma-bot-row';
      row.innerHTML = `
        <div class="emma-bot-avatar">${botAvatarSVG}</div>
        <div class="emma-bot-block">
          <div class="emma-bot-name-label">${cfg.agentName}</div>
          <div class="emma-msg-bot emma-thinking">
            <div class="emma-dot"></div><div class="emma-dot"></div><div class="emma-dot"></div>
          </div>
        </div>`;
      area.appendChild(row);
      scrollBottom();
      return row;
    }
    function handleImage(e) {
      const file = e.target.files[0];
      if (!file) return;
      const area = widget.querySelector('#emma-messages');
      const chips = widget.querySelector('#emma-chips');
      if (chips) chips.style.display = 'none';
      const row = document.createElement('div');
      row.className = 'emma-user-row';
      const label = document.createElement('div');
      label.className = 'emma-user-label';
      label.textContent = 'Vous';
      const img = document.createElement('img');
      img.style.cssText = 'max-width:200px;border-radius:12px;display:block;';
      img.src = URL.createObjectURL(file);
      row.appendChild(label);
      row.appendChild(img);
      area.appendChild(row);
      scrollBottom();
      e.target.value = '';
    }
    function scrollBottom() {
      const area = widget.querySelector('#emma-messages');
      area.scrollTop = area.scrollHeight;
    }
    function formatMessage(text) {
      return text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*([\s\S]+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/#{1,3} (.+)/g,'<strong>$1</strong>')
        .replace(/\n/g,'<br>');
    }
    function escapeHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    if (cfg.autoOpen) setTimeout(open, 300);

    // ── Public API ──
    return { open, close, toggle };
  }

  // ── Public EmmaChat API ──
  global.EmmaChat = {
    /**
     * Initialize the chat widget
     * @param {object} options - Configuration options
     */
    init: function (options) {
      const cfg = Object.assign({}, DEFAULTS, options);
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
