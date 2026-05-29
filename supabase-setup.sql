-- ============================================================
--  GUESS WHO MAKER — Dizing Creative
--  Cole este SQL no Supabase SQL Editor e execute
-- ============================================================

-- Tabela de pedidos
CREATE TABLE orders (
  id              BIGSERIAL PRIMARY KEY,
  order_number    TEXT UNIQUE NOT NULL,
  order_id        TEXT,
  client_name     TEXT NOT NULL,
  client_phone    TEXT,
  game_title      TEXT,
  status          TEXT DEFAULT 'waiting',
  photos_count    INT DEFAULT 0,
  cards_pdf_url   TEXT,
  board_pdf_url   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de pessoas (24 por pedido)
CREATE TABLE people (
  id            BIGSERIAL PRIMARY KEY,
  order_number  TEXT REFERENCES orders(order_number) ON DELETE CASCADE,
  slot          INT NOT NULL,
  name          TEXT NOT NULL,
  photo_url     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Storage buckets (crie no painel do Supabase > Storage)
-- 1. Bucket: "photos"   — Public: YES
-- 2. Bucket: "pdfs"     — Public: YES

-- RLS (Row Level Security) — permite inserção pública
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on orders"
  ON orders FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow public insert on people"
  ON people FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow service role full access on orders"
  ON orders FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service role full access on people"
  ON people FOR ALL TO service_role USING (true);
