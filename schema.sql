-- Mesmo SQL que o Worker roda sozinho no primeiro acesso (ensureSchema).
CREATE TABLE IF NOT EXISTS quiz_config (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS config_history (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, published_at TEXT NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, nome TEXT, whatsapp TEXT, email TEXT, perfil TEXT, renda TEXT, sobra TEXT, gap_mes INTEGER, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT, sid TEXT, page TEXT, respostas TEXT);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE TABLE IF NOT EXISTS events (sid TEXT NOT NULL, step TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (sid, step));
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
