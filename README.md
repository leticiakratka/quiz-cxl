# Quiz Análise Caixa Livre (Fluxo B) + painel

Quiz do Fluxo B (estrutura FaceScan) feito em código próprio, com painel de administração no mesmo Worker.

- **Quiz:** `/` · 24 telas, cálculos, resultado personalizado por perfil (R1/R2/R3) e oferta. Todo o texto vem do banco.
- **Painel:** `/admin/` (senha) · fluxo em blocos (estilo xQuiz), editor de cada tela com prévia ao vivo, leads, funil por tela, configurações e versões.
- **Copy de origem:** `copys/caixa-livre/quiz-caixa-livre-v2-prompt-B.md` (versão fechada em 18/10 virou o prompt `copys/caixa-livre/quiz-caixa-livre-v3-prompt-B.md`)

## Como funciona

| Peça | Onde |
|---|---|
| Conteúdo padrão (Prompt B) | `public/config-default.json` |
| Quiz | `public/app.html` (modelo que o Worker preenche), `quiz.css`, `quiz.js`, `fonts/`, `img/` |
| Cache no navegador | `public/_headers` (fontes 1 ano, imagens 7 dias) |
| Painel | `public/admin/` |
| API + banco | `src/worker.js` (D1, tabelas criadas sozinhas; mesmo SQL em `schema.sql`) |

- O painel edita um **rascunho** (salva sozinho a cada poucos segundos). O quiz no ar só muda quando clica em **Publicar**. Cada publicação fica no histórico e pode voltar pro rascunho.
- Regras fixas no código (`quiz.js`), porque leem o `code` de cada opção, que o painel não deixa mudar: R2 se dívida rolando ou sobra falta · R3 se sobra ≥ R$500 ou reserva > 3 meses · R1 o resto.
- Telas com 🔒 entram nas regras ou nos cálculos: o texto é editável, mas não dá pra excluir nem adicionar/tirar opção.
- Leads ficam no D1 (aba Leads, exporta CSV). Se preencher o webhook em Configurações, cada lead também é enviado pra lá.
- **Carregamento:** o Worker entrega `/` já com o config publicado dentro do HTML (`window.__CFG`), o GTM e o preload da foto da capa, então a capa aparece sem esperar API. O config fica em cache (memória 20s + Cache API 60s) e **Publicar limpa o cache** do datacenter de quem publicou; os outros pegam em até 1 min. Fontes ficam em `public/fonts/` (sem Google Fonts).
- **Celular:** a capa cabe na altura visível (a foto encolhe até 150px) e o botão Continuar fica preso no rodapé nas telas que podem passar da tela. Testado nas 24 telas em 360x560, 390x664 e 412x780.
- Rastreio igual ao da cxlv4: GTM-N9GCCZSW (snippet no HTML, carrega **logo na abertura** com preconnect do Google/Meta e o `fbevents.js` do Pixel pré-carregado em prioridade baixa, pra o PageView do Meta sair antes: 1,6 s → 1,1 s no 4G normal, 5,5 s → 4,5 s no lento, medido em 20/10/2026; com `noscript`; a UTMify fica depois do `window.load`), pixel da UTMify, UTMs guardadas e `utm_term = fbp~fbc~sid` no link da Eduzz (o Worker da CAPI lê isso na venda). **No localhost e na prévia do painel o GTM e a UTMify não carregam**, pra teste não virar evento no Pixel (no localhost dá pra forçar com `?gtm=1`).
- Eventos no dataLayer: `quiz_step`, `quiz_lead`, `quiz_result`, `quiz_checkout_click`. O `quiz_lead` sai quando o WhatsApp e o e-mail passam na validação e a pessoa envia, com `event_id` (`lead.<sessão>`), `quiz_email`, `quiz_telefone` (55+DDD+número) e `quiz_nome` pra correspondência avançada. Eles **não disparam nada no Meta sozinhos**: o Lead no Pixel depende do acionador `quiz_lead` no GTM.

## Lead no CRM LCK (passo a passo)

O CRM (crm.leticiakratka.com.br) é um app do Lovable com banco Supabase. Ele já tem entrada de leads (tabela `lead_ingest`, "Ingestão (log)" no Admin, Fontes), mas o endereço dessa entrada fica no projeto do Lovable.

