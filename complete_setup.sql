-- =============================================================================
-- White Label AI Chatbot — PostgreSQL complete setup
-- =============================================================================
--
-- WHERE TO RUN THIS
--   Run in any PostgreSQL SQL editor (Supabase SQL Editor, Neon SQL Editor, psql, etc.)
--
-- DATABASE NAME
--   This script creates tables in the CURRENT database, schema public.
--   (Do not run CREATE DATABASE in managed dashboards unless your provider allows it.)
--
-- SCHEMA
--   Tables below live in schema:  public  (default). Your Node app uses these
--   table names without a schema prefix (search_path includes public).
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Main table: one row per customer chatbot (encrypted website context)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_contexts (
  chatbot_id TEXT NOT NULL,
  password_lookup_hash TEXT NOT NULL,
  record_json JSONB NOT NULL,
  trial_ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chatbot_contexts_pkey PRIMARY KEY (chatbot_id),
  CONSTRAINT chatbot_contexts_id_format_chk CHECK (chatbot_id ~ '^\d{8}$'),
  CONSTRAINT chatbot_contexts_password_hash_uk UNIQUE (password_lookup_hash)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_contexts_trial_ends_at
  ON public.chatbot_contexts (trial_ends_at);

CREATE INDEX IF NOT EXISTS idx_chatbot_contexts_created_at
  ON public.chatbot_contexts (created_at DESC);

COMMENT ON TABLE public.chatbot_contexts IS
  'Per-tenant chatbot: encrypted scrape + theme metadata in record_json. password_lookup_hash = HMAC-SHA256(password, server CONTEXT_PASSWORD_PEPPER). Plain passwords are never stored.';

COMMENT ON COLUMN public.chatbot_contexts.chatbot_id IS 'Public 8-digit ID (10000000–99999999).';
COMMENT ON COLUMN public.chatbot_contexts.password_lookup_hash IS 'Deterministic lookup key for “Test chatbot” unlock; not reversible to password.';
COMMENT ON COLUMN public.chatbot_contexts.record_json IS 'Server record JSON: v, chatbotId, createdAt, trialEndsAt, encrypted { salt, iv, tag, ciphertext }, note.';
COMMENT ON COLUMN public.chatbot_contexts.trial_ends_at IS 'When the hosted trial expires for this chatbot.';
COMMENT ON COLUMN public.chatbot_contexts.created_at IS 'First save time.';
COMMENT ON COLUMN public.chatbot_contexts.updated_at IS 'Last update time (optional; backend may only insert today).';

-- Keep updated_at fresh if you later add UPDATEs from SQL or app
CREATE OR REPLACE FUNCTION public.set_chatbot_contexts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chatbot_contexts_updated_at ON public.chatbot_contexts;
CREATE TRIGGER trg_chatbot_contexts_updated_at
  BEFORE UPDATE ON public.chatbot_contexts
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_chatbot_contexts_updated_at();


CREATE TABLE IF NOT EXISTS public.trial_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  chatbot_id TEXT,

  CONSTRAINT trial_inquiries_chatbot_id_chk CHECK (
    chatbot_id IS NULL OR chatbot_id ~ '^\d{8}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_trial_inquiries_created_at
  ON public.trial_inquiries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trial_inquiries_email
  ON public.trial_inquiries (email);

CREATE INDEX IF NOT EXISTS idx_trial_inquiries_chatbot_id
  ON public.trial_inquiries (chatbot_id)
  WHERE chatbot_id IS NOT NULL;

COMMENT ON TABLE public.trial_inquiries IS
  'Optional store for “trial ended” contact submissions (name, email, phone, message, optional chatbot_id).';

-- ---------------------------------------------------------------------------
-- 3) Test chat message log (persistent history; thread_id resets on “Clear chat”)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id TEXT NOT NULL,
  thread_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_chat_messages_chatbot_id_chk CHECK (chatbot_id ~ '^\d{8}$')
);

CREATE INDEX IF NOT EXISTS idx_chatbot_chat_messages_bot_created
  ON public.chatbot_chat_messages (chatbot_id, created_at ASC);

COMMENT ON TABLE public.chatbot_chat_messages IS
  'Test chat per chatbot; thread_id scopes one conversation before Clear.';
