-- Adds a short, human-shareable join code to study sessions
-- (e.g. "7X2K9Q") so students can join by typing a code instead of
-- browsing the session list or sharing a raw link.
USE saics_db;

ALTER TABLE study_sessions
  ADD COLUMN join_code VARCHAR(10) NULL UNIQUE AFTER title;
