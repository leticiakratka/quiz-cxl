/* Quiz Caixa Livre · Fluxo B
 * Todo o texto vem do config (publicado pelo /admin, ou config-default.json se a API cair).
 * Regras fixas no código, porque dependem dos "code" de cada opção (o admin edita o
 * texto, nunca o code):
 *   perfil:   R2 se divida=rolando ou sobra=falta · R3 se sobra >= 500 ou reserva=mais3 · R1 resto
 *   cálculo:  passou_12m = renda*12 · meta_30 = renda*0,3 · gap_mes = meta_30 - sobra (min 0)
 * Modo prévia (?preview=1): o admin manda o config por postMessage e nada é rastreado.
 */
(function () {
  'use strict';

  var PREVIEW = /[?&]preview=1/.test(location.search);
  var QUIZ_ID = 'cxl_analise_b';
  var SAVE_KEY = 'cxl_analise_b_resultado';
  var app = document.getElementById('app');
  var C = null;
  var S = { i: 0, ans: {}, hist: [], nome: '', sid: sid() };

  /* ------------------------------------------------------------------ util */
  function sid() {
    try {
      var s = localStorage.getItem('lck_sid');
      if (!s) { s = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('lck_sid', s); }
      return s;
    } catch (e) { return 'x' + Math.random().toString(36).slice(2, 12); }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return Math.round(n || 0).toLocaleString('pt-BR'); }
  function joinE(arr) {
    arr = arr.filter(Boolean);
    if (arr.length <= 1) return arr[0] || '';
    return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
  }
  function screenById(id) { return (C.screens || []).filter(function (s) { return s.id === id; })[0]; }
  function screenByCalc(k) { return (C.screens || []).filter(function (s) { return s.calc === k; })[0]; }
  function code(id) { var a = S.ans[id]; return a ? (a.codes || a.code) : null; }
  function optByCode(sc, c) { return sc && sc.options ? sc.options.filter(function (o) { return o.code === c; })[0] : null; }

  /* ------------------------------------------------------------- variáveis */
  function calc() {
    var rs = screenByCalc('renda'), ss = screenByCalc('sobra');
    var ro = rs && S.ans[rs.id] ? optByCode(rs, S.ans[rs.id].code) : null;
    var so = ss && S.ans[ss.id] ? optByCode(ss, S.ans[ss.id].code) : null;
    var renda = ro ? Number(ro.value) || 0 : 0;
    var sobra = so ? Number(so.value) || 0 : 0;
    var meta = renda * 0.3;
    var gap = Math.max(0, meta - sobra);
    return { renda: renda, sobra: sobra, meta: meta, gap: gap, sobraCode: so ? so.code : '' };
  }
  function phrases(id, max) {
    var sc = screenById(id), cs = code(id) || [];
    if (!sc) return [];
    var out = sc.options.filter(function (o) { return cs.indexOf(o.code) >= 0 && o.phrase; }).map(function (o) { return o.phrase; });
    return max ? out.slice(0, max) : out;
  }
  /* {{gastos_lista}}: o que a pessoa marcou em "onde o dinheiro escapa" + app de transporte e assinaturas.
     Sem repetir assinaturas se ela já marcou, e com texto padrão se marcou só "não sei". */
  function gastosLista() {
    var marcados = phrases('ralos'), cs = code('ralos') || [];
    if (!marcados.length) return 'delivery, app de transporte e assinaturas';
    var itens = marcados.concat(['app de transporte']);
    if (cs.indexOf('assinaturas') < 0) itens.push('assinaturas');
    return joinE(itens);
  }
  function vars() {
    var k = calc(), R = C.result || {};
    return {
      gastos_lista: gastosLista(),
      nome: S.nome,
      passou_12m: money(k.renda * 12),
      meta_30: money(k.meta),
      gap_mes: money(k.gap),
      gap_ano: money(k.gap * 12),
      sobra_hoje: (R.sobraDisplay || {})[k.sobraCode] || '',
      ralos: joinE(phrases('ralos')),
      conquista: joinE(phrases('conquista', 2)) || R.futureConquistaDefault || '',
      sentir: joinE(phrases('sentir', 2)) || R.futureSentirDefault || ''
    };
  }
  /* texto do config -> html seguro: {{var}}, **negrito**, \n\n vira parágrafo */
  function tpl(str, asParas) {
    if (!str) return '';
    var v = vars();
    var out = esc(str).replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, key) { return v[key] != null ? esc(v[key]) : ''; });
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    if (asParas) return '<p>' + out.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
    return out.replace(/\n/g, '<br>');
  }
  function perfil() {
    var d = code('divida'), so = calc().sobraCode, re = code('reserva');
    if (d === 'rolando' || so === 'falta') return 'R2';
    if (['500a1500', '1500a3000', 'mais3000'].indexOf(so) >= 0 || re === 'mais3') return 'R3';
    return 'R1';
  }

  /* -------------------------------------------------------------- rastreio */
  var RAST = (function () {
    var CHAVES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    var dados = {};
    try {
      var q = new URLSearchParams(location.search), daUrl = {}, achou = false;
      CHAVES.forEach(function (k) { var v = q.get(k); if (v) { daUrl[k] = v.slice(0, 200); achou = true; } });
      if (achou) { localStorage.setItem('lck_rastreio', JSON.stringify(daUrl)); dados = daUrl; }
      else { dados = JSON.parse(localStorage.getItem('lck_rastreio') || '{}'); }
    } catch (e) { dados = {}; }
    return dados;
  })();
  function cookie(n) { try { var m = document.cookie.match('(^|; )' + n + '=([^;]*)'); return m ? decodeURIComponent(m[2]) : ''; } catch (e) { return ''; } }
  function fbc() { var c = cookie('_fbc'); if (c) return c; return RAST.fbclid ? 'fb.1.' + Date.now() + '.' + RAST.fbclid : ''; }
  /* igual à cxlv4: utm_term vira o veículo de fbp~fbc~sid pro Worker da CAPI montar o Purchase */
  function checkoutUrl() {
    var base = (C.meta && C.meta.checkoutUrl) || '';
    if (!base) return '#';
    var p = [];
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) {
      if (RAST[k]) p.push(k + '=' + encodeURIComponent(RAST[k]));
    });
    p.push('utm_term=' + encodeURIComponent(cookie('_fbp') + '~' + fbc() + '~' + S.sid));
    return base + (base.indexOf('?') === -1 ? '?' : '&') + p.join('&');
  }
  function dl(obj) { if (PREVIEW) return; try { (window.dataLayer = window.dataLayer || []).push(obj); } catch (e) { } }
  /* funil: em vez de 1 requisição e 1 gravação por tela, junta as telas visitadas e manda a lista
     inteira poucas vezes (capa, a cada 6 telas novas, momentos importantes e quando a pessoa sai
     da página). No banco vira 1 linha por sessão. Cerca de 85% menos gravações e requisições,
     o que importa no limite diário do plano da Cloudflare. */
  var PASSOS = [], ENVIADOS = 0;
  /* robôs (inclusive os do Meta que abrem o link do anúncio pra revisar) e o pré-carregamento do
     app não contam no funil: navegador automatizado ou robô conhecido fica de fora, e a capa só
     entra quando alguém toca/digita na página ou ela fica 4 s visível na tela. */
  var ROBO = !!navigator.webdriver || /bot|crawler|spider|crawling|headless|lighthouse|facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|preview|prerender/i.test(navigator.userAgent || '');
  var HUMANO = false;
  function esperaHumano(step) {
    if (ROBO || PREVIEW || HUMANO) { if (HUMANO) beacon(step); return; }
    var t = null, evs = ['pointerdown', 'touchstart', 'keydown', 'wheel'];
    function vira() { if (HUMANO) return; HUMANO = true; limpa(); beacon(step); }
    function agenda() { clearTimeout(t); if (document.visibilityState === 'visible' && !document.prerendering) t = setTimeout(vira, 4000); }
    function onVis() { if (document.visibilityState === 'visible') agenda(); else clearTimeout(t); }
    function limpa() { clearTimeout(t); evs.forEach(function (e) { window.removeEventListener(e, vira, true); }); document.removeEventListener('visibilitychange', onVis); }
    evs.forEach(function (e) { window.addEventListener(e, vira, { capture: true, passive: true }); });
    document.addEventListener('visibilitychange', onVis);
    agenda();
  }
  function enviaPassos() {
    if (PREVIEW || PASSOS.length === ENVIADOS) return;
    ENVIADOS = PASSOS.length;
    var body = JSON.stringify({ sid: S.sid, steps: PASSOS });
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }))) return; } catch (e) { }
    try { fetch('/api/event', { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () { }); } catch (e) { }
  }
  function beacon(step, urgente) {
    if (PREVIEW || ROBO) return;
    if (PASSOS.indexOf(step) < 0) PASSOS.push(step);
    if (urgente || PASSOS.length === 1 || PASSOS.length - ENVIADOS >= 6) enviaPassos();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') enviaPassos(); });
  window.addEventListener('pagehide', enviaPassos);
  function track(step, idx) {
    dl({ event: 'quiz_step', quiz_id: QUIZ_ID, quiz_step: step, quiz_step_index: idx });
    if (idx === 0) esperaHumano(step); else beacon(step);
  }
  /* reserva: o Worker já põe o GTM/UTMify no HTML (window.__lckTrk). Isto só roda se a página
     vier sem ele, e nunca no localhost (a não ser com ?gtm=1), pra teste não ir pro Pixel. */
  function loadTracking() {
    if (PREVIEW || window.__lckTrk) return;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]gtm=1/.test(location.search)) return;
    var m = C.meta || {};
    function go() {
      if (m.gtmId) {
        (function (w, d, s, l, i) { w[l] = w[l] || []; w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' }); var f = d.getElementsByTagName(s)[0], j = d.createElement(s); j.async = true; j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i; f.parentNode.insertBefore(j, f); })(window, document, 'script', 'dataLayer', m.gtmId);
      }
      if (m.utmifyPixelId) {
        window.pixelId = m.utmifyPixelId;
        var u = document.createElement('script');
        u.src = 'https://cdn.utmify.com.br/scripts/pixel/pixel.js'; u.async = true; u.defer = true;
        document.head.appendChild(u);
      }
    }
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  }

  /* ------------------------------------------------------------- tema */
  function applyTheme() {
    var t = C.theme || {}, r = document.documentElement.style;
    var map = { primary: '--primary', primaryDark: '--primary-dark', accent: '--accent', bg: '--bg', soft: '--soft', text: '--text', muted: '--muted', border: '--border' };
    Object.keys(map).forEach(function (k) { if (t[k]) r.setProperty(map[k], t[k]); });
    var mc = document.querySelector('meta[name=theme-color]'); if (mc && t.bg) mc.content = t.bg;
  }

  /* ------------------------------------------------------------- navegação */
  function next() { var de = C.screens[S.i]; S.hist.push(S.i); S.i = Math.min(S.i + 1, C.screens.length - 1); render(); notifDepois(de); }
  function back() { if (S.hist.length) { S.i = S.hist.pop(); render(); } }

  var BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';

  function frame(inner, sc) {
    var total = C.screens.length - 1;
    var pct = sc.type === 'cover' ? 0 : Math.round((S.i / total) * 100);
    var top = sc.type === 'cover' ? '' :
      '<div class="topbar"><button class="back" data-act="back" aria-label="Voltar"' + (S.hist.length ? '' : ' hidden') + '>' + BACK_SVG + '</button>' +
      '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div></div>';
    return '<div class="screen" data-type="' + sc.type + '">' + top + '<div class="body">' + inner + '</div></div>';
  }

  function render() {
    var sc = C.screens[S.i];
    if (!sc) return;
    var fn = R[sc.type];
    app.innerHTML = frame(fn ? fn.html(sc) : '', sc);
    var backBtn = app.querySelector('[data-act=back]');
    if (backBtn) backBtn.onclick = back;
    if (fn && fn.bind) fn.bind(sc);
    window.scrollTo(0, 0);
    track(sc.id, S.i);
    idle(prefetchNext);
  }

  /* baixa as imagens das próximas telas enquanto a pessoa responde a atual,
     pra os depoimentos e o card do carregamento abrirem já com o print */
  var idle = window.requestIdleCallback
    ? function (f) { window.requestIdleCallback(f, { timeout: 1500 }); }
    : function (f) { setTimeout(f, 200); };
  var PREF = {};
  function prefetch(src) {
    if (!src || PREF[src]) return;
    PREF[src] = 1;
    var im = new Image(); im.decoding = 'async'; im.src = src;
  }
  function prefetchNext() {
    for (var j = S.i + 1; j <= S.i + 3 && j < C.screens.length; j++) {
      var sc = C.screens[j];
      if (sc.image) prefetch(sc.image);
      if (sc.type === 'loading') prefetch(((C.profiles || {})[perfil()] || {}).testimonialImage);
    }
    if ((C.screens[S.i] || {}).type === 'loading') prefetch((C.offer || {}).image);
  }

  function optHtml(o, multi) {
    return '<button class="opt" type="button" data-code="' + esc(o.code) + '">' +
      (o.emoji ? '<span class="emo">' + esc(o.emoji) + '</span>' : '') +
      '<span>' + tpl(o.label) + '</span>' + (multi ? '<span class="chk">✓</span>' : '') + '</button>';
  }

  /* ------------------------------------------------------------- renderizadores */
  var R = {
    cover: {
      html: function (sc) {
        return '<div class="cover">' +
          (sc.image ? '<img class="cover-img" src="' + esc(sc.image) + '" alt="" width="460" height="460" fetchpriority="high">' : '') +
          '<h1 class="cover-title">' + tpl(sc.title) + '</h1>' +
          (sc.subtitle ? '<p class="cover-sub serif">' + tpl(sc.subtitle) + '</p>' : '') +
          '<button class="btn" data-act="next">' + tpl(sc.button) + '</button>' +
          (sc.linkText ? '<button class="link" data-act="saved">' + tpl(sc.linkText) + '</button>' : '') +
          (sc.small ? '<p class="small">' + tpl(sc.small) + '</p>' : '') + '</div>';
      },
      bind: function () {
        app.querySelector('[data-act=next]').onclick = next;
        var l = app.querySelector('[data-act=saved]');
        if (l) l.onclick = openSaved;
      }
    },
    single: {
      html: function (sc) {
        return '<h2 class="q">' + tpl(sc.title) + '</h2>' + (sc.help ? '<p class="help">' + tpl(sc.help) + '</p>' : '') +
          '<div class="opts">' + sc.options.map(function (o) { return optHtml(o); }).join('') + '</div>' +
          (sc.tip ? '<div class="tip" hidden>' + tpl(sc.tip) + '</div><div class="dock" hidden><button class="btn" data-act="next">Continuar</button></div>' : '');
      },
      bind: function (sc) {
        var prev = S.ans[sc.id] && S.ans[sc.id].code;
        function abreDica() {
          var t = app.querySelector('.tip');
          t.hidden = false; app.querySelector('.dock').hidden = false;
          app.querySelector('[data-act=next]').onclick = next;
          return t;
        }
        app.querySelectorAll('.opt').forEach(function (b) {
          if (b.dataset.code === prev) b.classList.add('sel');
          b.onclick = function () {
            app.querySelectorAll('.opt').forEach(function (x) { x.classList.remove('sel'); });
            b.classList.add('sel');
            var o = optByCode(sc, b.dataset.code);
            S.ans[sc.id] = { code: o.code, label: o.label };
            if (sc.tip) {
              /* rola até a dica (o scroll-margin deixa espaço pro botão preso no rodapé) */
              var t = abreDica();
              setTimeout(function () { t.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
            } else {
              setTimeout(next, 240);
            }
          };
        });
        if (prev && sc.tip) abreDica();
      }
    },
    multi: {
      html: function (sc) {
        return '<h2 class="q">' + tpl(sc.title) + '</h2>' + (sc.help ? '<p class="help">' + tpl(sc.help) + '</p>' : '') +
          '<div class="opts">' + sc.options.map(function (o) { return optHtml(o, true); }).join('') + '</div>' +
          '<div class="dock"><button class="btn" data-act="next" disabled>' + tpl(sc.button || 'Continuar') + '</button></div>';
      },
      bind: function (sc) {
        var sel = (S.ans[sc.id] && S.ans[sc.id].codes || []).slice();
        var btn = app.querySelector('[data-act=next]');
        function sync() {
          app.querySelectorAll('.opt').forEach(function (b) { b.classList.toggle('sel', sel.indexOf(b.dataset.code) >= 0); });
          btn.disabled = !sel.length;
          S.ans[sc.id] = { codes: sel.slice(), labels: sc.options.filter(function (o) { return sel.indexOf(o.code) >= 0; }).map(function (o) { return o.label; }) };
          if (!sel.length) delete S.ans[sc.id];
        }
        app.querySelectorAll('.opt').forEach(function (b) {
          b.onclick = function () {
            var c = b.dataset.code, k = sel.indexOf(c);
            if (k >= 0) sel.splice(k, 1); else sel.push(c);
            sync();
          };
        });
        btn.onclick = function () { if (sel.length) next(); };
        sync();
      }
    },
    input: {
      html: function (sc) {
        return '<h2 class="q">' + tpl(sc.title) + '</h2>' + (sc.question ? '<p class="ask serif">' + tpl(sc.question) + '</p>' : '') +
          '<div class="field"><input class="input" id="f-nome" type="text" autocomplete="given-name" maxlength="40" placeholder="' + esc(sc.placeholder || '') + '" value="' + esc(S.ans[sc.id] ? S.ans[sc.id].text : '') + '"></div>' +
          (sc.small ? '<p class="small">' + tpl(sc.small) + '</p>' : '') +
          '<button class="btn" data-act="next">' + tpl(sc.button || 'Continuar') + '</button>';
      },
      bind: function (sc) {
        var inp = app.querySelector('#f-nome'), btn = app.querySelector('[data-act=next]');
        function go() {
          var v = inp.value.trim().replace(/\s+/g, ' ');
          if (v.length < 2) { inp.classList.add('err'); inp.focus(); return; }
          var first = v.split(' ')[0];
          S.nome = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
          S.ans[sc.id] = { text: v };
          next();
        }
        btn.onclick = go;
        inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
        inp.oninput = function () { inp.classList.remove('err'); };
        if (!PREVIEW) setTimeout(function () { inp.focus(); }, 250);
      }
    },
    statement: {
      html: function (sc) {
        return '<p class="quote">' + tpl(sc.quote) + '</p>' +
          '<p class="qask">' + tpl(sc.question) + '</p>' +
          '<div class="answers">' + (sc.answers || []).map(function (a) { return '<button class="ans" type="button" data-a="' + esc(a) + '">' + esc(a) + '</button>'; }).join('') + '</div>' +
          (sc.caption ? '<p class="caption">' + tpl(sc.caption) + '</p>' : '');
      },
      bind: function (sc) {
        var prev = S.ans[sc.id] && S.ans[sc.id].text;
        app.querySelectorAll('.ans').forEach(function (b) {
          if (b.dataset.a === prev) b.classList.add('sel');
          b.onclick = function () { b.classList.add('sel'); S.ans[sc.id] = { text: b.dataset.a }; setTimeout(next, 200); };
        });
      }
    },
    milestone: {
      html: function (sc) {
        var useAlt = sc.textAlt && calc().gap <= 0;
        return '<div class="milestone"><div class="badge-ok">✓</div><h2 class="mt">' + tpl(sc.title) + '</h2>' +
          '<div class="mtx">' + tpl(useAlt ? sc.textAlt : sc.text, true) + '</div>' +
          '<div class="dock"><button class="btn" data-act="next">' + tpl(sc.button || 'Continuar') + '</button></div></div>';
      },
      bind: function () { app.querySelector('[data-act=next]').onclick = next; }
    },
    testimonial: {
      html: function (sc) {
        return '<div class="depo">' + (sc.kicker ? '<p class="dk">' + tpl(sc.kicker) + '</p>' : '') +
          '<h2 class="dt">' + tpl(sc.title) + '</h2>' +
          (sc.text ? '<div class="dtx">' + tpl(sc.text, true) + '</div>' : '') +
          (sc.image ? '<figure class="dimg"><img src="' + esc(sc.image) + '" alt="' + esc(sc.caption || 'Depoimento') + '" decoding="async">' + (sc.caption ? '<figcaption>' + tpl(sc.caption) + '</figcaption>' : '') + '</figure>' : '') +
          '<div class="dock"><button class="btn" data-act="next">' + tpl(sc.button || 'Continuar') + '</button></div></div>';
      },
      bind: function () { app.querySelector('[data-act=next]').onclick = next; }
    },
    capture: {
      html: function (sc) {
        var a = S.ans[sc.id] || {};
        return '<p class="cap-title">' + tpl(sc.title) + '</p>' +
          '<div class="field"><label for="f-w">' + tpl(sc.whatsLabel) + '</label><input class="input" id="f-w" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="(00) 00000-0000" value="' + esc(a.whatsapp || '') + '"><p class="err-msg" id="e-w" hidden>' + tpl(sc.errWhats) + '</p></div>' +
          '<div class="field"><label for="f-e">' + tpl(sc.emailLabel) + '</label><input class="input" id="f-e" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" value="' + esc(a.email || '') + '"><p class="err-msg" id="e-e" hidden>' + tpl(sc.errEmail) + '</p></div>' +
          '<button class="btn" data-act="send">' + tpl(sc.button) + '</button>' +
          (sc.consent ? '<p class="consent">' + tpl(sc.consent) + '</p>' : '');
      },
      bind: function (sc) {
        var w = app.querySelector('#f-w'), e = app.querySelector('#f-e'), btn = app.querySelector('[data-act=send]');
        w.oninput = function () {
          var d = w.value.replace(/\D/g, '').slice(0, 11), f = d;
          if (d.length > 2) f = '(' + d.slice(0, 2) + ') ' + d.slice(2);
          if (d.length > 7) f = '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
          w.value = f; w.classList.remove('err'); app.querySelector('#e-w').hidden = true;
        };
        e.oninput = function () { e.classList.remove('err'); app.querySelector('#e-e').hidden = true; };
        btn.onclick = function () {
          var digits = w.value.replace(/\D/g, ''), mail = e.value.trim(), ok = true;
          if (!/^[1-9][0-9]9\d{8}$/.test(digits)) { w.classList.add('err'); app.querySelector('#e-w').hidden = false; ok = false; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { e.classList.add('err'); app.querySelector('#e-e').hidden = false; ok = false; }
          if (!ok) return;
          S.ans[sc.id] = { whatsapp: w.value, email: mail };
          btn.disabled = true;
          sendLead(digits, mail);
          next();
        };
      }
    },
    loading: {
      html: function (sc) {
        var p = (C.profiles || {})[perfil()] || {};
        return '<div class="loading"><h2 class="lt">' + tpl(sc.title) + '</h2>' +
          '<div class="bar"><i></i></div><span class="pct">0%</span>' +
          '<ul class="checks">' + (sc.items || []).map(function (t) { return '<li><i>✓</i>' + tpl(t) + '</li>'; }).join('') + '</ul>' +
          (p.testimonialImage || p.testimonialText ? '<div class="testi">' + (p.testimonialImage ? '<img src="' + esc(p.testimonialImage) + '" alt="Depoimento de ' + esc(p.testimonialName || '') + '" decoding="async">' : '') + '<p><strong>' + esc(p.testimonialName || '') + '</strong> · ' + tpl(p.testimonialText) + '</p></div>' : '') +
          '</div>';
      },
      bind: function (sc) {
        var secs = Math.max(2, Number(sc.seconds) || 8), t0 = performance.now();
        var bar = app.querySelector('.bar i'), pct = app.querySelector('.pct'), lis = app.querySelectorAll('.checks li');
        var screenIndex = S.i;
        (function tick(now) {
          if (S.i !== screenIndex) return;
          var k = Math.min(1, (now - t0) / (secs * 1000));
          bar.style.width = (k * 100) + '%'; pct.textContent = Math.round(k * 100) + '%';
          lis.forEach(function (li, j) { if (k >= (j + 1) / (lis.length + .3)) li.classList.add('done'); });
          if (k < 1) requestAnimationFrame(tick);
          else setTimeout(function () { if (S.i === screenIndex && !PREVIEW_HOLD) renderResult(false); }, 500);
        })(t0);
      }
    }
  };
  var PREVIEW_HOLD = false;

  /* ------------------------------------------------------------- lead */
  function flatAnswers() {
    var out = {};
    C.screens.forEach(function (sc) {
      var a = S.ans[sc.id];
      if (!a || sc.type === 'capture') return;
      out[sc.id] = a.labels ? a.labels.join(' | ') : (a.label || a.text || '');
    });
    return out;
  }
  function sendLead(whatsDigits, mail) {
    var k = calc(), pf = perfil();
    var rs = screenByCalc('renda'), ss = screenByCalc('sobra');
    var payload = {
      sid: S.sid, nome: S.ans.nome ? S.ans.nome.text : S.nome, whatsapp: whatsDigits, email: mail, perfil: pf,
      renda: rs && S.ans[rs.id] ? S.ans[rs.id].label : '', sobra: ss && S.ans[ss.id] ? S.ans[ss.id].label : '',
      gap_mes: Math.round(k.gap), respostas: flatAnswers(), utm: RAST, page: location.href.split('#')[0]
    };
    /* evento do Lead: dispara quando o WhatsApp e o e-mail passam na validação e a pessoa envia.
       event_id fixo por sessão (dedup com a CAPI no futuro); e-mail/telefone/nome pra
       correspondência avançada da tag do Meta no GTM */
    dl({
      event: 'quiz_lead', quiz_id: QUIZ_ID, quiz_perfil: pf, event_id: 'lead.' + S.sid,
      quiz_email: mail, quiz_telefone: '55' + whatsDigits, quiz_nome: S.nome
    });
    if (PREVIEW) return;
    try { localStorage.setItem('cxl_analise_b_lead', JSON.stringify(payload)); } catch (e) { }
    enviaLead(payload, 1);
  }
  /* o lead fica guardado no aparelho até o servidor confirmar. Falha de rede ou do servidor:
     tenta de novo em 2, 5 e 12 s e, se ainda não deu, na próxima visita. O servidor ignora
     repetição (mesma sessão + mesmo e-mail), então tentar de novo não duplica lead. */
  var LEAD_PEND = 'cxl_analise_b_lead_pendente';
  function enviaLead(payload, tentativa) {
    try { localStorage.setItem(LEAD_PEND, JSON.stringify(payload)); } catch (e) { }
    function deuCerto() { try { localStorage.removeItem(LEAD_PEND); } catch (e) { } }
    function deNovo() { if (tentativa < 4) setTimeout(function () { enviaLead(payload, tentativa + 1); }, [0, 2000, 5000, 12000][tentativa]); }
    try {
      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true })
        .then(function (r) { if (r.ok) deuCerto(); else if (r.status >= 500) deNovo(); else deuCerto(); /* 4xx = contato recusado, não adianta repetir */ })
        .catch(deNovo);
    } catch (e) { deNovo(); }
  }
  if (!PREVIEW) {
    try {
      var pend = JSON.parse(localStorage.getItem(LEAD_PEND) || 'null');
      if (pend && pend.email) setTimeout(function () { enviaLead(pend, 1); }, 3000);
    } catch (e) { }
  }

  /* ------------------------------------------------------------- resultado + oferta */
  function sentences() {
    var Rr = C.result || {}, out = [];
    var ralos = code('ralos') || [];
    if (ralos.indexOf('naosei') >= 0) out.push(tpl(Rr.sentenceRalosNaoSei));
    else if (ralos.length) out.push(tpl(Rr.sentenceRalos));
    if (code('divida') === 'rolando') out.push(tpl(Rr.sentenceDivida));
    else if (code('fatura') && (Rr.sentenceFatura || {})[code('fatura')]) out.push(tpl(Rr.sentenceFatura[code('fatura')]));
    var re = code('reserva');
    if (re === 'nada' || re === 'menos1') out.push(tpl(Rr.sentenceReservaSem));
    else if (re) out.push(tpl(Rr.sentenceReservaCom));
    return out.filter(Boolean);
  }

  function offerHtml() {
    var O = C.offer || {};
    var h = '<section class="offer" id="oferta">' +
      (O.kicker ? '<p class="kicker">' + tpl(O.kicker) + '</p>' : '') +
      '<h2 class="ot">' + tpl(O.title) + '</h2>' +
      (O.image ? '<img class="oimg" src="' + esc(O.image) + '" alt="' + esc(O.title || '') + '" loading="lazy">' : '') +
      (O.intro ? '<p class="ointro">' + tpl(O.intro) + '</p>' : '') +
      '<ul class="ben">' + (O.benefits || []).map(function (b) { return '<li><span>' + tpl(b) + '</span></li>'; }).join('') + '</ul>' +
      (O.social ? '<p class="social">' + tpl(O.social) + '</p>' : '') +
      ((O.bonuses || []).length ? '<div class="bonus"><h3>' + tpl(O.bonusTitle) + '</h3><ul>' + O.bonuses.map(function (b) { return '<li>' + tpl(b) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="price"><p class="pn">' + tpl(O.priceName) + '</p><p class="pi">' + tpl(O.priceInstallments) + '</p><p class="pc">' + tpl(O.priceCash) + '</p>' +
      '<a class="btn js-checkout" href="' + esc(checkoutUrl()) + '" data-pos="oferta">' + tpl(O.button) + '</a>' +
      (O.guarantee ? '<p class="guar">' + tpl(O.guarantee) + '</p>' : '') + '</div></section>';
    (O.extraBlocks || []).forEach(function (b, i) { h += blockHtml(b, i); });
    return h;
  }

  function blockHtml(b, i) {
    if (!b || b.hidden) return '';
    var t = b.title ? '<h2 class="h2">' + tpl(b.title) + '</h2>' : '';
    switch (b.type) {
      case 'text': return '<section class="blk blk-text">' + t + tpl(b.text, true) + '</section>';
      case 'image': return b.src ? '<section class="blk">' + t + '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || '') + '" loading="lazy" style="border-radius:14px;margin-top:12px"></section>' : '';
      case 'testimonials': return '<section class="blk">' + t + '<div class="carousel">' + (b.images || []).filter(Boolean).map(function (src) { return '<img src="' + esc(src) + '" alt="Depoimento" loading="lazy">'; }).join('') + '</div></section>';
      case 'faq': return '<section class="blk faq">' + t + (b.items || []).map(function (it) { return '<details><summary>' + tpl(it.q) + '</summary><p>' + tpl(it.a) + '</p></details>'; }).join('') + '</section>';
      /* lista antes/depois: tone "ruim" = card vermelho com setas, "boa" = card verde com checks */
      case 'list':
        var boa = b.tone === 'boa';
        var ic = boa ? '<path d="M4.5 12.5l5 5L19.5 7"/>' : '<path d="M4 12h15M13 6l6 6-6 6"/>';
        return '<section class="blk lst ' + (boa ? 'lst-boa' : 'lst-ruim') + '">' + (b.title ? '<h3 class="lst-t">' + tpl(b.title) + '</h3>' : '') +
          '<ul>' + (b.items || []).filter(Boolean).map(function (it) {
            return '<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic + '</svg><span>' + tpl(it) + '</span></li>';
          }).join('') + '</ul></section>';
      case 'guarantee':
        return '<section class="blk gar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/></svg>' +
          (b.title ? '<h3 class="gar-t">' + tpl(b.title) + '</h3>' : '') + (b.text ? '<div class="gar-tx">' + tpl(b.text, true) + '</div>' : '') + '</section>';
      case 'about':
        return '<section class="blk sobre">' + (b.image ? '<img class="sobre-foto" src="' + esc(b.image) + '" alt="' + esc(b.alt || '') + '" width="180" height="180" loading="lazy" decoding="async">' : '') +
          (b.title ? '<h2 class="h2">' + tpl(b.title) + '</h2>' : '') + (b.text ? '<div class="sobre-tx">' + tpl(b.text, true) + '</div>' : '') + '</section>';
      case 'cta': return '<section class="blk" style="text-align:center">' + t + (b.text ? tpl(b.text, true) : '') + '<a class="btn js-checkout" href="' + esc(checkoutUrl()) + '" data-pos="bloco-' + i + '">' + tpl(b.button || (C.offer || {}).button) + '</a></section>';
      default: return '';
    }
  }

  /* notificação estilo celular no resultado ("você tem R$X de caixa livre"), com plim-plim.
     O som é gerado aqui (Web Audio, sem arquivo). O iPhone só deixa tocar som depois de um
     toque, então o áudio é destravado no primeiro toque da pessoa no quiz e fica pronto. */
  var AUD = null, NOTIF_VISTA = false;
  function liberaSom() {
    try {
      if (AUD && AUD.state === 'running') return;
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!AUD) AUD = new AC();
      if (AUD.state === 'suspended') AUD.resume();
      var s = AUD.createBufferSource(); s.buffer = AUD.createBuffer(1, 1, 22050); s.connect(AUD.destination); s.start(0);
    } catch (e) { }
  }
  if (!PREVIEW) { document.addEventListener('pointerdown', liberaSom, true); document.addEventListener('touchend', liberaSom, true); }
  function plim() {
    try {
      if (!AUD || AUD.state !== 'running') return;
      var t0 = AUD.currentTime + 0.02;
      [[1318.5, 0], [1760, 0.14]].forEach(function (n) {
        [[1, 0.2], [2, 0.04]].forEach(function (h) { /* fundamental + oitava fraca = timbre de sininho */
          var o = AUD.createOscillator(), g = AUD.createGain(), t = t0 + n[1];
          o.type = 'sine'; o.frequency.value = n[0] * h[0];
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(h[1], t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          o.connect(g); g.connect(AUD.destination); o.start(t); o.stop(t + 0.55);
        });
      });
    } catch (e) { }
  }
  var S_ = 'viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"';
  /* ícones genéricos (sem marca de banco): caixa = cifrão verde, conta = banco cinza, invest = gráfico azul-petróleo */
  var NF_ICONS = {
    caixa: { bg: 'linear-gradient(160deg,#2EC262,#178A3D)', svg: '<svg ' + S_ + '><path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3"/></svg>' },
    conta: { bg: 'linear-gradient(160deg,#5B6B82,#1E293B)', svg: '<svg ' + S_ + '><path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z"/></svg>' },
    invest: { bg: 'linear-gradient(160deg,#22B8C8,#0E6E7A)', svg: '<svg ' + S_ + '><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>' }
  };
  /* notificação estilo celular: o: { app, time, title, text, icon, seconds, sound, onShow, onTap } */
  function toastNotif(o) {
    var velha = document.querySelector('.notif'); if (velha) velha.remove();
    var ic = NF_ICONS[o.icon] || NF_ICONS.caixa;
    var el = document.createElement('div');
    el.className = 'notif'; el.setAttribute('role', 'status');
    el.innerHTML = '<div class="nf-ic" aria-hidden="true" style="background:' + ic.bg + '">' + ic.svg + '</div><div class="nf-body"><div class="nf-top"><b>' + tpl(o.app) + '</b><span>' + tpl(o.time || 'agora') + '</span></div>' +
      (o.title ? '<div class="nf-t">' + tpl(o.title) + '</div>' : '') + (o.text ? '<div class="nf-tx">' + tpl(o.text) + '</div>' : '') + '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('on'); }); });
    if (o.sound && !PREVIEW) plim();
    if (o.onShow) o.onShow();
    var timer = setTimeout(fecha, Math.max(2, Number(o.seconds) || 5) * 1000), y0 = null, puxou = false;
    function fecha() { clearTimeout(timer); el.classList.remove('on'); setTimeout(function () { el.remove(); }, 450); }
    /* arrastar pra cima fecha, igual notificação de celular; toque faz o onTap (ou só fecha) */
    el.addEventListener('pointerdown', function (e) { y0 = e.clientY; puxou = false; });
    el.addEventListener('pointermove', function (e) {
      if (y0 == null) return;
      var dy = e.clientY - y0; if (dy < -6) { puxou = true; el.style.transition = 'none'; el.style.transform = 'translateY(' + dy + 'px)'; }
    });
    el.addEventListener('pointerup', function (e) {
      var dy = y0 == null ? 0 : e.clientY - y0; y0 = null;
      el.style.transition = ''; el.style.transform = '';
      if (puxou) { if (dy < -30) fecha(); return; }
      if (o.onTap) o.onTap();
      fecha();
    });
  }
  /* notificação do resultado: "você tem R$X de caixa livre", com plim-plim; toque leva ao preço */
  function notificacao() {
    var N = (C.result || {}).notify;
    if (!N || !N.enabled || NOTIF_VISTA || !(calc().meta > 0)) return;
    NOTIF_VISTA = true;
    setTimeout(function () {
      toastNotif({
        app: N.app, time: N.time, title: N.title, text: N.text, icon: 'caixa', seconds: N.seconds || 6, sound: N.sound !== false,
        onShow: function () { dl({ event: 'quiz_notificacao', acao: 'vista', quiz_id: QUIZ_ID }); beacon('notificacao_vista'); },
        onTap: function () {
          dl({ event: 'quiz_notificacao', acao: 'tocada', quiz_id: QUIZ_ID }); beacon('notificacao_tocada', true);
          var alvo = document.querySelector('.price') || document.getElementById('oferta');
          if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }, Math.max(0, Number(N.delay) || 0) * 1000);
  }
  /* notificações do meio do quiz (C.flowNotifs): o futuro da pessoa, ligado à resposta que ela
     acabou de dar. Cada uma tem "after" (id da pergunta) e "cases": o primeiro caso que bate com
     a resposta (na ordem em que ela marcou) ganha; caso sem codes é o padrão. Sem som. */
  var NF_FEITAS = {};
  function casoNotif(n) {
    var a = S.ans[n.after] || {}, meus = a.codes || (a.code ? [a.code] : []), cs = n.cases || [];
    for (var i = 0; i < meus.length; i++) for (var j = 0; j < cs.length; j++) if ((cs[j].codes || []).indexOf(meus[i]) >= 0) return cs[j];
    for (var k = 0; k < cs.length; k++) if (!(cs[k].codes || []).length) return cs[k];
    return null;
  }
  function notifDoFluxo(id) { return (C.flowNotifs || []).filter(function (x) { return x.after === id && x.enabled !== false; })[0]; }
  function mostraNotifFluxo(n) {
    var c = casoNotif(n); if (!c) return;
    toastNotif({ app: c.app || n.app, title: c.title, text: c.text, icon: c.icon || n.icon || 'conta', seconds: n.seconds || 4 });
  }
  function notifDepois(sc) {
    if (PREVIEW || !sc) return;
    var n = notifDoFluxo(sc.id); if (!n || NF_FEITAS[sc.id]) return;
    NF_FEITAS[sc.id] = 1;
    setTimeout(function () {
      var atual = C.screens[S.i];
      if (!atual || atual.type === 'capture' || atual.type === 'loading' || !document.querySelector('.screen')) return;
      mostraNotifFluxo(n);
    }, 800);
  }

  /* carrossel de depoimentos do resultado: primeiro o do perfil da pessoa, depois os outros
     dois perfis e os extras do config (result.moreTestimonials), sem repetir print */
  function depoimentosHtml(pf, Rr) {
    var Ps = C.profiles || {}, vistos = {}, lista = [];
    function soma(img, nome, texto) {
      if (!img && !texto) return;
      if (img && vistos[img]) return;
      if (img) vistos[img] = 1;
      lista.push({ img: img, nome: nome, texto: texto });
    }
    var P = Ps[pf] || {};
    soma(P.testimonialImage, P.testimonialName, P.testimonialText);
    ['R1', 'R2', 'R3'].forEach(function (k) { if (k !== pf && Ps[k]) soma(Ps[k].testimonialImage, Ps[k].testimonialName, Ps[k].testimonialText); });
    (Rr.moreTestimonials || []).forEach(function (t) { if (t) soma(t.image, t.name, t.text); });
    if (!lista.length) return '';
    var slides = lista.map(function (t) {
      return '<figure class="testi tslide">' + (t.img ? '<img src="' + esc(t.img) + '" alt="Depoimento de ' + esc(t.nome || '') + '" loading="lazy" decoding="async">' : '') +
        '<figcaption>' + (t.nome ? '<strong>' + esc(t.nome) + '</strong> · ' : '') + tpl(t.texto) + '</figcaption></figure>';
    }).join('');
    var dots = lista.length > 1 ? '<div class="tdots">' + lista.map(function (t, i) { return '<button type="button" data-i="' + i + '" aria-label="Depoimento ' + (i + 1) + ' de ' + lista.length + '"' + (i ? '' : ' class="on"') + '></button>'; }).join('') + '</div>' : '';
    return '<section class="tsec">' + (Rr.testimonialsTitle ? '<h2 class="h2">' + tpl(Rr.testimonialsTitle) + '</h2>' : '') + '<div class="tcar">' + slides + '</div>' + dots + '</section>';
  }
  function bindCarrossel() {
    var car = app.querySelector('.tcar'), dots = app.querySelectorAll('.tdots button');
    if (!car || !dots.length) return;
    var slides = car.querySelectorAll('.tslide'), raf = 0;
    function atual() {
      var meio = car.scrollLeft + car.clientWidth / 2, k = 0;
      slides.forEach(function (s, i) { if (s.offsetLeft <= meio) k = i; });
      dots.forEach(function (d, i) { d.classList.toggle('on', i === k); });
    }
    car.addEventListener('scroll', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(atual); }, { passive: true });
    dots.forEach(function (d) {
      d.onclick = function () { var s = slides[+d.dataset.i]; car.scrollTo({ left: s.offsetLeft - (car.clientWidth - s.offsetWidth) / 2, behavior: 'smooth' }); };
    });
  }

  function renderResult(offerOnly) {
    var Rr = C.result || {}, pf = perfil(), P = (C.profiles || {})[pf] || {}, k = calc();
    var h = '<div class="result">';
    if (!offerOnly) {
      h += '<section class="r-head"><h1>' + tpl(Rr.title) + '</h1>' +
        '<p class="r-perfil">' + tpl(Rr.profileLabel) + ' <strong>' + tpl(P.name) + '</strong></p>' +
        (P.support ? '<p class="r-support">' + tpl(P.support) + '</p>' : '') + '</section>';
      h += '<section class="nums">' +
        '<div class="row"><span>' + tpl(Rr.labelPassou) + '</span><b>R$' + money(k.renda * 12) + '</b></div>' +
        '<div class="row"><span>' + tpl(Rr.labelSobra) + '</span><b>' + esc((Rr.sobraDisplay || {})[k.sobraCode] || '') + '</b></div>' +
        '<div class="row"><span>' + tpl(Rr.labelMeta) + '</span><b>R$' + money(k.meta) + '</b></div>' +
        (k.gap > 0 ? '<div class="big"><span>' + tpl(Rr.labelGapAno) + '</span><b>R$' + money(k.gap * 12) + '</b></div>' : '<div class="big zero"><b>' + tpl(Rr.gapZero) + '</b></div>') +
        '<p class="disc">' + tpl(Rr.disclaimer) + '</p></section>';
      var fr = sentences();
      if (fr.length) h += '<section><h2 class="h2">' + tpl(Rr.betweenTitle) + '</h2><ul class="between">' + fr.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>' + (Rr.absolution ? '<p class="absol">' + tpl(Rr.absolution) + '</p>' : '') + '</section>';
      h += '<section><h2 class="h2">' + tpl(Rr.mechanismTitle) + '</h2>' + (Rr.mechanismIntro ? '<p class="mech-intro">' + tpl(Rr.mechanismIntro) + '</p>' : '') +
        '<div class="mech-items">' + (Rr.mechanism || []).map(function (m) { return '<div class="mech-item"><span class="ic">' + esc(m.icon || '•') + '</span><div><b>' + tpl(m.title) + '</b>' + tpl(m.text) + '</div></div>'; }).join('') + '</div></section>';
      if (Rr.future) h += '<section class="future"><p>' + tpl(Rr.future) + '</p></section>';
      h += depoimentosHtml(pf, Rr);
      var showGap = k.gap > 0, showDel = ['300a800', '800a1500', 'mais1500'].indexOf(code('delivery')) >= 0;
      if (showGap || showDel) h += '<section class="roi"><h2 class="h2">' + tpl(Rr.roiTitle) + '</h2>' + (showGap ? '<p>' + tpl(Rr.roiGap) + '</p>' : '') + (showDel ? '<p>' + tpl(Rr.roiDelivery) + '</p>' : '') + '</section>';
    }
    h += offerHtml();
    if (C.meta && C.meta.footer) h += '<p class="foot">' + tpl(C.meta.footer) + '</p>';
    h += '</div>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
    bindCheckout();
    bindCarrossel();
    if (!offerOnly) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ans: S.ans, nome: S.nome, ts: Date.now() })); } catch (e) { }
      dl({ event: 'quiz_result', quiz_id: QUIZ_ID, quiz_perfil: pf });
      beacon('resultado', true);
      notificacao();
    } else beacon('oferta_direta', true);
  }

  function bindCheckout() {
    var links = app.querySelectorAll('.js-checkout');
    function aplica() { var u = checkoutUrl(); links.forEach(function (a) { a.href = u; }); }
    setTimeout(aplica, 2500); /* depois do Pixel gravar o _fbp */
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        a.href = checkoutUrl();
        dl({ event: 'quiz_checkout_click', quiz_id: QUIZ_ID, quiz_perfil: perfil(), posicao: a.dataset.pos || '' });
        beacon('checkout_click', true);
      }, true);
    });
  }

  function openSaved() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && s.ans) { S.ans = s.ans; S.nome = s.nome || ''; renderResult(false); return; }
    } catch (e) { }
    renderResult(true);
  }

  /* ------------------------------------------------------------- prévia (admin) */
  var SAMPLES = {
    base: { nome: { text: 'Ana' }, renda: { code: 'r8a12', label: 'De R$8 mil a R$12 mil' }, sobra: { code: 'nada', label: 'Nada, zera certinho' }, ralos: { codes: ['cartao', 'delivery'] }, divida: { code: 'nao' }, reserva: { code: 'nada' }, fatura: { code: 'absurdo' }, sentir: { codes: ['segura', 'tranquila'] }, conquista: { codes: ['reserva', 'viajar'] }, delivery: { code: '300a800' } }
  };
  function sample(pf) {
    var a = JSON.parse(JSON.stringify(SAMPLES.base));
    if (pf === 'R2') a.divida = { code: 'rolando' };
    if (pf === 'R3') a.sobra = { code: '500a1500', label: 'De R$500 a R$1.500' };
    if (pf === 'ZERO') { a.renda = { code: 'r5', label: 'Até R$5 mil' }; a.sobra = { code: '1500a3000', label: 'De R$1.500 a R$3.000' }; }
    return a;
  }
  function previewShow(d) {
    C = d.config; applyTheme();
    /* na prévia a notificação aparece ao abrir o resultado, não a cada edição na mesma tela */
    if (d.screen !== previewShow.ult) NOTIF_VISTA = false;
    previewShow.ult = d.screen;
    S.ans = sample(d.perfil); S.nome = 'Ana'; S.hist = [];
    PREVIEW_HOLD = d.screen === 'analise';
    if (d.screen === '__resultado') { renderResult(false); return; }
    if (d.screen === '__oferta') { renderResult(false); var o = document.getElementById('oferta'); if (o) o.scrollIntoView(); return; }
    var idx = 0;
    C.screens.forEach(function (s, j) { if (s.id === d.screen) idx = j; });
    S.i = idx; if (idx > 0) S.hist = [idx - 1];
    render();
    /* prévia: a pergunta que tem notificação mostra ela na hora, com as respostas de exemplo */
    var nf = notifDoFluxo(d.screen), chave = nf ? d.screen + '|' + d.perfil + '|' + JSON.stringify(nf) : null;
    if (nf && chave !== previewShow.ultNf) setTimeout(function () { mostraNotifFluxo(nf); }, 400);
    previewShow.ultNf = chave;
  }

  /* ------------------------------------------------------------- boot */
  function boot(cfg) {
    C = cfg; applyTheme(); loadTracking(); S.i = 0; render();
  }
  if (PREVIEW) {
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin) return;
      var d = e.data || {};
      if (d.type === 'preview' && d.config) previewShow(d);
    });
    try { parent.postMessage({ type: 'preview-ready' }, location.origin); } catch (e) { }
  } else if (window.__CFG) {
    boot(window.__CFG); /* config já veio no HTML (Worker): capa sem esperar API */
  } else {
    fetch('/api/config', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { return fetch('config-default.json').then(function (r) { return r.json(); }); })
      .then(boot)
      .catch(function () { app.innerHTML = '<p style="padding:24px">Não consegui carregar a análise. Atualize a página.</p>'; });
  }
})();
