(function (global) {
  'use strict';

  const EMMA_WIDGET_VERSION = '0.7.2';

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
    // userId: identifiant ERP (optionnel). Si défini sans sessionId explicite, la session est isolée par utilisateur
    // (clé localStorage/sessionStorage dérivée) et le corps JSON inclut userId pour n8n / logs. Absent = comportement inchangé (démo / tests).
    userId: null,
    // erpSessionId: id de session de connexion applicative ERP (optionnel), envoyé dans le JSON pour logs / audit n8n.
    erpSessionId: null,
    // pageUrl: URL ou chemin de l’écran courant (optionnel). Préférer getPageUrl() en SPA pour valeur à jour à chaque message.
    pageUrl: null,
    // getErpSessionId / getPageUrl: si définis (fonction sans argument), leur valeur de retour est utilisée à chaque envoi (prioritaire sur les champs statiques).
    getErpSessionId: null,
    getPageUrl: null,
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
    logoUrl: 'emma-avatar.png',
    welcomeText: 'Bonjour ! Comment puis-je vous aider ?',
    inputPlaceholder: 'Ecrivez votre question...',
    buttonText: 'Poser une question',
    responseTimeText: 'Nous traitons rapidement vos préoccupations.',
    // Texte affiché à côté des points pendant l’attente de la réponse (stream).
    typingLabel: 'En train d\'écrire…',
    suggestions: [],
    position: 'right',       // 'right' | 'left'
    primaryColor: '#2563EB',
    launcherSize: 62,
    widgetWidth: 380,
    widgetHeight: 580,
    autoOpen: false,
    onOpen: null,
    onClose: null,
    onMessage: null,
    // onError: (info) => {} — info: { kind, version, status?, message?, name? }
    onError: null,
    // satisfactionEnabled: active/désactive les boutons 👍/👎 après chaque réponse bot.
    satisfactionEnabled: true,
    // satisfactionWebhookPath: path relatif au domaine n8n (déduit de webhookUrl).
    satisfactionWebhookPath: 'chatbot-satisfaction',
    // Texte discret sous la réponse (vote satisfaction), personnalisable.
    feedbackPromptText:
      'Cette réponse vous a-t-elle été utile ? Vos retours aident à améliorer les réponses du chatbot.',
    // satisfactionOnlyAfterKb: si true, n’affiche 👍/👎 que si la réponse semble issue de la KB (heuristique)
    // ou si n8n envoie kbConsulted / emmaKbConsulted / ragInvoked (bool) dans le JSON du chat.
    satisfactionOnlyAfterKb: true,
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

  /** URL d’image / logo : http(s), file (local), chemin absolu /… (pas //…). */
  function sanitizeImageUrl(raw, fallback) {
    const u = String(raw || '').trim();
    if (!u) return fallback;
    if (/^https:\/\//i.test(u) || /^http:\/\//i.test(u)) return u;
    if (/^file:\/\//i.test(u)) return u;
    if (u.startsWith('/') && !u.startsWith('//')) return u;
    try {
      const p = new URL(u, typeof document !== 'undefined' ? document.baseURI : 'https://invalid/');
      if (p.protocol === 'https:' || p.protocol === 'http:' || p.protocol === 'file:') return p.href;
    } catch (_) {}
    return fallback;
  }

  /**
   * URL du fichier emma-widget.js (ne pas utiliser document.currentScript au moment de init() :
   * il pointe alors vers le script inline qui appelle EmmaChat.init, pas vers le widget).
   */
  function getEmmaWidgetScriptUrl() {
    try {
      if (typeof document === 'undefined') return '';
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var el = scripts[i];
        var attr = el.getAttribute('src') || '';
        var abs = el.src || '';
        var cand = String(attr || abs);
        if (!cand) continue;
        if (!/emma-widget(?:\.min)?\.js/i.test(cand)) continue;
        if (/^https?:\/\//i.test(abs)) return abs;
        try {
          return new URL(attr || abs, document.baseURI).href;
        } catch (_) {
          return abs || cand;
        }
      }
    } catch (_) {}
    return '';
  }

  /** Résout logoUrl relative par rapport à emma-widget.js (sinon la page hôte cassait l’avatar en intégration ERP). */
  function resolveLogoUrl(raw) {
    var u = String(raw == null ? '' : raw).trim();
    if (!u) u = String(DEFAULTS.logoUrl);
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('/')) {
      if (u.startsWith('//')) return resolveLogoUrl(DEFAULTS.logoUrl);
      try {
        if (typeof document !== 'undefined') return new URL(u, document.baseURI).href;
      } catch (_) {}
      return u;
    }
    var base = getEmmaWidgetScriptUrl();
    if (!base && typeof document !== 'undefined') base = document.baseURI;
    if (!base) return u;
    try {
      return new URL(u, base).href;
    } catch (_) {
      return u;
    }
  }

  function clampNum(n, min, max, fallback) {
    const v = Number(n);
    if (Number.isNaN(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  }

  /** Contexte audit ERP : getter prioritaire, sinon chaîne statique ; chaîne vide = omis du JSON. */
  function resolveAuditContextString(staticVal, getter) {
    if (typeof getter === 'function') {
      try {
        const v = getter();
        if (v != null && String(v).trim()) return String(v).trim();
      } catch (_) {}
    }
    if (staticVal != null && String(staticVal).trim()) return String(staticVal).trim();
    return '';
  }

  /**
   * Dérive l'URL satisfaction depuis webhookUrl en remplaçant le path après /webhook/.
   * Retourne '' si échec (désactive silencieusement la feature).
   */
  function buildSatisfactionUrl(webhookUrl, path) {
    try {
      var u = new URL(String(webhookUrl || ''));
      var idx = u.pathname.indexOf('/webhook/');
      if (idx === -1) return '';
      u.pathname = u.pathname.slice(0, idx + '/webhook/'.length) + String(path || '');
      u.search = '';
      return u.toString();
    } catch (_) {
      return '';
    }
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

  /** Clé de stockage : sans userId = sessionStorageKey ; avec userId = suffixe dérivé (une session persistante par utilisateur). */
  function effectiveSessionStorageKey(cfg) {
    const base = String(cfg.sessionStorageKey || DEFAULTS.sessionStorageKey).trim() || DEFAULTS.sessionStorageKey;
    const raw = cfg.userId == null ? '' : String(cfg.userId).trim();
    if (!raw) return base;
    try {
      return base + ':user:' + encodeURIComponent(raw).slice(0, 500);
    } catch {
      return base + ':user:invalid';
    }
  }

  function resolveSessionId(cfg, opts) {
    if (cfg.sessionId && String(cfg.sessionId).trim()) return String(cfg.sessionId).trim();
    const scope = (cfg.sessionScope || 'browser').toLowerCase();

    // conversation scope: always new (unless explicitly overridden by cfg.sessionId)
    if (scope === 'conversation' || (opts && opts.forceNew)) return createSessionId();

    const storage = scope === 'tab' ? safeGetSessionStorage() : safeGetLocalStorage();
    if (!storage) return createSessionId();

    const storageKey = effectiveSessionStorageKey(cfg);
    const existing = storage.getItem(storageKey);
    if (existing && existing.trim()) return existing.trim();

    const fresh = createSessionId();
    storage.setItem(storageKey, fresh);
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
        flex:1; overflow-y:auto; padding:16px 14px 18px;
        display:flex; flex-direction:column; gap:12px;
        scroll-behavior:smooth; background:#EEF0F5;
      }
      .emma-messages::-webkit-scrollbar { width:4px; }
      .emma-messages::-webkit-scrollbar-thumb { background:#D0D8F8; border-radius:4px; }

      .emma-bot-row { display:flex; align-items:flex-end; gap:9px; }
      .emma-bot-avatar {
        width:30px; height:30px; border-radius:50%;
        background:#D0D8F8; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
        overflow:hidden;
      }
      .emma-bot-avatar img {
        width:100%; height:100%; object-fit:cover; border-radius:50%;
        display:block;
      }
      .emma-bot-block {
        display:flex; flex-direction:column; gap:4px;
        flex:1; min-width:0; max-width:calc(100% - 40px);
      }
      .emma-bot-name-label { font-size:11px; color:#9098A3; padding-left:4px; letter-spacing:0.02em; }
      .emma-msg-bot {
        background:#fff; border-radius:20px 20px 20px 6px;
        padding:12px 16px 13px; font-size:13.5px; color:#1f2937;
        line-height:1.65; letter-spacing:0;
        max-width:100%; width:fit-content; box-sizing:border-box;
        box-shadow:0 1px 3px rgba(0,0,0,0.05), 0 4px 20px rgba(0,0,0,0.04);
        animation:emmaMsgIn .2s ease;
        word-wrap:break-word; overflow-wrap:break-word;
      }
      .emma-msg-content { display:block; }
      .emma-msg-content .emma-msg-p {
        margin:0 0 0.65em; line-height:1.65;
      }
      .emma-msg-content .emma-msg-p:last-child { margin-bottom:0; }
      .emma-msg-content .emma-msg-p + .emma-msg-p { margin-top:0.25em; }
      .emma-msg-lead {
        display:block; font-weight:600; font-size:14px; line-height:1.4;
        color:#111827; margin:0 0 0.45em;
      }
      .emma-msg-sep {
        border:none; height:1px; margin:0.7em 0;
        background:linear-gradient(90deg, transparent 0%, #dfe3ea 12%, #dfe3ea 88%, transparent 100%);
      }
      .emma-user-row { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
      .emma-user-label { font-size:11px; color:#9098A3; padding-right:2px; }
      .emma-msg-user {
        background:${pc}; border-radius:20px 20px 6px 20px;
        padding:10px 14px; font-size:13.5px; color:#fff;
        line-height:1.65; max-width:min(100%, 300px); box-sizing:border-box;
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
        border-top:1px solid #EDEEF2;
        display:flex; flex-direction:column;
        background:#fff; flex-shrink:0;
      }
      /* Zone thumbnails — visible uniquement quand images en attente */
      .emma-img-previews {
        display:none; flex-wrap:wrap; gap:8px;
        padding:10px 14px 6px;
      }
      .emma-img-previews.has-images { display:flex; }
      .emma-img-thumb {
        position:relative; width:64px; height:64px;
        border-radius:8px; overflow:hidden; flex-shrink:0;
        box-shadow:0 1px 4px rgba(0,0,0,0.12);
      }
      .emma-img-thumb img {
        width:100%; height:100%; object-fit:cover; display:block;
      }
      .emma-img-thumb-rm {
        position:absolute; top:3px; right:3px;
        width:18px; height:18px; border-radius:50%; border:none;
        background:rgba(0,0,0,0.55); color:#fff;
        font-size:11px; line-height:1; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        transition:background .12s;
      }
      .emma-img-thumb-rm:hover { background:rgba(0,0,0,0.78); }
      /* Rangée texte + boutons */
      .emma-input-row {
        display:flex; align-items:center; gap:10px;
        padding:10px 14px 12px;
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

      .emma-feedback-strip {
        margin-top:8px; padding-top:2px;
        align-self:stretch; max-width:100%;
      }
      .emma-feedback-prompt {
        font-size:10.5px; line-height:1.35; color:#9ca3af;
        margin:0 0 4px 1px; letter-spacing:0.01em;
      }
      .emma-feedback-strip.emma-feedback-done .emma-feedback-prompt { opacity:0.55; }
      .emma-feedback-row {
        display:flex; gap:2px; align-items:center;
      }
      .emma-feedback-btn {
        background:transparent; border:none; cursor:pointer;
        padding:4px 6px; border-radius:6px;
        opacity:0.45; transition:opacity 0.15s;
        color:#6b7280; line-height:1; font-family:inherit;
      }
      .emma-feedback-btn:hover { opacity:0.75; }
      .emma-feedback-btn.voted { opacity:1; pointer-events:none; }
      .emma-feedback-btn.voted.positif { color:#22c55e; }
      .emma-feedback-btn.voted.negatif { color:#ef4444; }
      .emma-feedback-btn:disabled { opacity:0.25; cursor:default; }
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
    /** Images en attente d'envoi : tableau de { dataUrl, thumbUrl } (max 3). */
    let pendingImages = [];
    const MAX_IMAGES = 3;

    const satisfactionUrl = cfg.satisfactionEnabled
      ? buildSatisfactionUrl(cfg.webhookUrl, cfg.satisfactionWebhookPath || 'chatbot-satisfaction')
      : '';

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
            <div class="emma-avatar" id="emma-header-avatar-slot"></div>
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
          <div class="emma-img-previews" id="emma-img-previews"></div>
          <div class="emma-input-row">
            <input type="text" id="emma-input" placeholder="${escapeAttrStr(cfg.inputPlaceholder)}">
            <label class="emma-action-btn emma-btn-attach" style="cursor:pointer;" title="Joindre une image (max 3)">
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
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(widget);

    (function mountHeaderAvatar() {
      var slot = widget.querySelector('#emma-header-avatar-slot');
      if (!slot) return;
      slot.textContent = '';
      var im = document.createElement('img');
      im.className = 'emma-header-avatar-img';
      im.alt = String(cfg.agentName != null ? cfg.agentName : '');
      im.decoding = 'async';
      im.loading = 'eager';
      im.setAttribute('referrerpolicy', 'no-referrer');
      im.width = 44;
      im.height = 44;
      im.onerror = function () {
        if (cfg._logoUrlFallback && im.src !== cfg._logoUrlFallback) {
          im.src = cfg._logoUrlFallback;
          return;
        }
        im.style.display = 'none';
      };
      var url = String(cfg.logoUrl != null ? cfg.logoUrl : '').trim();
      if (!url) url = String(resolveLogoUrl(DEFAULTS.logoUrl));
      im.src = sanitizeImageUrl(url, DEFAULTS.logoUrl);
      slot.appendChild(im);
    })();

    // ── Event listeners ──
    function appendBotAvatar(row) {
      var wrap = document.createElement('div');
      wrap.className = 'emma-bot-avatar';
      var im = document.createElement('img');
      im.alt = cfg.agentName;
      im.decoding = 'async';
      im.loading = 'lazy';
      im.onerror = function () {
        if (cfg._logoUrlFallback && im.src !== cfg._logoUrlFallback) {
          im.src = cfg._logoUrlFallback;
          return;
        }
        im.style.display = 'none';
      };
      im.src = cfg.logoUrl;
      wrap.appendChild(im);
      row.appendChild(wrap);
    }

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

        const trimmedUserId = cfg.userId != null && String(cfg.userId).trim();
        const erpSessionForPayload = resolveAuditContextString(cfg.erpSessionId, cfg.getErpSessionId);
        const pageUrlForPayload = resolveAuditContextString(cfg.pageUrl, cfg.getPageUrl);
        // Images en attente : snapshot avant réinitialisation
        const snapshotImages = pendingImages.slice();
        const imageDataUrls = snapshotImages.map(function (i) { return i.dataUrl; });
        const imageThumbUrls = snapshotImages.map(function (i) { return i.thumbUrl; });

        // Afficher les vignettes dans le fil AVANT le fetch (optimiste, Object URLs encore valides)
        if (snapshotImages.length > 0) {
          const thumbsWrap = document.createElement('div');
          thumbsWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-bottom:4px;';
          imageThumbUrls.forEach(function (thumbUrl) {
            const im = document.createElement('img');
            im.src = thumbUrl;
            im.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.12);';
            thumbsWrap.appendChild(im);
          });
          elMessages.appendChild(thumbsWrap);
          scrollBottom();
        }

        // Réinitialiser la zone images (révoque les Object URLs)
        clearPendingImages();

        const imagePayload = imageDataUrls.length > 0 ? { imageDataUrls: imageDataUrls } : {};

        const res = await fetch(cfg.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
          body: JSON.stringify({
            action: 'sendMessage',
            chatInput: text,
            route: cfg.webhookRoute,
            sessionId,
            ...(emmaSecret ? { emmaSecret } : {}),
            ...(trimmedUserId ? { userId: trimmedUserId } : {}),
            ...(erpSessionForPayload ? { erpSessionId: erpSessionForPayload } : {}),
            ...(pageUrlForPayload ? { pageUrl: pageUrlForPayload } : {}),
            ...imagePayload,
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
          if (reply !== 'Aucune réponse reçue.') {
            const lastBotRow = elMessages.querySelector('.emma-bot-row:last-child');
            const kbMeta = extractKbMetaFromPayload(data);
            if (lastBotRow) addFeedbackButtons(lastBotRow, text, { kbConsulted: kbMeta, replyText: reply });
          }
          if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: reply });
          return;
        }

        if (!res.body) {
          const raw = await res.text();
          thinkingEl.remove();
          const rawTrim = raw.trim();
          const reply = tryParseJsonReply(rawTrim) || rawTrim || 'Aucune réponse reçue.';
          let kbMetaBody;
          try {
            kbMetaBody = extractKbMetaFromPayload(JSON.parse(rawTrim));
          } catch (_) {
            kbMetaBody = undefined;
          }
          addBotMessage(reply);
          if (reply !== 'Aucune réponse reçue.') {
            const lastRow = elMessages.querySelector('.emma-bot-row:last-child');
            if (lastRow) addFeedbackButtons(lastRow, text, { kbConsulted: kbMetaBody, replyText: reply });
          }
          if (typeof cfg.onMessage === 'function') cfg.onMessage({ role: 'bot', text: reply });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let rawBuf = '';
        let lineBuf = '';
        /** Métadonnée optionnelle n8n (kbConsulted, etc.) lue sur les lignes NDJSON. */
        let streamKbMeta;
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
              const kbM = extractKbMetaFromSingle(parsed);
              if (kbM === true) streamKbMeta = true;
              else if (kbM === false && streamKbMeta !== true) streamKbMeta = false;
              appendStreamDelta(extractStreamDelta(parsed));
            } catch (_) {}
          }
        }
        const tail = normalizeStreamLine(lineBuf);
        if (tail) {
          try {
            const parsedT = JSON.parse(tail);
            const kbT = extractKbMetaFromSingle(parsedT);
            if (kbT === true) streamKbMeta = true;
            else if (kbT === false && streamKbMeta !== true) streamKbMeta = false;
            appendStreamDelta(extractStreamDelta(parsedT));
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
                const p = JSON.parse(norm);
                const kbF = extractKbMetaFromSingle(p);
                if (kbF === true) streamKbMeta = true;
                else if (kbF === false && streamKbMeta !== true) streamKbMeta = false;
                acc += extractStreamDelta(p);
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
        if (fullText) addFeedbackButtons(thinkingEl, text, { kbConsulted: streamKbMeta, replyText: fullText });
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
      appendBotAvatar(row);
      row.appendChild(block);
      elMessages.appendChild(row);
      scrollBottom();
      return msgDiv;
    }
    function addThinking() {
      const row = document.createElement('div');
      row.className = 'emma-bot-row';
      appendBotAvatar(row);
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
    /** Compresse une image via canvas (max 800×800, JPEG 0.72) et retourne une data URL. */
    function compressImageFile(file, cb) {
      const MAX_DIM = 800;
      const QUALITY = 0.72;
      const reader = new FileReader();
      reader.onload = function (ev) {
        const imgEl = new global.Image();
        imgEl.onload = function () {
          let w = imgEl.width, h = imgEl.height;
          if (w > MAX_DIM || h > MAX_DIM) {
            if (w >= h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
            else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
          }
          const canvas = global.document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(imgEl, 0, 0, w, h);
          cb(null, canvas.toDataURL('image/jpeg', QUALITY));
        };
        imgEl.onerror = function () { cb(new Error('Image invalide'), null); };
        imgEl.src = ev.target.result;
      };
      reader.onerror = function () { cb(new Error('Lecture fichier échouée'), null); };
      reader.readAsDataURL(file);
    }

    /** Re-rend la zone de thumbnails dans la barre de saisie. */
    function renderImagePreviews() {
      const zone = widget.querySelector('#emma-img-previews');
      if (!zone) return;
      zone.innerHTML = '';
      if (pendingImages.length === 0) {
        zone.classList.remove('has-images');
        // Rétablir placeholder par défaut
        const inp = widget.querySelector('#emma-input');
        if (inp) inp.placeholder = escapeAttrStr(cfg.inputPlaceholder);
        return;
      }
      zone.classList.add('has-images');
      // Placeholder contextuel
      const inp = widget.querySelector('#emma-input');
      if (inp) inp.placeholder = pendingImages.length === 1
        ? 'Décrivez votre problème ou posez votre question sur cette capture…'
        : 'Décrivez votre problème ou posez votre question sur ces captures…';

      pendingImages.forEach(function (img, idx) {
        const thumb = document.createElement('div');
        thumb.className = 'emma-img-thumb';
        const im = document.createElement('img');
        im.src = img.thumbUrl;
        im.alt = 'Capture ' + (idx + 1);
        const rm = document.createElement('button');
        rm.className = 'emma-img-thumb-rm';
        rm.setAttribute('aria-label', 'Retirer cette image');
        rm.innerHTML = '&#x2715;';
        rm.onclick = function () {
          try { URL.revokeObjectURL(img.thumbUrl); } catch (_) {}
          pendingImages.splice(idx, 1);
          renderImagePreviews();
        };
        thumb.appendChild(im);
        thumb.appendChild(rm);
        zone.appendChild(thumb);
      });

      // Icône "+" si < MAX_IMAGES — invite à ajouter d'autres captures
      if (pendingImages.length < MAX_IMAGES) {
        const add = document.createElement('label');
        add.style.cssText = 'width:64px;height:64px;border-radius:8px;border:2px dashed #D1D5DB;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#9CA3AF;font-size:22px;flex-shrink:0;';
        add.title = 'Ajouter une image (' + pendingImages.length + '/' + MAX_IMAGES + ')';
        add.innerHTML = '+';
        add.htmlFor = 'emma-file';
        zone.appendChild(add);
      }
    }

    function clearPendingImages() {
      pendingImages.forEach(function (img) {
        try { URL.revokeObjectURL(img.thumbUrl); } catch (_) {}
      });
      pendingImages = [];
      renderImagePreviews();
    }

    function handleImage(e) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        addBotMessage('Format non supporté. Veuillez joindre une image (JPG, PNG, WebP, GIF).');
        return;
      }
      if (pendingImages.length >= MAX_IMAGES) {
        addBotMessage('Maximum ' + MAX_IMAGES + ' images par message.');
        return;
      }

      compressImageFile(file, function (err, dataUrl) {
        if (err || !dataUrl) {
          addBotMessage('Impossible de traiter cette image. Veuillez réessayer.');
          return;
        }
        if (dataUrl.length > 3 * 1024 * 1024) {
          addBotMessage('Cette capture est trop volumineuse. Réduisez la résolution ou utilisez un format compressé.');
          return;
        }
        // thumbUrl = object URL sur la data URL pour l'aperçu léger
        const blob = dataURItoBlob(dataUrl);
        const thumbUrl = blob ? URL.createObjectURL(blob) : dataUrl;
        pendingImages.push({ dataUrl: dataUrl, thumbUrl: thumbUrl });
        renderImagePreviews();
        // Focus sur le champ texte pour inviter à poser la question
        const inp = widget.querySelector('#emma-input');
        if (inp) inp.focus();
      });
    }

    /** Convertit une data URL en Blob (pour createObjectURL). */
    function dataURItoBlob(dataUrl) {
      try {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
      } catch (_) { return null; }
    }
    function scrollBottom() {
      elMessages.scrollTop = elMessages.scrollHeight;
    }
    /** Coupe les fuites n8n (aide If « Try either… ») parfois concaténées au stream chat. */
    function stripTrailingN8nNoise(raw) {
      const s = String(raw);
      const lower = s.toLowerCase();
      const needle = '<p>try either';
      const idx = lower.lastIndexOf(needle);
      if (idx === -1) return s;
      return s.slice(0, idx).trimEnd();
    }
    function formatMessage(text) {
      let t = stripTrailingN8nNoise(String(text))
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

    /** Lit un booléen explicite renvoyé par n8n (optionnel). */
    function extractKbMetaFromSingle(obj) {
      if (!obj || typeof obj !== 'object') return undefined;
      if (obj.kbConsulted === true || obj.emmaKbConsulted === true || obj.ragInvoked === true || obj.ragUsed === true) {
        return true;
      }
      if (obj.kbConsulted === false || obj.emmaKbConsulted === false || obj.ragInvoked === false || obj.ragUsed === false) {
        return false;
      }
      const em = obj.emmaMeta || obj.meta;
      if (em && typeof em === 'object') {
        if (em.kbConsulted === true || em.ragUsed === true) return true;
        if (em.kbConsulted === false) return false;
      }
      return undefined;
    }

    function extractKbMetaFromPayload(data) {
      if (data == null) return undefined;
      if (Array.isArray(data)) {
        let anyTrue = false;
        let anyFalse = false;
        for (let i = 0; i < data.length; i++) {
          const m = extractKbMetaFromSingle(data[i]);
          if (m === true) anyTrue = true;
          if (m === false) anyFalse = true;
        }
        if (anyTrue) return true;
        if (anyFalse) return false;
        return undefined;
      }
      return extractKbMetaFromSingle(data);
    }

    /** Heuristique : réponse structurée type fiche KB vs politesse courte. */
    function guessKbWasUsed(replyText) {
      const raw = stripTrailingN8nNoise(String(replyText || '')).trim();
      if (!raw) return false;
      const lower = raw.toLowerCase();
      if (/unauthorized|service indisponible|réponse invalide/i.test(raw)) return false;
      if (raw.includes('##') || /(^|[\n\r])\s*#{2,3}\s+\S/m.test(raw)) return true;
      if (lower.includes('chemin d\'accès') || lower.includes('chemin d’accès')) return true;
      if (/[\n\r]\s*\d{1,2}\.\s+\S/.test(raw) && raw.length > 200) return true;
      if (/\*\*[^*]{2,50}\*\*/.test(raw) && raw.length > 200) return true;
      if (raw.length > 960) return true;
      if (raw.length < 130) return false;
      if (raw.length < 500) {
        const closing =
          /n['']hésitez pas|reven(ir|ez)\s+(vers|me)|à votre disposition|bonne journ(ée|e)|d['']autres questions|besoin d['']assistance|passez une (bonne|agr)/i.test(lower);
        if (closing && !raw.includes('##')) return false;
      }
      return raw.length >= 520;
    }

    function shouldOfferSatisfactionFeedback(kbExplicit, replyText) {
      if (!cfg.satisfactionOnlyAfterKb) return true;
      if (kbExplicit === true) return true;
      if (kbExplicit === false) return false;
      return guessKbWasUsed(replyText);
    }

    const SVG_THUMBS_UP =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>' +
      '<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
    const SVG_THUMBS_DOWN =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>' +
      '<path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>';

    /**
     * Ajoute les boutons 👍/👎 sous un message bot.
     * @param {HTMLElement} botRow - le .emma-bot-row contenant le message
     * @param {string} userQuestion - texte exact de la question posée par l'utilisateur
     * @param {{ kbConsulted?: boolean, replyText?: string }} [opts] - kbConsulted si n8n l’envoie ; replyText pour l’heuristique KB
     */
    function addFeedbackButtons(botRow, userQuestion, opts) {
      if (!cfg.satisfactionEnabled || !satisfactionUrl) return;
      if (!botRow || !botRow.isConnected) return;

      const replyForGuess = opts && opts.replyText != null ? String(opts.replyText) : '';
      const kbExplicit = opts && Object.prototype.hasOwnProperty.call(opts, 'kbConsulted') ? opts.kbConsulted : undefined;
      if (!shouldOfferSatisfactionFeedback(kbExplicit, replyForGuess)) return;

      const block = botRow.querySelector('.emma-bot-block');
      if (!block) return;

      const strip = document.createElement('div');
      strip.className = 'emma-feedback-strip';

      const prompt = document.createElement('div');
      prompt.className = 'emma-feedback-prompt';
      prompt.textContent =
        cfg.feedbackPromptText != null && String(cfg.feedbackPromptText).trim()
          ? String(cfg.feedbackPromptText).trim()
          : 'Cette réponse vous a-t-elle été utile ? Vos retours aident à améliorer les réponses du chatbot.';

      const feedbackRow = document.createElement('div');
      feedbackRow.className = 'emma-feedback-row';

      const btnPos = document.createElement('button');
      btnPos.className = 'emma-feedback-btn';
      btnPos.setAttribute('aria-label', 'Réponse utile');
      btnPos.innerHTML = SVG_THUMBS_UP;

      const btnNeg = document.createElement('button');
      btnNeg.className = 'emma-feedback-btn';
      btnNeg.setAttribute('aria-label', 'Réponse non utile');
      btnNeg.innerHTML = SVG_THUMBS_DOWN;

      feedbackRow.appendChild(btnPos);
      feedbackRow.appendChild(btnNeg);
      strip.appendChild(prompt);
      strip.appendChild(feedbackRow);
      block.appendChild(strip);

      function sendVote(satisfaction) {
        btnPos.disabled = true;
        btnNeg.disabled = true;
        strip.classList.add('emma-feedback-done');
        const clicked = satisfaction === 'positif' ? btnPos : btnNeg;
        clicked.classList.add('voted', satisfaction);

        const extraHeaders =
          cfg.webhookHeaders && typeof cfg.webhookHeaders === 'object' && !Array.isArray(cfg.webhookHeaders)
            ? cfg.webhookHeaders : {};
        const fromCfg = cfg.sharedSecret && String(cfg.sharedSecret).trim();
        const fromHeader = extraHeaders['X-Emma-Secret'] || extraHeaders['x-emma-secret'];
        const emmaSecret = fromCfg || (fromHeader && String(fromHeader).trim()) || null;

        const body = Object.assign(
          { sessionId: sessionId, question: userQuestion, satisfaction: satisfaction },
          emmaSecret ? { emmaSecret: emmaSecret } : {}
        );

        try {
          fetch(satisfactionUrl, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders),
            body: JSON.stringify(body),
          }).catch(function () {});
        } catch (_) {}
      }

      btnPos.onclick = function () { sendVote('positif'); };
      btnNeg.onclick = function () { sendVote('negatif'); };
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
      if (cfg.logoUrl == null || !String(cfg.logoUrl).trim()) cfg.logoUrl = DEFAULTS.logoUrl;
      cfg.primaryColor = sanitizePrimaryColor(cfg.primaryColor);
      cfg._logoUrlFallback = '';
      try {
        if (typeof document !== 'undefined') {
          cfg._logoUrlFallback = new URL(DEFAULTS.logoUrl, document.baseURI).href;
        }
      } catch (_) {}
      cfg.logoUrl = sanitizeImageUrl(resolveLogoUrl(cfg.logoUrl), DEFAULTS.logoUrl);
      if (cfg._logoUrlFallback === cfg.logoUrl) cfg._logoUrlFallback = '';
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
