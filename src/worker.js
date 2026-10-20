/* Worker do Quiz Caixa Livre (Fluxo B) + painel /admin
 *
 * Página
 *   GET  /             public/app.html com o config publicado embutido, o GTM/UTMify do config
 *                      e o preload da foto da capa (a capa aparece sem esperar nenhuma API)
 *
 * Rotas públicas
 *   GET  /api/config   config publicado (ou o config-default.json, se nunca publicou)
 *   POST /api/lead     grava o lead no D1 (ignora reenvio da mesma sessão + e-mail) e, se tiver
 *                      webhook no config, repassa; se o D1 falhar, o webhook ainda recebe
 *   POST /api/event    lista de telas da sessão; 1 linha por sessão na tabela sessions, pro funil
 *
 * Rotas do admin (header Authorization: Bearer <ADMIN_PASSWORD>)
 *   POST /api/admin/login
 *   GET  /api/admin/config            rascunho + publicado
 *   PUT  /api/admin/config            salva rascunho
 *   POST /api/admin/publish           rascunho -> publicado (guarda histórico)
 *   GET  /api/admin/history           últimas publicações
 *   POST /api/admin/restore?id=N      volta uma publicação antiga pro rascunho
 *   GET  /api/admin/leads?q=&page=    lista de leads
 *   GET  /api/admin/leads.csv         exportação
 *   GET  /api/admin/funnel?days=30    sessões que chegaram em cada tela
 *
 * O resto é arquivo estático da pasta public/ (quiz em /, painel em /admin/).
 * As tabelas se criam sozinhas no primeiro acesso (schema.sql tem o mesmo SQL).
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS quiz_config (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS config_history (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, published_at TEXT NOT NULL, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, nome TEXT, whatsapp TEXT, email TEXT, perfil TEXT, renda TEXT, sobra TEXT, gap_mes INTEGER, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT, sid TEXT, page TEXT, respostas TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`,
  `CREATE TABLE IF NOT EXISTS events (sid TEXT NOT NULL, step TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (sid, step))`,
  `CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)`,
  /* funil novo: 1 linha por sessão com a lista de telas (events fica só com o histórico antigo) */
  `CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, steps TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at)`
];
let schemaPronto = false;

async function ensureSchema(env) {
  if (schemaPronto) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaPronto = true;
}

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const agora = () => new Date().toISOString();
const corta = (v, n = 300) => (v == null ? '' : String(v).slice(0, n));

async function lerCorpo(request, limite = 400000) {
  const txt = await request.text();
  if (txt.length > limite) throw new Error('corpo grande demais');
  return txt ? JSON.parse(txt) : {};
}

async function configDefault(env, request) {
  const r = await env.ASSETS.fetch(new Request(new URL('/config-default.json', request.url)));
  return r.json();
}

async function getRow(env, id) {
  return env.DB.prepare('SELECT json, updated_at FROM quiz_config WHERE id = ?').bind(id).first();
}

/* Config publicado com cache: memória do isolate (20s) + Cache API do datacenter (60s).
   O D1 fica fora do Brasil, então sem isso cada visita pagaria uma ida e volta até lá.
   Publicar limpa os dois caches do datacenter de quem publicou; os outros pegam em até 1 min. */
const CFG_TTL = 60;
let memoCfg = null;
const chaveCfg = (request) => new Request(new URL('/__cache/config-publicado', request.url).toString());

