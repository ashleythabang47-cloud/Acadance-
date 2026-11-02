-- Add offline grading/generation monitoring and grading source attribution.
USE saics_db;

ALTER TABLE ai_provider_events
    MODIFY COLUMN provider ENUM('groq', 'gemini', 'ollama', 'local-engine') NOT NULL;

ALTER TABLE quiz_attempt_answers
    ADD COLUMN IF NOT EXISTS grading_source ENUM('ai-provider', 'local-engine') NULL;