**No Lovable (projeto do CRM)**
1. Perguntar na IA do Lovable: *"Qual é a URL pública do endpoint que grava leads na tabela lead_ingest? Ele exige algum cabeçalho de autenticação (nome e valor)? Qual o formato de JSON que ele espera pra nome, e-mail, telefone, fonte, respostas e UTMs?"*
2. Se não existir endpoint público, pedir pra criar: *"Crie uma edge function pública que receba POST em JSON com nome, email, telefone, fonte, origem, respostas (objeto pergunta → resposta), utm_source, utm_medium, utm_campaign, utm_content, utm_term, perfil, renda, sobra, diferenca_mes, pagina e criado_em. Exija o cabeçalho x-webhook-token igual ao segredo QUIZ_WEBHOOK_TOKEN. Grave em lead_ingest do mesmo jeito das outras entradas (fonte_raw = fonte, payload = corpo) e crie ou atualize o lead (mesmo e-mail ou telefone = mesmo lead) no funil [FUNIL], etapa [ETAPA]. Me devolva a URL."*
3. Em **Fontes**, criar "Quiz Análise" (apelido `quiz_analise_cxl`).

**No painel do quiz (quiz.leticiakratka.com.br/admin → Configurações → CRM)**
4. Colar o endereço de entrada. Se o CRM pedir, preencher cabeçalho (ex.: `x-webhook-token` ou `Authorization`) e token. Conferir a "Fonte enviada".
5. Clicar em **Enviar lead de teste** (não precisa publicar). Se o CRM manda WhatsApp automático pra lead novo, usar o próprio número no teste. A resposta do CRM aparece na tela.
6. Conferir no CRM em **Admin → Ingestão (log)** e no funil se o lead entrou certo. Se deu erro ou o CRM esperava outros nomes de campo, a resposta na tela mostra o motivo (ajuste no `payloadCrm` do `src/worker.js`).
7. Deu certo: marcar **Enviar cada lead novo pro CRM** e clicar em **Publicar**. Daí pra frente todo lead vai na hora (até 3 tentativas cada).
8. Acompanhar em **Últimos envios** (✅ aceito / ⚠️ erro, com a resposta do CRM).

Leads que entraram antes de ligar a produção não vão sozinhos (dá pra mandar de uma vez com um script, se precisar).

## Rodar local

```bash
cd sites/quiz-analise-caixa-livre
npx wrangler@3 dev --port 8787
```

Quiz em http://127.0.0.1:8787 e painel em http://127.0.0.1:8787/admin/ (a senha local fica em `.dev.vars`, que não vai pro git). O banco local fica em `.wrangler/` e não sobe no deploy.

## No ar

- **Quiz:** https://quiz.leticiakratka.com.br · **Painel:** https://quiz.leticiakratka.com.br/admin/
- Conta Cloudflare da Leticia, Worker `quiz-cxl`, banco D1 `quiz-cxl` (região ENAM), domínio próprio (o endereço workers.dev está desligado).
- Repositório: https://github.com/leticiakratka/quiz-cxl
- O domínio de Worker é sempre com proxy ligado (nuvem laranja): é a Cloudflare que roda o Worker, então com o proxy desligado o endereço não teria pra onde apontar.
- Senha do painel: secret `ADMIN_PASSWORD` do Worker. Trocar em Workers & Pages → quiz-cxl → Settings → Variables and Secrets, ou com `npx wrangler@3 secret put ADMIN_PASSWORD` nesta pasta. Sem ela, o painel não abre.

Publicar mudança de código (o conteúdo muda pelo painel, sem deploy):

```bash
npx wrangler@3 versions list --name quiz-cxl   # conferir se o que está no ar não é mais novo que esta pasta
npx wrangler@3 deploy
```

No primeiro acesso o quiz usa o `config-default.json`. Entrar no painel, revisar e clicar em Publicar cria a primeira versão no banco.

**Cuidado com conteúdo novo em código:** depois que existe versão publicada no banco, o quiz no ar usa o banco e ignora o `config-default.json`. Mudança de texto vai pelo painel. Se um deploy acrescentar campo novo no config (ex.: `result.moreTestimonials`), o rascunho e a versão publicada no banco também precisam receber esse campo, senão o próximo Publicar do painel apaga a novidade. Conferir com `npx wrangler@3 d1 execute quiz-cxl --remote --command "SELECT id, updated_at FROM quiz_config"`.