async function configPublicado(env, request, ctx) {
  if (memoCfg && Date.now() - memoCfg.em < 20000) return memoCfg.cfg;
  const chave = chaveCfg(request);
  const hit = await caches.default.match(chave).catch(() => null);
  let cfg;
  if (hit) cfg = await hit.json();
  else {
    let row = null;
    try { row = await getRow(env, 'published'); } catch (e) { /* tabela ainda não criada */ }
    cfg = row ? JSON.parse(row.json) : await configDefault(env, request);
    const resp = new Response(JSON.stringify(cfg), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CFG_TTL}` } });
    ctx.waitUntil(caches.default.put(chave, resp).catch(() => {}));
  }
  memoCfg = { cfg, em: Date.now() };
  return cfg;
}

async function limpaCacheConfig(request) {
  memoCfg = null;
  try { await caches.default.delete(chaveCfg(request)); } catch (e) { /* sem cache no workers.dev */ }
}

const escAttr = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* GTM e UTMify carregam depois do window.load (igual às outras páginas da Leticia) e não
   carregam no localhost nem na prévia do admin, pra teste não virar evento no Pixel.
   No localhost dá pra forçar com ?gtm=1. */
function rastreioHtml(m) {
  const gtm = /^GTM-[A-Z0-9]{4,12}$/.test(m.gtmId || '') ? m.gtmId : '';
  const utmify = /^[a-f0-9]{24}$/i.test(m.utmifyPixelId || '') ? m.utmifyPixelId : '';
  const head = `<script>window.dataLayer=window.dataLayer||[];window.__lckTrk=true;(function(){var loc=location;` +
    `if(/[?&]preview=1/.test(loc.search))return;` +
    `if(/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(loc.hostname)&&!/[?&]gtm=1/.test(loc.search))return;` +
    `function go(){` +
    (gtm ? `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');` : '') +
    (utmify ? `window.pixelId='${utmify}';var u=document.createElement('script');u.src='https://cdn.utmify.com.br/scripts/pixel/pixel.js';u.async=true;u.defer=true;document.head.appendChild(u);` : '') +
    `}if(document.readyState==='complete')go();else window.addEventListener('load',go);})();</script>`;
  const body = gtm ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtm}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>` : '';
  return { head, body };
}

async function paginaQuiz(request, env, ctx) {
  const [cfg, tpl] = await Promise.all([
    configPublicado(env, request, ctx),
    env.ASSETS.fetch(new Request(new URL('/app.html', request.url))).then(async (r) => {
      const loc = r.headers.get('Location');
      if (r.status >= 300 && r.status < 400 && loc) r = await env.ASSETS.fetch(new Request(new URL(loc, request.url)));
      return r.text();
    })
  ]);
  const capa = (cfg.screens || [])[0] || {};
  const trk = rastreioHtml(cfg.meta || {});
  const cfgJs = JSON.stringify(cfg).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const head =
    (capa.type === 'cover' && capa.image ? `<link rel="preload" as="image" href="${escAttr(capa.image)}" fetchpriority="high">\n  ` : '') +
    `<script>window.__CFG=${cfgJs};</script>\n  ` + trk.head;
  const html = tpl.replace('<!--QUIZ_HEAD-->', () => head).replace('<!--QUIZ_BODY-->', () => trk.body);
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }
  });
}

function autorizado(request, env) {
  const h = request.headers.get('Authorization') || '';
  const senha = h.startsWith('Bearer ') ? h.slice(7) : '';
  const certa = env.ADMIN_PASSWORD || '';
  if (!certa || senha.length !== certa.length) return false;
  let dif = 0;
  for (let i = 0; i < certa.length; i++) dif |= senha.charCodeAt(i) ^ certa.charCodeAt(i);
  return dif === 0;
}

function validaConfig(c) {
  if (!c || typeof c !== 'object') return 'config vazio';
  if (!Array.isArray(c.screens) || !c.screens.length) return 'sem telas';
  if (!c.meta || !c.result || !c.offer || !c.profiles) return 'faltam seções (meta, result, offer, profiles)';
  const ids = new Set();
  for (const s of c.screens) {
    if (!s.id || !s.type) return 'tela sem id ou tipo';
    if (ids.has(s.id)) return 'id de tela repetido: ' + s.id;
    ids.add(s.id);
  }
  for (const obrig of ['renda', 'nome', 'sobra', 'captura', 'analise']) if (!ids.has(obrig)) return 'tela obrigatória faltando: ' + obrig;
  return null;
}

async function repassaWebhook(url, lead) {
  try {
    const body = new URLSearchParams();
    body.set('formulario', 'quiz_analise_cxl');
    Object.entries(lead).forEach(([k, v]) => body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
    await fetch(url, { method: 'POST', body, redirect: 'follow' });
  } catch (e) { /* webhook é opcional, o lead já está no D1 */ }
}

function csvCampo(v) {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (!p.startsWith('/api/')) {
      if (p === '/admin') return Response.redirect(new URL('/admin/', url), 301);
      if ((p === '/' || p === '/index.html') && (request.method === 'GET' || request.method === 'HEAD')) return paginaQuiz(request, env, ctx);
      return env.ASSETS.fetch(request);
    }

    try {
      /* ---------------- públicas ---------------- */
      if (p === '/api/config' && request.method === 'GET') {
        return json(await configPublicado(env, request, ctx), 200, { 'Cache-Control': 'public, max-age=30' });
      }

      /* se o banco estiver fora (ex.: limite diário do plano), o lead ainda tem saída pelo webhook */
      let bancoOk = true;
      try { await ensureSchema(env); } catch (e) { bancoOk = false; }

      if (p === '/api/lead' && request.method === 'POST') {
        const d = await lerCorpo(request, 20000);
        const zap = corta(d.whatsapp, 20).replace(/\D/g, '');
        const email = corta(d.email, 160).trim();
        if (zap.length < 10 || !/@/.test(email)) return json({ ok: false, erro: 'contato inválido' }, 400);
        const u = d.utm || {};
        const lead = {
          created_at: agora(), nome: corta(d.nome, 80), whatsapp: zap, email, perfil: corta(d.perfil, 4),
          renda: corta(d.renda, 60), sobra: corta(d.sobra, 80), gap_mes: Number(d.gap_mes) || 0,
          utm_source: corta(u.utm_source, 200), utm_medium: corta(u.utm_medium, 200), utm_campaign: corta(u.utm_campaign, 200),
          utm_content: corta(u.utm_content, 200), utm_term: corta(u.utm_term, 200), sid: corta(d.sid, 60), page: corta(d.page, 500),
          respostas: JSON.stringify(d.respostas || {}).slice(0, 8000)
        };
        let gravou = false, repetido = false;
        if (bancoOk) {
          try {
            /* o quiz reenvia quando a rede falha: mesma sessão + mesmo e-mail nas últimas 24h = já está salvo */
            const ja = lead.sid ? await env.DB.prepare(`SELECT 1 FROM leads WHERE sid = ?1 AND email = ?2 AND created_at >= ?3 LIMIT 1`)
              .bind(lead.sid, lead.email, new Date(Date.now() - 86400000).toISOString()).first() : null;
            if (ja) repetido = true;
            else {
              await env.DB.prepare(
                `INSERT INTO leads (created_at, nome, whatsapp, email, perfil, renda, sobra, gap_mes, utm_source, utm_medium, utm_campaign, utm_content, utm_term, sid, page, respostas)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
              ).bind(lead.created_at, lead.nome, lead.whatsapp, lead.email, lead.perfil, lead.renda, lead.sobra, lead.gap_mes,
                lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.utm_content, lead.utm_term, lead.sid, lead.page, lead.respostas).run();
            }
            gravou = true;
          } catch (e) { /* cai no webhook abaixo */ }
        }
        if (repetido) return json({ ok: true, repetido: true });
        let hook = '';
        try { hook = ((await configPublicado(env, request, ctx)).meta || {}).webhookUrl || ''; } catch (e) { }
        const temHook = /^https:\/\//.test(hook);
        if (temHook) ctx.waitUntil(repassaWebhook(hook, { ...lead, respostas: d.respostas || {} }));
        /* sem banco e sem webhook: 503 faz o quiz guardar o lead no aparelho e tentar de novo depois */
        if (!gravou && !temHook) return json({ ok: false, erro: 'não deu pra salvar agora' }, 503);
        return json({ ok: true, banco: gravou });
      }

      if (!bancoOk) return json({ erro: 'banco indisponível' }, 503);

      /* funil: o quiz manda a lista de telas da sessão; vira 1 linha por sessão (união com o que já tinha) */
      if (p === '/api/event' && request.method === 'POST') {
        const d = await lerCorpo(request, 6000);
        const sid = corta(d.sid, 60);
        const passos = (Array.isArray(d.steps) ? d.steps : [d.step]).map((s) => corta(s, 60)).filter(Boolean).slice(0, 80);
        if (sid && passos.length) {
          const t = agora();
          await env.DB.prepare(
            `INSERT INTO sessions (sid, steps, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(sid) DO UPDATE SET updated_at = excluded.updated_at,
               steps = (SELECT json_group_array(value) FROM (SELECT value FROM json_each(sessions.steps) UNION SELECT value FROM json_each(excluded.steps)))`
          ).bind(sid, JSON.stringify(passos), t).run();
        }
        return new Response(null, { status: 204 });
      }

      /* ---------------- admin ---------------- */
      if (p.startsWith('/api/admin/')) {
        if (!env.ADMIN_PASSWORD) return json({ erro: 'ADMIN_PASSWORD não configurada no Worker' }, 500);
        if (!autorizado(request, env)) return json({ erro: 'senha inválida' }, 401);

        if (p === '/api/admin/login') return json({ ok: true });

        if (p === '/api/admin/config' && request.method === 'GET') {
          const [draft, pub] = await Promise.all([getRow(env, 'draft'), getRow(env, 'published')]);
          const def = (!draft || !pub) ? await configDefault(env, request) : null;
          return json({
            draft: draft ? JSON.parse(draft.json) : (pub ? JSON.parse(pub.json) : def),
            draftUpdatedAt: draft ? draft.updated_at : null,
            published: pub ? JSON.parse(pub.json) : null,
            publishedAt: pub ? pub.updated_at : null
          });
        }

        if (p === '/api/admin/config' && request.method === 'PUT') {
          const cfg = await lerCorpo(request);
          const erro = validaConfig(cfg);
          if (erro) return json({ erro }, 400);
          const t = agora();
          await env.DB.prepare('INSERT INTO quiz_config (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
            .bind('draft', JSON.stringify(cfg), t).run();
          return json({ ok: true, draftUpdatedAt: t });
        }

        if (p === '/api/admin/publish' && request.method === 'POST') {
          const d = await lerCorpo(request, 2000).catch(() => ({}));
          const draft = await getRow(env, 'draft');
          if (!draft) return json({ erro: 'não há rascunho salvo' }, 400);
          const erro = validaConfig(JSON.parse(draft.json));
          if (erro) return json({ erro }, 400);
          const t = agora();
          await env.DB.batch([
            env.DB.prepare('INSERT INTO quiz_config (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at').bind('published', draft.json, t),
            env.DB.prepare('INSERT INTO config_history (json, published_at, note) VALUES (?, ?, ?)').bind(draft.json, t, corta(d.note, 200)),
            env.DB.prepare('DELETE FROM config_history WHERE id NOT IN (SELECT id FROM config_history ORDER BY id DESC LIMIT 30)')
          ]);
          await limpaCacheConfig(request);
          return json({ ok: true, publishedAt: t });
        }

        if (p === '/api/admin/history' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT id, published_at, note FROM config_history ORDER BY id DESC LIMIT 30').all();
          return json({ items: results });
        }

        if (p === '/api/admin/restore' && request.method === 'POST') {
          const id = Number(url.searchParams.get('id'));
          const row = await env.DB.prepare('SELECT json FROM config_history WHERE id = ?').bind(id).first();
          if (!row) return json({ erro: 'versão não encontrada' }, 404);
          const t = agora();
          await env.DB.prepare('INSERT INTO quiz_config (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at').bind('draft', row.json, t).run();
          return json({ ok: true, draft: JSON.parse(row.json), draftUpdatedAt: t });
        }

        if (p === '/api/admin/leads' && request.method === 'GET') {
          const q = corta(url.searchParams.get('q'), 80).trim();
          const page = Math.max(1, Number(url.searchParams.get('page')) || 1), size = 50;
          const filtro = q ? `WHERE nome LIKE ?1 OR email LIKE ?1 OR whatsapp LIKE ?1 OR utm_campaign LIKE ?1` : '';
          const args = q ? ['%' + q + '%'] : [];
          const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads ${filtro}`).bind(...args).first();
          const { results } = await env.DB.prepare(`SELECT id, created_at, nome, whatsapp, email, perfil, renda, sobra, gap_mes, utm_source, utm_campaign, utm_content, respostas FROM leads ${filtro} ORDER BY id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`).bind(...args).all();
          const porPerfil = await env.DB.prepare('SELECT perfil, COUNT(*) AS n FROM leads GROUP BY perfil').all();
          return json({ total: total.n, page, size, items: results, porPerfil: porPerfil.results });
        }

        if (p === '/api/admin/leads.csv' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT created_at, nome, whatsapp, email, perfil, renda, sobra, gap_mes, utm_source, utm_medium, utm_campaign, utm_content, utm_term, respostas FROM leads ORDER BY id DESC LIMIT 20000').all();
          const cab = ['data', 'nome', 'whatsapp', 'email', 'perfil', 'renda', 'sobra', 'diferenca_mes', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'respostas'];
          const linhas = results.map((r) => [r.created_at, r.nome, r.whatsapp, r.email, r.perfil, r.renda, r.sobra, r.gap_mes, r.utm_source, r.utm_medium, r.utm_campaign, r.utm_content, r.utm_term, r.respostas].map(csvCampo).join(';'));
          return new Response('﻿' + [cab.join(';'), ...linhas].join('\n'), {
            headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="leads-quiz-analise-cxl.csv"', 'Cache-Control': 'no-store' }
          });
        }

        if (p === '/api/admin/funnel' && request.method === 'GET') {
          const dias = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
          const desde = new Date(Date.now() - dias * 86400000).toISOString();
          /* sessões novas (tabela sessions, lista de telas em JSON) + histórico antigo (events, 1 linha por tela) */
          const { results } = await env.DB.prepare(
            `SELECT step, COUNT(DISTINCT sid) AS n FROM (
               SELECT sid, step FROM events WHERE created_at >= ?1
               UNION ALL
               SELECT s.sid AS sid, j.value AS step FROM sessions s, json_each(s.steps) j WHERE s.created_at >= ?1
             ) GROUP BY step`
          ).bind(desde).all();
          const leads = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?').bind(desde).first();
          return json({ days: dias, steps: results, leads: leads.n });
        }

        return json({ erro: 'rota não encontrada' }, 404);
      }

      return json({ erro: 'rota não encontrada' }, 404);
    } catch (e) {
      return json({ erro: String(e && e.message || e) }, 500);
    }
  }
};
