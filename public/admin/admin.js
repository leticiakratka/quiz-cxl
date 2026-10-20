/* Painel do Quiz Caixa Livre (Fluxo B)
 * Fluxo em blocos (estilo xQuiz) + editor por tela + prévia ao vivo + leads + funil + configurações.
 * O que se edita aqui é o RASCUNHO. O quiz no ar só muda quando clica em Publicar.
 */
(function () {
  'use strict';

  /* ================================================================ estado */
  var PW = sessionStorage.getItem('cxl_admin_pw') || '';
  var D = null;               // rascunho
  var PUB_AT = null, DRAFT_AT = null;
  var dirty = false, saving = false, autoTimer = null;
  var sel = 's:capa';
  var funnel = null;          // { step: n }
  var view = { x: 30, y: 30, k: 0.9 };
  var pvReady = false, pvTimer = null;
  var lastFocus = null;

  var TYPES = {
    cover: { label: 'Capa', color: '#8B5CF6', icon: '★' },
    single: { label: 'Escolha única', color: '#1FA34A', icon: '◉' },
    multi: { label: 'Múltipla escolha', color: '#0EA5E9', icon: '☑' },
    input: { label: 'Campo (nome)', color: '#F59E0B', icon: '✎' },
    statement: { label: 'Frase pra concordar', color: '#EC4899', icon: '❝' },
    milestone: { label: 'Marco', color: '#D4A544', icon: '◆' },
    testimonial: { label: 'Depoimento', color: '#0F766E', icon: '❤' },
    capture: { label: 'Captura', color: '#EF4444', icon: '✉' },
    loading: { label: 'Carregando', color: '#64748B', icon: '⏳' },
    rules: { label: 'Regras do perfil', color: '#334155', icon: '⑂' },
    profile: { label: 'Perfil', color: '#7C3AED', icon: '●' },
    result: { label: 'Resultado', color: '#178A3D', icon: '▤' },
    offer: { label: 'Oferta', color: '#B45309', icon: '$' }
  };
  var VARS = ['nome', 'passou_12m', 'meta_30', 'gap_mes', 'gap_ano', 'sobra_hoje', 'ralos', 'gastos_lista', 'conquista', 'sentir'];
  var IMAGES = ['img/leticia-rosto.webp', 'img/leticia-bio.webp', 'img/leticia-sobre.webp','img/mockup.webp', 'img/depoimentos/eloisa-quiz.webp', 'img/depoimentos/andressa-quiz.webp', 'img/depoimentos/andressa.webp', 'img/depoimentos/eloisa.webp', 'img/depoimentos/jhenifer.webp', 'img/depoimentos/tati.webp', 'img/depoimentos/endine.webp', 'img/depoimentos/francisco.webp'];
  var THEMES = {
    leticia: { preset: 'leticia', primary: '#1FA34A', primaryDark: '#178A3D', accent: '#D4A544', bg: '#FFFFFF', soft: '#F7F1E7', text: '#1B1512', muted: '#6E655E', border: '#E6DCCB' },
    facescan: { preset: 'facescan', primary: '#0B0B12', primaryDark: '#000000', accent: '#0B0B12', bg: '#FFFFFF', soft: '#F4F4F5', text: '#0B0B12', muted: '#6B7280', border: '#E5E7EB' }
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, p, v) { var ks = p.split('.'); var a = o; for (var i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; }
  function plain(s) { return String(s || '').replace(/\*\*/g, '').replace(/\{\{\s*(\w+)\s*\}\}/g, '[$1]'); }
  function fmtDate(iso) { if (!iso) return '—'; var d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

  /* ================================================================ api */
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Authorization': 'Bearer ' + PW };
    if (opts.body && typeof opts.body !== 'string') { opts.body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body }).then(function (r) {
      if (r.status === 401) { logout(); throw new Error('Senha inválida'); }
      var ct = r.headers.get('content-type') || '';
      var p = ct.indexOf('json') >= 0 ? r.json() : r.text();
      return p.then(function (d) { if (!r.ok) throw new Error((d && d.erro) || ('Erro ' + r.status)); return d; });
    });
  }

  function toast(msg, err) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, err ? 5000 : 2600);
  }

  /* ================================================================ login */
  function showLogin(msg) {
    $('#shell').hidden = true; $('#login').hidden = false;
    var e = $('#login-err'); e.hidden = !msg; e.textContent = msg || '';
    setTimeout(function () { $('#login-pw').focus(); }, 50);
  }
  function logout() { sessionStorage.removeItem('cxl_admin_pw'); PW = ''; showLogin(); }
  $('#login-form').onsubmit = function (ev) {
    ev.preventDefault();
    PW = $('#login-pw').value;
    api('/api/admin/login', { method: 'POST' }).then(function () {
      sessionStorage.setItem('cxl_admin_pw', PW); start();
    }).catch(function (e) { showLogin(e.message === 'Senha inválida' ? 'Senha incorreta.' : e.message); });
  };
  $('#btn-logout').onclick = function () { if (dirty && !confirmLeave()) return; logout(); };
  function confirmLeave() { return true; }

  /* ================================================================ boot */
  function start() {
    $('#login').hidden = true; $('#shell').hidden = false;
    api('/api/admin/config').then(function (d) {
      D = d.draft; DRAFT_AT = d.draftUpdatedAt; PUB_AT = d.publishedAt;
      setStatus();
      renderLegend(); renderAll(); fit();
      loadFunnel(true);
    }).catch(function (e) { toast(e.message, true); });
  }

  /* ================================================================ status / salvar / publicar */
  function setStatus(txt, cls) {
    var s = $('#status');
    if (txt) { s.textContent = txt; s.className = 'status ' + (cls || ''); return; }
    if (dirty) { s.textContent = 'Alterações não salvas'; s.className = 'status dirty'; }
    else s.textContent = 'Rascunho salvo ' + (DRAFT_AT ? fmtDate(DRAFT_AT).split(' ')[1] : '') + (PUB_AT ? ' · publicado ' + fmtDate(PUB_AT) : ' · nunca publicado'), s.className = 'status ok';
  }
  function markDirty() {
    dirty = true; setStatus();
    clearTimeout(autoTimer); autoTimer = setTimeout(function () { save(true); }, 3500);
    schedulePreview();
  }
  function save(auto) {
    if (saving || !dirty) return Promise.resolve();
    saving = true; setStatus('Salvando…');
    return api('/api/admin/config', { method: 'PUT', body: D }).then(function (r) {
      dirty = false; DRAFT_AT = r.draftUpdatedAt; saving = false; setStatus();
      if (!auto) toast('Rascunho salvo');
    }).catch(function (e) { saving = false; setStatus('Erro ao salvar', 'dirty'); toast(e.message, true); throw e; });
  }
  $('#btn-save').onclick = function () { if (!dirty) { toast('Nada novo pra salvar'); return; } save(false); };
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) save(false); }
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  $('#btn-publish').onclick = function () {
    var w = checks();
    modal('<h3>Publicar no quiz?</h3><p>O rascunho atual vai substituir o que está no ar. Quem abrir o quiz depois disso já vê a versão nova.</p>' +
      (w.length ? '<div class="ed-note" style="margin-top:12px;color:#7A4E00;background:#FFF4E0"><b>Atenção:</b><ul>' + w.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<textarea id="pub-note" placeholder="Anotação dessa versão (opcional), ex.: troquei a frase da capa"></textarea>' +
      '<div class="modal-acts"><button class="b" data-close>Cancelar</button><button class="b b-pri" id="pub-go">Publicar agora</button></div>');
    $('#pub-go').onclick = function () {
      var note = $('#pub-note').value; closeModal();
      var p = dirty ? save(true) : Promise.resolve();
      p.then(function () { return api('/api/admin/publish', { method: 'POST', body: { note: note } }); })
        .then(function (r) { PUB_AT = r.publishedAt; setStatus(); toast('Publicado! O quiz no ar já está com essa versão.'); if (!$('#v-config').hidden) renderConfig(); })
        .catch(function (e) { toast(e.message, true); });
    };
  };

  /* ================================================================ abas */
  $('#tabs').onclick = function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    $$('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
    ['fluxo', 'leads', 'funil', 'config'].forEach(function (t) { $('#v-' + t).hidden = t !== b.dataset.tab; });
    if (b.dataset.tab === 'leads') loadLeads(1);
    if (b.dataset.tab === 'funil') loadFunnel(false);
    if (b.dataset.tab === 'config') renderConfig();
    if (b.dataset.tab === 'fluxo') { renderCanvas(); }
  };

  /* ================================================================ nós do fluxo */
  function nodes() {
    var list = D.screens.map(function (s, i) { return { key: 's:' + s.id, kind: 'screen', s: s, idx: i }; });
    list.push({ key: 'rules', kind: 'rules' });
    ['R1', 'R2', 'R3'].forEach(function (k) { list.push({ key: 'p:' + k, kind: 'profile', pk: k }); });
    list.push({ key: 'result', kind: 'result' });
    list.push({ key: 'offer', kind: 'offer' });
    return list;
  }
  function nodeByKey(k) { return nodes().filter(function (n) { return n.key === k; })[0]; }
  function typeOf(n) { return n.kind === 'screen' ? TYPES[n.s.type] || TYPES.single : TYPES[n.kind]; }

  var NW = 228, NH = 120, GX = 60, GY = 70, COLS = 5, PH = 78, PG = 14;
  /* order: ordem das telas a desenhar (padrão D.screens; durante o arrasta-e-solta é a ordem provisória) */
  function layout(order) {
    order = order || D.screens;
    var pos = {};
    order.forEach(function (s, i) {
      var r = Math.floor(i / COLS), c = i % COLS;
      pos['s:' + s.id] = { x: c * (NW + GX), y: r * (NH + GY), w: NW, h: NH };
    });
    var by = (Math.floor((order.length - 1) / COLS) + 1) * (NH + GY) + 10;
    pos.rules = { x: 0, y: by + PH + PG - (NH - PH) / 2, w: NW, h: NH };
    ['R1', 'R2', 'R3'].forEach(function (k, j) { pos['p:' + k] = { x: NW + GX, y: by + j * (PH + PG), w: NW, h: PH }; });
    pos.result = { x: 2 * (NW + GX), y: pos.rules.y, w: NW, h: NH };
    pos.offer = { x: 3 * (NW + GX), y: pos.rules.y, w: NW, h: NH };
    return pos;
  }
  function edges(order) {
    order = order || D.screens;
    var e = [];
    for (var i = 0; i < order.length - 1; i++) e.push(['s:' + order[i].id, 's:' + order[i + 1].id]);
    e.push(['s:' + order[order.length - 1].id, 'rules']);
    ['R1', 'R2', 'R3'].forEach(function (k) { e.push(['rules', 'p:' + k, 1]); e.push(['p:' + k, 'result', 1]); });
    e.push(['result', 'offer']);
    return e;
  }
  function edgePath(a, b) {
    if (Math.abs(a.y - b.y) < 2 && b.x > a.x) { var y = a.y + a.h / 2; return 'M' + (a.x + a.w) + ',' + y + ' L' + (b.x - 8) + ',' + y; }
    if (b.x >= a.x + a.w) {
      var x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x - 8, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
      return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
    }
    var sx = a.x + a.w / 2, sy = a.y + a.h, ex = b.x + b.w / 2, ey = b.y - 8, my = sy + (ey - sy) / 2;
    return 'M' + sx + ',' + sy + ' V' + my + ' H' + ex + ' V' + ey;
  }

  function usesVars(s) {
    var txt = JSON.stringify(s), out = [];
    VARS.forEach(function (v) { if (txt.indexOf('{{' + v + '}}') >= 0) out.push(v); });
    return out;
  }
  function nodeTitle(n) {
    if (n.kind === 'screen') return plain(n.s.title || n.s.quote || n.s.id);
    if (n.kind === 'rules') return 'Define R1, R2 ou R3 pelas respostas';
    if (n.kind === 'profile') return n.pk + ' · ' + plain((D.profiles[n.pk] || {}).name);
    if (n.kind === 'result') return plain(D.result.title);
    if (n.kind === 'offer') return plain(D.offer.title) + ' · ' + plain(D.offer.priceCash);
    return '';
  }
  function metricFor(n) {
    if (!funnel || !$('#show-nums').checked) return '';
    var base = funnel.capa || 0; if (!base) return '';
    var step = n.kind === 'screen' ? n.s.id : (n.kind === 'result' ? 'resultado' : (n.kind === 'offer' ? 'checkout_click' : null));
    if (!step) return '';
    var v = funnel[step] || 0, pct = Math.round(v / base * 100);
    return '<span class="metric' + (pct < 35 ? ' low' : '') + '" title="' + (n.kind === 'offer' ? 'Cliques no botão de compra' : 'Sessões que chegaram aqui') + '">' + v + ' · ' + pct + '%</span>';
  }
  function nodeHtml(n, p) {
    var t = typeOf(n), num = n.kind === 'screen' ? (n.idx + 1) : (n.kind === 'profile' ? n.pk : '•');
    var tags = '';
    if (n.kind === 'screen') {
      var s = n.s;
      if (s.locked) tags += '<span class="tag" title="Tela usada nas regras ou nos cálculos: dá pra editar o texto, não dá pra excluir">lógica</span>';
      if (s.calc) tags += '<span class="tag calc">cálculo</span>';
      if (s.tip) tags += '<span class="tag tip">dica</span>';
      if (usesVars(s).length) tags += '<span class="tag var">{{' + usesVars(s)[0] + '}}</span>';
      if (s.options) tags += '<span class="tag">' + s.options.length + ' opções</span>';
    }
    var arrasta = n.kind === 'screen' && movable(n.s) ? ' data-drag="1" title="Arraste pra mudar a ordem"' : '';
    return '<div class="node' + (sel === n.key ? ' sel' : '') + '" data-key="' + esc(n.key) + '"' + arrasta + ' style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + p.w + 'px;height:' + p.h + 'px;--c:' + t.color + '">' +
      '<div class="n-top"><span class="n-num">' + esc(num) + '</span><span class="n-type">' + t.icon + ' ' + esc(t.label) + '</span>' + (n.kind === 'screen' && n.s.locked ? '<span class="n-lock">🔒</span>' : '') + '</div>' +
      '<div class="n-title">' + esc(nodeTitle(n)) + '</div>' +
      '<div class="n-foot">' + tags + metricFor(n) + '</div></div>';
  }

  function drawEdges(order, pos) {
    var maxX = 0, maxY = 0;
    Object.keys(pos).forEach(function (k) { maxX = Math.max(maxX, pos[k].x + pos[k].w); maxY = Math.max(maxY, pos[k].y + pos[k].h); });
    var svg = '<defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#B9AE9F"/></marker></defs>';
    edges(order).forEach(function (e) { var a = pos[e[0]], b = pos[e[1]]; if (a && b) svg += '<path class="' + (e[2] ? 'branch' : '') + '" d="' + edgePath(a, b) + '" marker-end="url(#arw)"/>'; });
    var edgesEl = $('#edges'); edgesEl.setAttribute('width', maxX + 40); edgesEl.setAttribute('height', maxY + 40); edgesEl.innerHTML = svg;
  }
  function renderCanvas() {
    if (!D) return;
    var pos = layout(), html = '';
    nodes().forEach(function (n) { html += nodeHtml(n, pos[n.key]); });
    $('#nodes').innerHTML = html + '<div class="drop-ph" id="drop-ph" hidden></div>';
    drawEdges(D.screens, pos);
    applyView();
    renderWarnings();
  }
  function updateNode(key) {
    var el = $('.node[data-key="' + key + '"]'), n = nodeByKey(key); if (!el || !n) return;
    var p = layout()[key]; var tmp = document.createElement('div'); tmp.innerHTML = nodeHtml(n, p);
    el.replaceWith(tmp.firstChild);
  }
  function renderLegend() {
    $('#legend').innerHTML = ['single', 'multi', 'statement', 'milestone', 'testimonial', 'input', 'capture', 'loading', 'profile', 'result', 'offer'].map(function (k) {
      return '<span><i style="background:' + TYPES[k].color + '"></i>' + TYPES[k].label + '</span>';
    }).join('');
  }

  /* pan + zoom */
  function applyView() { $('#world').style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')'; $('#zoom').textContent = Math.round(view.k * 100) + '%'; }
  function zoomAt(f, cx, cy) {
    var k2 = Math.min(1.6, Math.max(0.3, view.k * f));
    view.x = cx - (cx - view.x) * (k2 / view.k); view.y = cy - (cy - view.y) * (k2 / view.k); view.k = k2; applyView();
  }
  function fit() {
    var pos = layout(), maxX = 0, maxY = 0;
    Object.keys(pos).forEach(function (k) { maxX = Math.max(maxX, pos[k].x + pos[k].w); maxY = Math.max(maxY, pos[k].y + pos[k].h); });
    var c = $('#canvas').getBoundingClientRect();
    view.k = Math.min(1.1, Math.max(0.3, Math.min((c.width - 50) / maxX, (c.height - 90) / maxY)));
    view.x = 24; view.y = 20; applyView();
  }
  /* ================================================================ arrastar e soltar
     - fundo do canvas: move a visão
     - tela: muda a ordem (as outras abrem espaço; soltar na lixeira exclui)
     - bloco da paleta: cria tela nova onde soltar (clique simples cria depois da selecionada)
     Capa e carregamento ficam fixos no começo e no fim. Esc cancela. */
  function movable(s) { return !!s && s.type !== 'cover' && s.type !== 'loading'; }
  function toWorld(cx, cy) {
    var r = $('#canvas').getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k, inside: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom };
  }
  /* onde entra o item, na lista "rest" (as telas sem o item arrastado), pelo ponto do mundo:
     linha pela altura, coluna por quantos centros de card ficaram à esquerda do ponteiro */
  function slotIndex(rest, w) {
    var row = Math.max(0, Math.floor(w.y / (NH + GY)));
    var col = Math.max(0, Math.min(COLS, Math.floor((w.x - NW / 2) / (NW + GX)) + 1));
    return Math.max(1, Math.min(rest.length - 1, row * COLS + col));
  }
  function reflow(order, phKey) {
    var pos = layout(order), ph = $('#drop-ph');
    $$('#nodes .node').forEach(function (el) {
      if (el.classList.contains('dragging')) return;
      var p = pos[el.dataset.key]; if (p) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
    });
    var pp = phKey && pos[phKey];
    if (pp) { ph.hidden = false; ph.style.cssText = 'left:' + pp.x + 'px;top:' + pp.y + 'px;width:' + pp.w + 'px;height:' + pp.h + 'px'; } else ph.hidden = true;
    drawEdges(order, pos);
  }
  function askDelete(n) {
    modal('<h3>Excluir a tela ' + (n.idx + 1) + '?</h3><p>' + esc(plain(n.s.title || n.s.quote)) + '</p><p>Isso só vale no rascunho até você publicar.</p><div class="modal-acts"><button class="b" data-close>Cancelar</button><button class="b b-pri" id="del-go" style="background:#C2413A;border-color:#C2413A">Excluir</button></div>');
    $('#del-go').onclick = function () {
      D.screens.splice(n.idx, 1); closeModal(); markDirty();
      var nx = D.screens[Math.min(n.idx, D.screens.length - 1)]; renderCanvas(); select('s:' + nx.id);
    };
  }

  (function dragDrop() {
    var cv = $('#canvas'), trash = $('#trash'), g = null, autoRaf = 0;
    $('#palette').innerHTML = '<span class="pal-hint">Arraste pro fluxo:</span>' + ['single', 'multi', 'statement', 'milestone', 'testimonial'].map(function (t) {
      return '<button type="button" class="pal-item" data-type="' + t + '" style="--c:' + TYPES[t].color + '" title="Arraste pro ponto do fluxo onde a tela deve entrar, ou clique pra criar logo depois da tela selecionada">' + TYPES[t].icon + ' ' + TYPES[t].label + '</button>';
    }).join('') + '<span class="pal-hint pal-tip">Arraste as telas pra mudar a ordem · solte na lixeira pra excluir</span>';

    function overTrash(e) { var r = trash.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }
    function begin(e) {
      g.started = true; document.body.classList.add('dragging-any');
      if (g.kind === 'pan') { cv.classList.add('panning'); return; }
      $('#world').classList.add('reflow');
      if (g.kind === 'move') {
        g.el.classList.add('dragging');
        g.rest = D.screens.filter(function (s) { return s !== g.item; });
        trash.classList.add('show'); trash.classList.toggle('no', !!g.item.locked);
        trash.textContent = g.item.locked ? '🔒 Essa tela entra nas regras e não pode ser excluída' : '🗑 Solte aqui pra excluir';
      } else {
        g.rest = D.screens.slice();
        g.ghost = document.createElement('div'); g.ghost.className = 'drag-ghost'; g.ghost.style.setProperty('--c', TYPES[g.type].color);
        g.ghost.textContent = TYPES[g.type].icon + ' ' + TYPES[g.type].label; document.body.appendChild(g.ghost);
      }
    }
    function track(e) {
      var w = toWorld(e.clientX, e.clientY);
      if (g.kind === 'move') {
        g.el.style.left = (w.x - g.dx) + 'px'; g.el.style.top = (w.y - g.dy) + 'px';
        var lixo = overTrash(e); trash.classList.toggle('over', lixo);
        var t = slotIndex(g.rest, w);
        if (t !== g.t) { g.t = t; g.order = g.rest.slice(); g.order.splice(t, 0, g.item); reflow(g.order, g.key); }
      } else {
        g.ghost.style.left = e.clientX + 'px'; g.ghost.style.top = e.clientY + 'px';
        if (w.inside) {
          var t2 = slotIndex(g.rest, w);
          if (t2 !== g.t) { g.t = t2; g.order = g.rest.slice(); g.order.splice(t2, 0, { id: '__novo', type: g.type }); reflow(g.order, 's:__novo'); }
        } else if (g.t != null) { g.t = null; g.order = null; reflow(D.screens, null); }
      }
    }
    /* perto da borda do canvas a visão rola sozinha, pra dar pra arrastar até telas fora da tela */
    function autoPan() {
      if (!g || !g.started || g.kind === 'pan' || !g.last) return;
      var r = cv.getBoundingClientRect(), m = 50, sp = 14, vx = 0, vy = 0, e = g.last;
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        if (e.clientX < r.left + m) vx = sp; else if (e.clientX > r.right - m) vx = -sp;
        if (e.clientY < r.top + m) vy = sp; else if (e.clientY > r.bottom - m) vy = -sp;
      }
      if (vx || vy) { view.x += vx; view.y += vy; applyView(); track(e); }
      autoRaf = requestAnimationFrame(autoPan);
    }
    function finish(cancel) {
      cancelAnimationFrame(autoRaf);
      document.body.classList.remove('dragging-any'); cv.classList.remove('panning'); $('#world').classList.remove('reflow');
      trash.classList.remove('show', 'over', 'no');
      var s = g; g = null;
      if (s.ghost) s.ghost.remove();
      if (!s.started) { if (s.kind === 'move' || s.kind === 'click') select(s.key); else if (s.kind === 'new') addAfterSelected(s.type); return; }
      if (s.kind === 'pan') return;
      if (cancel) { renderCanvas(); return; }
      if (s.kind === 'move') {
        if (s.dropTrash) {
          renderCanvas();
          if (s.item.locked) toast('Essa tela entra nas regras ou nos cálculos e não pode ser excluída.', true);
          else askDelete(nodeByKey(s.key));
          return;
        }
        var antes = D.screens.indexOf(s.item);
        if (s.order && s.order.indexOf(s.item) !== antes) { D.screens = s.order; markDirty(); }
        renderCanvas(); select(s.key);
      } else {
        if (s.order) {
          var nova = TEMPLATES[s.type]();
          D.screens.splice(s.t, 0, nova); markDirty(); renderCanvas(); select('s:' + nova.id);
          toast('Tela nova criada. Edite o texto ao lado.');
        } else renderCanvas();
      }
    }

    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || g) return;
      var el = e.target.closest ? e.target.closest('.node') : null;
      if (el && el.dataset.drag) {
        var p = toWorld(e.clientX, e.clientY), n = nodeByKey(el.dataset.key);
        g = { kind: 'move', key: el.dataset.key, el: el, item: n.s, dx: p.x - parseFloat(el.style.left), dy: p.y - parseFloat(el.style.top), sx: e.clientX, sy: e.clientY, t: D.screens.indexOf(n.s) };
      } else if (el) {
        g = { kind: 'click', key: el.dataset.key, sx: e.clientX, sy: e.clientY };
      } else {
        g = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      }
    });
    $('#palette').addEventListener('pointerdown', function (e) {
      var it = e.target.closest('.pal-item'); if (!it || e.button !== 0 || g) return;
      e.preventDefault();
      g = { kind: 'new', type: it.dataset.type, sx: e.clientX, sy: e.clientY, t: null };
    });
    window.addEventListener('pointermove', function (e) {
      if (!g) return;
      var dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.started) {
        if (Math.abs(dx) + Math.abs(dy) < 5) return;
        if (g.kind === 'click') { g.kind = 'pan'; g.vx = view.x; g.vy = view.y; }
        begin(e); if (g.kind !== 'pan') { autoRaf = requestAnimationFrame(autoPan); }
      }
      g.last = e;
      if (g.kind === 'pan') { view.x = g.vx + dx; view.y = g.vy + dy; applyView(); return; }
      track(e);
    });
    window.addEventListener('pointerup', function (e) {
      if (!g) return;
      if (g.kind === 'move' && g.started) g.dropTrash = overTrash(e);
      if (g.kind === 'new' && g.started && !toWorld(e.clientX, e.clientY).inside) g.order = null;
      finish(false);
    });
    window.addEventListener('pointercancel', function () { if (g) finish(true); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && g && g.started) finish(true); });

    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = cv.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? 1.08 : 0.92, e.clientX - r.left, e.clientY - r.top);
      else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
    }, { passive: false });
  })();

  function select(key) {
    sel = key;
    $$('.node').forEach(function (n) { n.classList.toggle('sel', n.dataset.key === key); });
    renderEditor(); updateToolbar(); schedulePreview(true);
  }
  function updateToolbar() {
    var n = nodeByKey(sel), isScreen = n && n.kind === 'screen', s = isScreen ? n.s : null;
    var fixed = s && (s.type === 'cover' || s.type === 'loading');
    $('[data-act=dup-screen]').disabled = !isScreen || !!(s && s.locked);
    $('[data-act=del-screen]').disabled = !isScreen || !!(s && s.locked);
    $('[data-act=move-up]').disabled = !isScreen || fixed || n.idx <= 1;
    $('[data-act=move-down]').disabled = !isScreen || fixed || n.idx >= D.screens.length - 2;
  }

  /* ================================================================ checagens */
  function idxOf(id) { for (var i = 0; i < D.screens.length; i++) if (D.screens[i].id === id) return i; return -1; }
  function checks() {
    var w = [], iNome = idxOf('nome'), iRenda = idxOf('renda'), iSobra = idxOf('sobra');
    D.screens.forEach(function (s, i) {
      var v = usesVars(s);
      if (v.indexOf('nome') >= 0 && i <= iNome) w.push('Tela ' + (i + 1) + ' usa {{nome}} antes da pergunta do nome.');
      if ((v.indexOf('passou_12m') >= 0 || v.indexOf('meta_30') >= 0) && i <= iRenda) w.push('Tela ' + (i + 1) + ' usa um valor da renda antes da pergunta da renda.');
      if ((v.indexOf('gap_mes') >= 0 || v.indexOf('gap_ano') >= 0) && (i <= iRenda || i <= iSobra)) w.push('Tela ' + (i + 1) + ' usa a diferença antes das perguntas de renda e sobra.');
      if ((v.indexOf('gastos_lista') >= 0 || v.indexOf('ralos') >= 0) && i <= idxOf('ralos')) w.push('Tela ' + (i + 1) + ' usa o que a pessoa marcou em "onde o dinheiro escapa" antes dessa pergunta.');
      if (s.options && !s.options.length) w.push('Tela ' + (i + 1) + ' está sem opções.');
    });
    if (D.screens[0].type !== 'cover') w.push('A capa precisa ser a primeira tela.');
    if (D.screens[D.screens.length - 1].type !== 'loading') w.push('A tela de carregamento precisa ser a última.');
    if (idxOf('captura') > idxOf('analise')) w.push('A captura precisa vir antes da análise.');
    if (!/^https:\/\//.test(D.meta.checkoutUrl || '')) w.push('Link do checkout vazio ou sem https (aba Configurações).');
    /* regra do funil: o nome do produto só aparece na oferta */
    D.screens.forEach(function (s, i) { if (/caixa\s*livre/i.test(JSON.stringify(s))) w.push('Tela ' + (i + 1) + ' cita "Caixa Livre". O nome do produto só pode aparecer na oferta.'); });
    ['R1', 'R2', 'R3'].forEach(function (k) { if (/caixa\s*livre/i.test(JSON.stringify(D.profiles[k] || {}))) w.push('Perfil ' + k + ' cita "Caixa Livre" (aparece antes da oferta).'); });
    if (/caixa\s*livre/i.test(JSON.stringify(D.result || {}))) w.push('A tela de resultado cita "Caixa Livre" antes da oferta.');
    if (D.screens.some(function (s) { return s.type === 'testimonial' && /andressa\.webp|eloisa\.webp|endine/.test(s.image || ''); })) w.push('Um depoimento do meio do fluxo usa print que mostra o nome do produto. Use as versões "-quiz".');
    return w;
  }
  function renderWarnings() {
    var w = checks(), el = $('#warn');
    el.hidden = !w.length;
    el.innerHTML = w.length ? '<b>Revise antes de publicar:</b><ul>' + w.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
  }

  /* ================================================================ ações do canvas */
  $('.canvas-tools').onclick = function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var a = b.dataset.act, c = $('#canvas').getBoundingClientRect();
    if (a === 'zoom-in') zoomAt(1.15, c.width / 2, c.height / 2);
    if (a === 'zoom-out') zoomAt(0.87, c.width / 2, c.height / 2);
    if (a === 'zoom-fit') fit();
    if (a === 'add-screen') addScreen();
    if (a === 'dup-screen') dupScreen();
    if (a === 'del-screen') delScreen();
    if (a === 'move-up') moveScreen(-1);
    if (a === 'move-down') moveScreen(1);
  };
  $('#show-nums').onchange = function () { renderCanvas(); };

  function newId(base) { var id; do { id = base + '_' + Math.random().toString(36).slice(2, 6); } while (idxOf(id) >= 0); return id; }
  var TEMPLATES = {
    single: function () { return { id: newId('pergunta'), type: 'single', title: 'Nova pergunta', help: '', options: [{ code: 'a', emoji: '🙂', label: 'Opção 1' }, { code: 'b', emoji: '🤔', label: 'Opção 2' }] }; },
    multi: function () { return { id: newId('multipla'), type: 'multi', title: 'Nova pergunta de múltipla escolha', help: 'Marca quantas quiser.', button: 'Continuar', options: [{ code: 'a', emoji: '', label: 'Opção 1' }, { code: 'b', emoji: '', label: 'Opção 2' }] }; },
    statement: function () { return { id: newId('frase'), type: 'statement', quote: 'Nova frase pra concordar.', question: 'Você concorda com essa frase?', answers: ['SIM', 'NÃO', 'MAIS OU MENOS'], caption: '' }; },
    milestone: function () { return { id: newId('marco'), type: 'milestone', title: '{{nome}}, novo marco.', text: 'Texto do marco.', textAlt: '', button: 'Continuar' }; },
    testimonial: function () { return { id: newId('depo'), type: 'testimonial', kicker: 'Ela também começou assim', title: 'Nome da aluna e a virada dela.', text: 'Como ela estava antes e o que mudou, com **o número em negrito**.', image: 'img/depoimentos/jhenifer.webp', caption: 'Conversa dela comigo no WhatsApp', button: 'Continuar' }; }
  };
  function addScreen() {
    var n = nodeByKey(sel);
    var at = n && n.kind === 'screen' ? n.idx + 1 : D.screens.length - 2;
    at = Math.max(1, Math.min(at, D.screens.length - 1));
    modal('<h3>Nova tela</h3><p>Ela entra logo depois da tela selecionada.</p><div class="type-grid">' +
      [['single', 'Escolha única', 'Uma resposta, avança sozinha'], ['multi', 'Múltipla escolha', 'Marca várias e continua'], ['statement', 'Frase pra concordar', 'SIM · NÃO · MAIS OU MENOS'], ['milestone', 'Marco', 'Texto de virada com o nome'], ['testimonial', 'Depoimento', 'Quebra com história e print de aluna']].map(function (t) {
        return '<button data-type="' + t[0] + '"><b>' + TYPES[t[0]].icon + ' ' + t[1] + '</b><small>' + t[2] + '</small></button>';
      }).join('') + '</div><div class="modal-acts"><button class="b" data-close>Cancelar</button></div>');
    $$('.type-grid button').forEach(function (b) {
      b.onclick = function () {
        var s = TEMPLATES[b.dataset.type]();
        D.screens.splice(at, 0, s); closeModal(); markDirty(); renderCanvas(); select('s:' + s.id);
      };
    });
  }
  function dupScreen() {
    var n = nodeByKey(sel); if (!n || n.kind !== 'screen' || n.s.locked) return;
    var c = clone(n.s); c.id = newId(n.s.id.replace(/_[a-z0-9]{4}$/, '')); delete c.locked; delete c.lockedOptions; delete c.calc;
    D.screens.splice(n.idx + 1, 0, c); markDirty(); renderCanvas(); select('s:' + c.id);
  }
  function delScreen() {
    var n = nodeByKey(sel); if (!n || n.kind !== 'screen' || n.s.locked) return;
    askDelete(n);
  }
  /* clique simples num bloco da paleta: cria a tela logo depois da selecionada */
  function addAfterSelected(type) {
    var n = nodeByKey(sel);
    var at = n && n.kind === 'screen' ? n.idx + 1 : D.screens.length - 1;
    at = Math.max(1, Math.min(at, D.screens.length - 1));
    var s = TEMPLATES[type]();
    D.screens.splice(at, 0, s); markDirty(); renderCanvas(); select('s:' + s.id);
    toast('Tela nova criada depois da selecionada. Dá pra arrastar pra outro lugar.');
  }
  function moveScreen(dir) {
    var n = nodeByKey(sel); if (!n || n.kind !== 'screen') return;
    var j = n.idx + dir; if (j < 1 || j > D.screens.length - 2) return;
    var t = D.screens[j]; D.screens[j] = D.screens[n.idx]; D.screens[n.idx] = t;
    markDirty(); renderCanvas(); select(sel);
  }

  /* ================================================================ editor */
  function chips() { return '<div class="chips">' + VARS.map(function (v) { return '<button type="button" class="chip" data-ins="{{' + v + '}}">{{' + v + '}}</button>'; }).join('') + '</div>'; }
  function fText(label, path, opt) {
    opt = opt || {};
    var v = getPath(D, path); v = v == null ? '' : v;
    var field = opt.area ? '<textarea data-path="' + path + '" rows="' + (opt.rows || 3) + '">' + esc(v) + '</textarea>'
      : '<input data-path="' + path + '"' + (opt.num ? ' type="number" data-num="1"' : '') + ' value="' + esc(v) + '"' + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : '') + '>';
    return '<label class="f"><span>' + label + '</span>' + field + (opt.vars ? chips() : '') + (opt.hint ? '<small>' + opt.hint + '</small>' : '') + '</label>';
  }
  function fImage(label, path) {
    var v = getPath(D, path) || '';
    var opts = IMAGES.indexOf(v) < 0 && v ? ['<option selected>' + esc(v) + '</option>'] : [];
    return '<label class="f"><span>' + label + '</span><select data-path="' + path + '"><option value="">(sem imagem)</option>' +
      opts.join('') + IMAGES.map(function (i) { return '<option' + (i === v ? ' selected' : '') + '>' + i + '</option>'; }).join('') +
      '</select><input data-path="' + path + '" value="' + esc(v) + '" placeholder="ou cole um link https://..." style="margin-top:6px">' +
      (v ? '<img class="thumb" src="/' + esc(v.replace(/^\//, '')) + '" onerror="this.src=\'' + esc(v) + '\'" alt="">' : '') + '</label>';
  }
  function listEditor(label, path, opt) {
    opt = opt || {};
    var arr = getPath(D, path) || [];
    return '<div class="f"><span>' + label + '</span>' + arr.map(function (v, i) {
      return '<div class="list-row">' + (opt.area ? '<textarea data-path="' + path + '.' + i + '" rows="2">' + esc(v) + '</textarea>' : '<input data-path="' + path + '.' + i + '" value="' + esc(v) + '">') +
        '<div class="acts"><button class="ib" data-act="list-up" data-path="' + path + '" data-i="' + i + '" title="Subir">↑</button><button class="ib del" data-act="list-del" data-path="' + path + '" data-i="' + i + '" title="Remover">✕</button></div></div>';
    }).join('') + '<button class="add" data-act="list-add" data-path="' + path + '" data-tpl=\'' + JSON.stringify(opt.tpl == null ? '' : opt.tpl) + '\'>+ adicionar</button>' + (opt.hint ? '<small>' + opt.hint + '</small>' : '') + '</div>';
  }
  function optionsEditor(s, i) {
    var base = 'screens.' + i + '.options', locked = s.lockedOptions;
    var h = '<div class="ed-sec"><h4>Opções</h4>' + (locked ? '<div class="ed-note">Essas opções alimentam as regras ou os cálculos. Dá pra mudar texto, emoji' + (s.calc ? ' e o valor usado na conta' : '') + ', mas não dá pra adicionar ou tirar opção. O código cinza é o que as regras leem.</div>' : '');
    h += s.options.map(function (o, j) {
      return '<div class="opt-row"><input class="emo" data-path="' + base + '.' + j + '.emoji" value="' + esc(o.emoji || '') + '" placeholder="emoji">' +
        '<div class="opt-main"><input data-path="' + base + '.' + j + '.label" value="' + esc(o.label) + '">' +
        ('phrase' in o ? '<input data-path="' + base + '.' + j + '.phrase" value="' + esc(o.phrase) + '" placeholder="como aparece no resultado" title="Como essa opção aparece no texto do resultado">' : '') +
        '<div class="opt-meta">' + ('value' in o ? '<input class="num" type="number" data-num="1" data-path="' + base + '.' + j + '.value" value="' + esc(o.value) + '" title="Valor em R$ usado no cálculo">' : '') +
        '<span class="code" title="Código usado nas regras">' + esc(o.code) + '</span></div></div>' +
        (locked ? '<span></span>' : '<div class="acts"><button class="ib" data-act="opt-up" data-i="' + j + '" title="Subir">↑</button><button class="ib del" data-act="opt-del" data-i="' + j + '" title="Remover">✕</button></div>') + '</div>';
    }).join('');
    if (!locked) h += '<button class="add" data-act="opt-add">+ adicionar opção</button>';
    return h + '</div>';
  }

  function screenEditor(s, i) {
    var p = 'screens.' + i + '.', h = '';
    if (s.locked) h += '<div class="ed-note">🔒 Essa tela entra nas regras ou nos cálculos do quiz. Você edita todo o texto, só não exclui.</div>';
    switch (s.type) {
      case 'cover':
        h += fImage('Imagem', p + 'image') + fText('Título', p + 'title', { area: true }) + fText('Subtítulo (serifado)', p + 'subtitle', { area: true }) +
          fText('Botão', p + 'button') + fText('Link "já fiz"', p + 'linkText', { hint: 'Abre o resultado salvo no navegador. Deixe vazio pra esconder.' }) + fText('Texto pequeno', p + 'small');
        break;
      case 'single':
        h += fText('Pergunta', p + 'title', { area: true, rows: 2, vars: true }) + fText('Texto de apoio', p + 'help', { ph: 'opcional' }) + optionsEditor(s, i) +
          '<div class="ed-sec"><h4>Dica depois da resposta</h4>' + fText('Texto da dica', p + 'tip', { area: true, vars: true, hint: 'Com dica, a pessoa vê o texto e toca em Continuar. Sem dica (campo vazio), avança sozinha ao tocar.' }) + '</div>';
        break;
      case 'multi':
        h += fText('Pergunta', p + 'title', { area: true, rows: 2, vars: true }) + fText('Texto de apoio', p + 'help') + fText('Botão', p + 'button') + optionsEditor(s, i);
        break;
      case 'input':
        h += fText('Título', p + 'title', { area: true, rows: 2 }) + fText('Pergunta (serifada)', p + 'question') + fText('Placeholder', p + 'placeholder') + fText('Texto pequeno', p + 'small') + fText('Botão', p + 'button');
        break;
      case 'statement':
        h += fText('Frase em destaque', p + 'quote', { area: true, vars: true }) + fText('Pergunta', p + 'question') + listEditor('Respostas', p + 'answers', { tpl: 'NOVA' }) + fText('Legenda pequena', p + 'caption', { ph: 'opcional' });
        break;
      case 'milestone':
        h += fText('Título', p + 'title', { area: true, rows: 2, vars: true }) +
          fText('Texto', p + 'text', { area: true, rows: 5, vars: true, hint: '**negrito** vira o valor grande em verde. Linha em branco separa parágrafo.' }) +
          fText('Texto alternativo (quando a pessoa já guarda 30%)', p + 'textAlt', { area: true, rows: 3, vars: true, hint: 'Opcional. Se preencher, aparece no lugar do texto quando a diferença der zero.' }) + fText('Botão', p + 'button');
        break;
      case 'testimonial':
        h += '<div class="ed-note">Quebra com depoimento no meio do fluxo. Use print sem o nome do produto: aqui a pessoa ainda não sabe qual é a solução.</div>' +
          fText('Chamada pequena', p + 'kicker', { vars: true }) + fText('Título', p + 'title', { area: true, rows: 2, vars: true }) +
          fText('Texto', p + 'text', { area: true, rows: 5, vars: true, hint: '**negrito** destaca o número em verde. Linha em branco separa parágrafo.' }) +
          fImage('Print', p + 'image') + fText('Legenda do print', p + 'caption') + fText('Botão', p + 'button');
        break;
      case 'capture':
        h += fText('Título', p + 'title', { area: true, rows: 2, vars: true }) + fText('Rótulo do WhatsApp', p + 'whatsLabel') + fText('Rótulo do e-mail', p + 'emailLabel') +
          fText('Botão', p + 'button') + fText('Texto de consentimento', p + 'consent', { area: true, rows: 2 }) + fText('Erro no WhatsApp', p + 'errWhats', { vars: true }) + fText('Erro no e-mail', p + 'errEmail', { vars: true });
        break;
      case 'loading':
        h += fText('Título', p + 'title', { area: true, rows: 2, vars: true }) + listEditor('Itens que ganham ✓', p + 'items', { tpl: 'Novo item' }) + fText('Duração (segundos)', p + 'seconds', { num: true }) +
          '<div class="ed-note" style="margin-top:12px">Embaixo da lista aparece o depoimento do perfil da pessoa (edite nos blocos R1, R2 e R3).</div>';
        break;
    }
    return h;
  }

  function rulesEditor() {
    return '<div class="rules"><p>Depois da análise, cada pessoa cai em <b>um</b> perfil. A ordem importa: vale a primeira regra verdadeira.</p><ol>' +
      '<li><b>R2</b> · dívida = <code>rolando</code> (cartão ou cheque especial) <b>ou</b> sobra = <code>falta</code></li>' +
      '<li><b>R3</b> · sobra = <code>500a1500</code>, <code>1500a3000</code> ou <code>mais3000</code> <b>ou</b> reserva = <code>mais3</code></li>' +
      '<li><b>R1</b> · todo o resto</li></ol>' +
      '<div class="ed-sec"><h4>Cálculos</h4><ul><li><code>passou_12m</code> = renda × 12</li><li><code>meta_30</code> = renda × 0,30</li><li><code>gap_mes</code> = meta_30 − sobra (mínimo 0)</li><li><code>gap_ano</code> = gap_mes × 12</li></ul><p class="muted" style="margin-top:8px">Os valores de renda e sobra são editáveis nas próprias telas (campo numérico de cada opção).</p></div>' +
      '<div class="ed-sec"><h4>Variáveis que você pode usar nos textos</h4><p class="muted">' + VARS.map(function (v) { return '<code>{{' + v + '}}</code>'; }).join(' ') + '</p></div></div>';
  }
  function profileEditor(k) {
    var p = 'profiles.' + k + '.';
    return fText('Nome do perfil', p + 'name', { area: true, rows: 2, vars: true }) + fText('Frase de apoio', p + 'support', { area: true, rows: 3, vars: true }) +
      '<div class="ed-sec"><h4>Depoimento desse perfil</h4>' + fText('Nome', p + 'testimonialName') + fText('Texto', p + 'testimonialText', { area: true, rows: 3 }) + fImage('Print', p + 'testimonialImage') + '</div>';
  }
  function resultEditor() {
    var r = 'result.';
    var h = '<div class="ed-note">Ordem da tela: título e perfil → card de números → "o que está entre você e esse número" → mecanismo → futuro → depoimentos (carrossel) → pensa comigo → oferta.</div>';
    h += '<div class="ed-sec"><h4>Topo</h4>' + fText('Título', r + 'title', { vars: true }) + fText('Rótulo do perfil', r + 'profileLabel') + '</div>';
    h += '<div class="ed-sec"><h4>Card de números</h4>' + fText('Linha 1', r + 'labelPassou') + fText('Linha 2', r + 'labelSobra') + fText('Linha 3', r + 'labelMeta') + fText('Destaque', r + 'labelGapAno') + fText('Destaque quando já guarda 30%', r + 'gapZero') + fText('Texto pequeno', r + 'disclaimer', { area: true, rows: 2 }) +
      Object.keys(D.result.sobraDisplay || {}).map(function (k) { return fText('Sobra exibida · ' + k, r + 'sobraDisplay.' + k); }).join('') + '</div>';
    h += '<div class="ed-sec"><h4>O que está entre você e esse número</h4>' + fText('Subtítulo', r + 'betweenTitle') +
      fText('Frase 1 · marcou onde o dinheiro escapa', r + 'sentenceRalos', { area: true, vars: true }) + fText('Frase 1 · marcou "não sei"', r + 'sentenceRalosNaoSei', { area: true }) +
      fText('Frase 2 · tem dívida rolando', r + 'sentenceDivida', { area: true }) +
      Object.keys(D.result.sentenceFatura || {}).map(function (k) { return fText('Frase 2 · fatura = ' + k, r + 'sentenceFatura.' + k, { area: true }); }).join('') +
      fText('Frase 3 · sem reserva', r + 'sentenceReservaSem', { area: true }) + fText('Frase 3 · com reserva', r + 'sentenceReservaCom', { area: true }) +
      fText('Frase final', r + 'absolution', { area: true }) + '</div>';
    h += '<div class="ed-sec"><h4>Mecanismo</h4>' + fText('Título', r + 'mechanismTitle') + fText('Introdução', r + 'mechanismIntro') +
      (D.result.mechanism || []).map(function (m, j) { return '<div class="blk-card">' + fText('Ícone', r + 'mechanism.' + j + '.icon') + fText('Título', r + 'mechanism.' + j + '.title') + fText('Texto', r + 'mechanism.' + j + '.text', { area: true, rows: 2 }) + '</div>'; }).join('') + '</div>';
    h += '<div class="ed-sec"><h4>Futuro</h4>' + fText('Texto', r + 'future', { area: true, vars: true }) + fText('Se não marcar conquista', r + 'futureConquistaDefault') + fText('Se não marcar sentimento', r + 'futureSentirDefault') + '</div>';
    h += '<div class="ed-sec"><h4>Depoimentos (carrossel)</h4><div class="ed-note">O primeiro card é o depoimento do perfil da pessoa. Depois vêm os dos outros dois perfis (edite nos blocos R1, R2 e R3) e por último estes. A pessoa arrasta pro lado.</div>' +
      fText('Título acima do carrossel', r + 'testimonialsTitle', { ph: 'opcional' }) +
      (D.result.moreTestimonials || []).map(function (t, j) {
        var q = r + 'moreTestimonials.' + j + '.';
        return '<div class="blk-card"><div class="bh"><b>Depoimento extra ' + (j + 1) + '</b><div class="acts"><button class="ib" data-act="list-up" data-path="result.moreTestimonials" data-i="' + j + '" title="Subir">↑</button><button class="ib del" data-act="list-del" data-path="result.moreTestimonials" data-i="' + j + '" title="Remover">✕</button></div></div>' +
          fImage('Print', q + 'image') + fText('Nome', q + 'name') + fText('Texto', q + 'text', { area: true, rows: 2 }) + '</div>';
      }).join('') +
      '<button class="add" data-act="list-add" data-path="result.moreTestimonials" data-tpl=\'{"image":"","name":"","text":""}\'>+ depoimento</button></div>';
    h += '<div class="ed-sec"><h4>Pensa comigo</h4>' + fText('Título', r + 'roiTitle') + fText('Texto da diferença', r + 'roiGap', { area: true, vars: true, hint: 'Aparece quando a diferença por mês é maior que zero.' }) + fText('Texto do delivery', r + 'roiDelivery', { area: true, hint: 'Aparece quando a pessoa gasta R$300 ou mais com delivery e apps.' }) + '</div>';
    return h;
  }
  var BLOCK_TYPES = { text: 'Texto', image: 'Imagem', testimonials: 'Carrossel de prints', list: 'Lista antes/depois', guarantee: 'Garantia', about: 'Sobre (foto + texto)', faq: 'Perguntas frequentes', cta: 'Botão de compra' };
  function blockEditor(b, j) {
    var p = 'offer.extraBlocks.' + j + '.', h = '<div class="blk-card"><div class="bh"><b>' + BLOCK_TYPES[b.type] + '</b><div class="acts"><button class="ib" data-act="blk-up" data-i="' + j + '">↑</button><button class="ib del" data-act="blk-del" data-i="' + j + '">✕</button></div></div>';
    h += fText('Título (opcional)', p + 'title');
    if (b.type === 'text') h += fText('Texto', p + 'text', { area: true, rows: 4, vars: true });
    if (b.type === 'image') h += fImage('Imagem', p + 'src') + fText('Descrição (acessibilidade)', p + 'alt');
    if (b.type === 'testimonials') h += listEditor('Prints (caminho ou link)', p + 'images', { tpl: 'img/depoimentos/tati.webp', hint: 'Disponíveis: ' + IMAGES.filter(function (x) { return x.indexOf('depoimentos') >= 0; }).join(', ') });
    if (b.type === 'list') h += '<label class="f"><span>Estilo</span><select data-path="' + p + 'tone">' +
      '<option value="ruim"' + (b.tone !== 'boa' ? ' selected' : '') + '>Vermelho com setas (a vida antes)</option>' +
      '<option value="boa"' + (b.tone === 'boa' ? ' selected' : '') + '>Verde com checks (a vida depois)</option></select></label>' +
      listEditor('Itens', p + 'items', { area: true, tpl: 'Novo item' });
    if (b.type === 'guarantee') h += fText('Texto', p + 'text', { area: true, rows: 5, hint: 'Linha em branco separa os parágrafos. O selo verde aparece em cima do título.' });
    if (b.type === 'about') h += fImage('Foto (fica redonda, com aro dourado)', p + 'image') + fText('Descrição da foto (acessibilidade)', p + 'alt') +
      fText('Texto', p + 'text', { area: true, rows: 8, hint: 'Linha em branco separa os parágrafos.' });
    if (b.type === 'faq') h += (b.items || []).map(function (it, m) {
      return '<div class="list-row" style="grid-template-columns:1fr auto"><div>' + '<input data-path="' + p + 'items.' + m + '.q" value="' + esc(it.q) + '" placeholder="Pergunta"><textarea data-path="' + p + 'items.' + m + '.a" rows="2" placeholder="Resposta" style="margin-top:4px">' + esc(it.a) + '</textarea></div>' +
        '<div class="acts"><button class="ib del" data-act="list-del" data-path="' + p + 'items" data-i="' + m + '">✕</button></div></div>';
    }).join('') + '<button class="add" data-act="list-add" data-path="' + p + 'items" data-tpl=\'{"q":"Nova pergunta","a":"Resposta"}\'>+ pergunta</button>';
    if (b.type === 'cta') h += fText('Texto acima do botão', p + 'text', { area: true, rows: 2 }) + fText('Texto do botão', p + 'button', { ph: 'usa o da oferta se vazio' });
    return h + '</div>';
  }
  function offerEditor() {
    var o = 'offer.';
    var h = '<div class="ed-sec" style="border:0;margin-top:0;padding-top:0"><h4>Topo</h4>' + fText('Chamada pequena', o + 'kicker') + fText('Título', o + 'title') + fImage('Imagem', o + 'image') + fText('Introdução', o + 'intro') + '</div>';
    h += '<div class="ed-sec"><h4>Benefícios (✓)</h4>' + listEditor('', o + 'benefits', { area: true, tpl: 'Novo benefício' }) + fText('Prova social', o + 'social', { area: true, rows: 2 }) + '</div>';
    h += '<div class="ed-sec"><h4>Bônus (🎁)</h4>' + fText('Título', o + 'bonusTitle') + listEditor('', o + 'bonuses', { area: true, tpl: 'Novo bônus' }) + '</div>';
    h += '<div class="ed-sec"><h4>Preço e botão</h4>' + fText('Nome no card', o + 'priceName') + fText('Parcelado', o + 'priceInstallments') + fText('À vista', o + 'priceCash') + fText('Texto do botão', o + 'button') + fText('Garantia', o + 'guarantee', { area: true, rows: 2 }) +
      '<small class="muted">O link do botão fica em Configurações.</small></div>';
    h += '<div class="ed-sec"><h4>Blocos extras depois da oferta</h4><div class="ed-note">Use pra somar mais prova, perguntas frequentes ou um segundo botão. Vazio = a oferta termina no card de preço.</div>' +
      (D.offer.extraBlocks || []).map(blockEditor).join('') +
      '<div class="chips" style="margin-top:10px">' + Object.keys(BLOCK_TYPES).map(function (t) { return '<button class="b b-sm" data-act="blk-add" data-type="' + t + '">+ ' + BLOCK_TYPES[t] + '</button>'; }).join('') + '</div></div>';
    return h;
  }

  function renderEditor() {
    var n = nodeByKey(sel); if (!n) { sel = 's:capa'; n = nodeByKey(sel); }
    var t = typeOf(n), title, idLine = '', body = '';
    if (n.kind === 'screen') { title = 'Tela ' + (n.idx + 1) + ' · ' + plain(n.s.title || n.s.quote || ''); idLine = 'id: ' + n.s.id; body = screenEditor(n.s, n.idx); }
    if (n.kind === 'rules') { title = 'Como cada pessoa cai num perfil'; body = rulesEditor(); }
    if (n.kind === 'profile') { title = 'Perfil ' + n.pk; body = profileEditor(n.pk); }
    if (n.kind === 'result') { title = 'Tela de resultado'; body = resultEditor(); }
    if (n.kind === 'offer') { title = 'Oferta'; body = offerEditor(); }
    $('#editor').innerHTML = '<div class="ed-head"><span class="n-type" style="color:' + t.color + '">' + t.icon + ' ' + esc(t.label) + '</span><h3>' + esc(title) + '</h3>' + (idLine ? '<div class="ed-id">' + esc(idLine) + '</div>' : '') + '</div><div class="ed-body">' + body + '</div>';
  }

  /* edição */
  $('#editor').addEventListener('focusin', function (e) { if (e.target.matches('input[data-path], textarea[data-path]')) lastFocus = e.target; });
  $('#editor').addEventListener('input', function (e) {
    var el = e.target; if (!el.dataset || !el.dataset.path) return;
    var v = el.dataset.num ? (el.value === '' ? 0 : Number(el.value)) : el.value;
    setPath(D, el.dataset.path, v);
    if (el.tagName === 'SELECT') { renderEditor(); }
    markDirty(); updateNode(sel); renderWarnings();
    var nn = nodeByKey(sel), h3 = $('.ed-head h3');
    if (nn && nn.kind === 'screen' && h3) h3.textContent = 'Tela ' + (nn.idx + 1) + ' · ' + plain(nn.s.title || nn.s.quote || '');
  });
  $('#editor').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ins && lastFocus) {
      var f = lastFocus, s = f.selectionStart || f.value.length, en = f.selectionEnd || s;
      f.value = f.value.slice(0, s) + b.dataset.ins + f.value.slice(en); f.focus(); f.selectionStart = f.selectionEnd = s + b.dataset.ins.length;
      f.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    var act = b.dataset.act; if (!act) return;
    var n = nodeByKey(sel), arr, i = Number(b.dataset.i);
    if (act === 'opt-add' || act === 'opt-del' || act === 'opt-up') {
      arr = n.s.options;
      if (act === 'opt-add') arr.push({ code: 'op' + Math.random().toString(36).slice(2, 6), emoji: '', label: 'Nova opção' });
      if (act === 'opt-del') { if (arr.length <= 1) return toast('A pergunta precisa de pelo menos uma opção', true); arr.splice(i, 1); }
      if (act === 'opt-up' && i > 0) { var t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t; }
    }
    if (act === 'list-add' || act === 'list-del' || act === 'list-up') {
      arr = getPath(D, b.dataset.path);
      if (!arr) { setPath(D, b.dataset.path, []); arr = getPath(D, b.dataset.path); }
      if (act === 'list-add') arr.push(JSON.parse(b.dataset.tpl || '""'));
      if (act === 'list-del') arr.splice(i, 1);
      if (act === 'list-up' && i > 0) { var t2 = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t2; }
    }
    if (act === 'blk-add' || act === 'blk-del' || act === 'blk-up') {
      D.offer.extraBlocks = D.offer.extraBlocks || []; arr = D.offer.extraBlocks;
      if (act === 'blk-add') {
        var tp = b.dataset.type, nb = { type: tp, title: '' };
        if (tp === 'text') nb.text = 'Seu texto aqui.';
        if (tp === 'image') { nb.src = 'img/mockup.webp'; nb.alt = ''; }
        if (tp === 'testimonials') { nb.title = 'Esse é o resultado de quem já usa o Caixa Livre'; nb.images = IMAGES.filter(function (x) { return x.indexOf('depoimentos') >= 0; }); }
        if (tp === 'faq') { nb.title = 'Dúvidas'; nb.items = [{ q: 'Preciso saber mexer em Excel?', a: 'Não. Se você sabe copiar e colar, sabe usar.' }]; }
        if (tp === 'cta') { nb.text = ''; nb.button = ''; }
        if (tp === 'list') { nb.tone = 'boa'; nb.title = 'Título da lista'; nb.items = ['Primeiro item']; }
        if (tp === 'guarantee') { nb.title = 'Garantia'; nb.text = 'Texto da garantia.'; }
        if (tp === 'about') { nb.title = 'Quem é a Letícia Kratka?'; nb.image = 'img/leticia-sobre.webp'; nb.alt = 'Letícia Kratka'; nb.text = 'Texto sobre ela.'; }
        arr.push(nb);
      }
      if (act === 'blk-del') arr.splice(i, 1);
      if (act === 'blk-up' && i > 0) { var t3 = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t3; }
    }
    markDirty(); renderEditor(); updateNode(sel); renderWarnings();
  });

  /* ================================================================ prévia */
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin) return;
    if (e.data && e.data.type === 'preview-ready') { pvReady = true; sendPreview(); }
  });
  $('#pv-perfil').onchange = function () { sendPreview(); };
  function schedulePreview(now) { clearTimeout(pvTimer); pvTimer = setTimeout(sendPreview, now ? 0 : 300); }
  function sendPreview() {
    if (!pvReady || !D) return;
    var n = nodeByKey(sel), screen = 'capa', perfil = $('#pv-perfil').value;
    if (n.kind === 'screen') screen = n.s.id;
    if (n.kind === 'rules' || n.kind === 'result') screen = '__resultado';
    if (n.kind === 'profile') { screen = '__resultado'; perfil = n.pk; }
    if (n.kind === 'offer') screen = '__oferta';
    $('#pv').contentWindow.postMessage({ type: 'preview', config: D, screen: screen, perfil: perfil }, location.origin);
  }

  /* ================================================================ leads */
  var leadsPage = 1, leadsQ = '', leadsData = null;
  function loadLeads(page) {
    leadsPage = page || 1; leadsQ = $('#leads-q').value.trim();
    $('#leads-tbl').innerHTML = '<tr><td class="empty">Carregando…</td></tr>';
    api('/api/admin/leads?page=' + leadsPage + '&q=' + encodeURIComponent(leadsQ)).then(function (d) {
      leadsData = d;
      var per = {}; (d.porPerfil || []).forEach(function (r) { per[r.perfil] = r.n; });
      $('#leads-kpis').innerHTML = kpi('Leads no total', d.total) + kpi('Perfil R1 · escorre', per.R1 || 0) + kpi('Perfil R2 · dívida', per.R2 || 0) + kpi('Perfil R3 · guarda', per.R3 || 0);
      if (!d.items.length) { $('#leads-tbl').innerHTML = '<tr><td class="empty">Nenhum lead ' + (leadsQ ? 'pra essa busca' : 'ainda') + '.</td></tr>'; $('#leads-pager').innerHTML = ''; return; }
      $('#leads-tbl').innerHTML = '<thead><tr><th>Data</th><th>Nome</th><th>WhatsApp</th><th>E-mail</th><th>Perfil</th><th>Renda</th><th>Sobra</th><th>Diferença/mês</th><th>Campanha</th><th>Anúncio</th></tr></thead><tbody>' +
        d.items.map(function (r, i) {
          return '<tr data-i="' + i + '"><td>' + fmtDate(r.created_at) + '</td><td>' + esc(r.nome) + '</td><td><a href="https://wa.me/55' + esc(r.whatsapp) + '" target="_blank" rel="noopener">' + esc(fmtZap(r.whatsapp)) + '</a></td><td>' + esc(r.email) + '</td>' +
            '<td><span class="pill ' + esc(r.perfil) + '">' + esc(r.perfil) + '</span></td><td>' + esc(r.renda) + '</td><td>' + esc(r.sobra) + '</td><td>R$' + Number(r.gap_mes || 0).toLocaleString('pt-BR') + '</td><td>' + esc(r.utm_campaign) + '</td><td>' + esc(r.utm_content) + '</td></tr>';
        }).join('') + '</tbody>';
      var pages = Math.max(1, Math.ceil(d.total / d.size));
      $('#leads-pager').innerHTML = 'Página ' + d.page + ' de ' + pages + ' <button class="b b-sm" ' + (d.page <= 1 ? 'disabled' : '') + ' data-p="' + (d.page - 1) + '">←</button><button class="b b-sm" ' + (d.page >= pages ? 'disabled' : '') + ' data-p="' + (d.page + 1) + '">→</button>';
    }).catch(function (e) { $('#leads-tbl').innerHTML = '<tr><td class="empty">' + esc(e.message) + '</td></tr>'; });
  }
  function fmtZap(z) { z = String(z || ''); return z.length === 11 ? '(' + z.slice(0, 2) + ') ' + z.slice(2, 7) + '-' + z.slice(7) : z; }
  function kpi(l, v) { return '<div class="kpi"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; }
  $('#leads-reload').onclick = function () { loadLeads(1); };
  $('#leads-q').onkeydown = function (e) { if (e.key === 'Enter') loadLeads(1); };
  $('#leads-pager').onclick = function (e) { var b = e.target.closest('button[data-p]'); if (b) loadLeads(Number(b.dataset.p)); };
  $('#leads-tbl').onclick = function (e) {
    if (e.target.closest('a')) return;
    var tr = e.target.closest('tr[data-i]'); if (!tr || !leadsData) return;
    var r = leadsData.items[Number(tr.dataset.i)], resp = {};
    try { resp = JSON.parse(r.respostas || '{}'); } catch (x) { }
    var labels = {}; D.screens.forEach(function (s, i) { labels[s.id] = (i + 1) + '. ' + plain(s.title || s.quote || s.id); });
    modal('<h3>' + esc(r.nome) + ' <span class="pill ' + esc(r.perfil) + '">' + esc(r.perfil) + '</span></h3><p>' + esc(r.email) + ' · ' + esc(fmtZap(r.whatsapp)) + ' · ' + fmtDate(r.created_at) + '</p>' +
      '<dl class="kv">' + Object.keys(resp).map(function (k) { return '<dt>' + esc(labels[k] || k) + '</dt><dd>' + esc(resp[k]) + '</dd>'; }).join('') + '</dl>' +
      '<div class="modal-acts"><a class="b" href="https://wa.me/55' + esc(r.whatsapp) + '" target="_blank" rel="noopener">Abrir WhatsApp</a><button class="b b-pri" data-close>Fechar</button></div>');
  };
  $('#leads-csv').onclick = function () {
    fetch('/api/admin/leads.csv', { headers: { 'Authorization': 'Bearer ' + PW } }).then(function (r) { if (!r.ok) throw new Error('Erro ' + r.status); return r.blob(); })
      .then(function (blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'leads-quiz-analise-cxl.csv'; document.body.appendChild(a); a.click(); a.remove(); })
      .catch(function (e) { toast(e.message, true); });
  };

  /* ================================================================ funil */
  function loadFunnel(silent) {
    var days = $('#funil-days').value;
    return api('/api/admin/funnel?days=' + days).then(function (d) {
      funnel = {}; (d.steps || []).forEach(function (r) { funnel[r.step] = r.n; });
      renderCanvas();
      if (!silent || !$('#v-funil').hidden) renderFunnel(d);
    }).catch(function (e) { if (!silent) toast(e.message, true); });
  }
  function renderFunnel(d) {
    var rows = D.screens.map(function (s, i) { return { id: s.id, label: (i + 1) + '. ' + plain(s.title || s.quote || s.id) }; });
    rows.push({ id: 'resultado', label: 'Resultado + oferta' }, { id: 'checkout_click', label: 'Clicou em comprar' });
    var base = funnel.capa || 0, prev = null, drops = [];
    rows.forEach(function (r) { r.n = funnel[r.id] || 0; r.pct = base ? r.n / base * 100 : 0; r.drop = prev != null && prev > 0 ? (prev - r.n) / prev * 100 : 0; prev = r.n; drops.push(r.drop); });
    var top = drops.slice().sort(function (a, b) { return b - a; }).slice(0, 3).filter(function (x) { return x > 0; });
    $('#funil-kpis').innerHTML = kpi('Começaram (capa)', base) + kpi('Leads capturados', d.leads) + kpi('Viram o resultado', funnel.resultado || 0) + kpi('Clicaram em comprar', funnel.checkout_click || 0) +
      kpi('Capa → lead', base ? Math.round(d.leads / base * 100) + '%' : '—');
    if (!base) { $('#funil').innerHTML = '<div class="empty">Ainda não tem visita nesse período.</div>'; return; }
    $('#funil').innerHTML = '<div class="fr head"><span></span><span>Tela</span><span></span><span class="n">Sessões</span><span class="pc">% início</span><span class="drop">Queda</span></div>' +
      rows.map(function (r, i) {
        var bad = top.indexOf(r.drop) >= 0 && r.drop > 0;
        return '<div class="fr' + (bad ? ' bad' : '') + '"><span class="muted">' + (i + 1) + '</span><span class="lbl" title="' + esc(r.label) + '">' + esc(r.label) + '</span><span class="bar"><i style="width:' + r.pct.toFixed(1) + '%"></i></span><span class="n">' + r.n + '</span><span class="pc">' + Math.round(r.pct) + '%</span><span class="drop">' + (i ? '−' + Math.round(r.drop) + '%' : '') + '</span></div>';
      }).join('');
  }
  $('#funil-reload').onclick = function () { loadFunnel(false); };
  $('#funil-days').onchange = function () { loadFunnel(false); };

  /* ================================================================ configurações */
  function renderConfig() {
    var m = 'meta.', t = D.theme || {};
    var colors = [['primary', 'Botões e barra'], ['primaryDark', 'Botão (sombra) e valores'], ['accent', 'Detalhes'], ['bg', 'Fundo'], ['soft', 'Fundo das dicas'], ['text', 'Texto'], ['muted', 'Texto de apoio'], ['border', 'Bordas']];
    $('#config-page').innerHTML = '<div class="page-head"><h2>Configurações</h2></div>' +
      '<div class="card"><h3>Venda e rastreio</h3><p class="sub">Vale pro quiz depois que publicar.</p><div class="grid2" id="cfg-meta">' +
      fText('Link do checkout', m + 'checkoutUrl', { hint: 'As UTMs e o fbp~fbc~sid vão no utm_term, igual na cxlv4 (Worker da CAPI lê isso na venda).' }) +
      fText('GTM', m + 'gtmId', { hint: 'Container de infoproduto da Leticia: GTM-N9GCCZSW.' }) + fText('Pixel da UTMify', m + 'utmifyPixelId') +
      fText('Webhook do lead (opcional)', m + 'webhookUrl', { ph: 'https://script.google.com/macros/s/...', hint: 'Todo lead já fica salvo aqui no painel. Se preencher, cada lead também é enviado pra esse endereço (ex.: Apps Script de uma planilha).' }) +
      '</div>' + fText('Rodapé legal', m + 'footer', { area: true, rows: 2 }) + '</div>' +
      '<div class="card"><h3>Cores</h3><p class="sub">Escolha um padrão ou ajuste cor por cor.</p><div class="row-gap" style="margin-top:10px"><button class="b" data-theme="leticia">Cores da Leticia</button><button class="b" data-theme="facescan">Preto (igual ao FaceScan)</button></div>' +
      '<div class="swatches">' + colors.map(function (c) { return '<label class="color"><input type="color" data-color="' + c[0] + '" value="' + esc(t[c[0]] || '#000000') + '">' + c[1] + '</label>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>Versões publicadas</h3><p class="sub">Volte uma versão antiga pro rascunho. Ela só vai pro ar quando publicar de novo.</p><ul class="hist" id="hist"><li class="muted">Carregando…</li></ul></div>' +
      '<div class="card"><h3>Backup</h3><p class="sub">Baixe o rascunho em JSON ou volte pro conteúdo original do Prompt B.</p><div class="row-gap" style="margin-top:10px"><button class="b" id="exp-json">Baixar JSON</button><label class="b">Importar JSON<input type="file" id="imp-json" accept="application/json" hidden></label><button class="b b-danger" id="reset-def">Voltar pro conteúdo original</button></div></div>';
    api('/api/admin/history').then(function (d) {
      $('#hist').innerHTML = d.items.length ? d.items.map(function (h) { return '<li><b>#' + h.id + '</b><span>' + fmtDate(h.published_at) + '</span>' + (h.note ? '<span>· ' + esc(h.note) + '</span>' : '') + '<button class="b b-sm" data-restore="' + h.id + '">Restaurar</button></li>'; }).join('') : '<li class="muted">Nada publicado ainda.</li>';
    }).catch(function () { $('#hist').innerHTML = '<li class="muted">Não consegui carregar.</li>'; });
  }
  $('#v-config').addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset.path) { setPath(D, el.dataset.path, el.value); markDirty(); renderWarnings(); }
    if (el.dataset.color) { D.theme = D.theme || {}; D.theme[el.dataset.color] = el.value; D.theme.preset = 'custom'; markDirty(); }
  });
  $('#v-config').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.theme) { D.theme = clone(THEMES[b.dataset.theme]); markDirty(); renderConfig(); toast('Cores aplicadas no rascunho'); }
    if (b.dataset.restore) {
      api('/api/admin/restore?id=' + b.dataset.restore, { method: 'POST' }).then(function (r) { D = r.draft; DRAFT_AT = r.draftUpdatedAt; dirty = false; setStatus(); renderAll(); renderConfig(); toast('Versão #' + b.dataset.restore + ' voltou pro rascunho'); }).catch(function (x) { toast(x.message, true); });
    }
    if (b.id === 'exp-json') { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' })); a.download = 'quiz-analise-cxl-rascunho.json'; a.click(); }
    if (b.id === 'reset-def') {
      modal('<h3>Voltar pro conteúdo original?</h3><p>O rascunho é trocado pelo texto original do Prompt B. O que está no ar não muda até publicar.</p><div class="modal-acts"><button class="b" data-close>Cancelar</button><button class="b b-pri" id="reset-go">Voltar</button></div>');
      $('#reset-go').onclick = function () { fetch('/config-default.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) { D = c; closeModal(); markDirty(); renderAll(); renderConfig(); toast('Conteúdo original carregado no rascunho'); }); };
    }
  });
  $('#v-config').addEventListener('change', function (e) {
    if (e.target.id !== 'imp-json' || !e.target.files[0]) return;
    e.target.files[0].text().then(function (txt) {
      var c = JSON.parse(txt); if (!c.screens || !c.result || !c.offer) throw new Error('Arquivo não parece um config do quiz');
      D = c; markDirty(); renderAll(); renderConfig(); toast('JSON importado no rascunho');
    }).catch(function (x) { toast(x.message, true); });
  });

  /* ================================================================ modal */
  function modal(html) { $('#modal-card').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; }
  $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  function renderAll() { renderCanvas(); renderEditor(); updateToolbar(); schedulePreview(true); }

  /* ================================================================ entrada */
  if (PW) {
    api('/api/admin/login', { method: 'POST' }).then(start).catch(function () { showLogin(); });
  } else showLogin();
})();
