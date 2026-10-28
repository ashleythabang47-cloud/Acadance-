-- AI question generation and long-answer grading fields for databases created
-- before these columns were added to schema.sql. Do not run on a fresh schema.
USE saics_db;

ALTER TABLE quiz_questions
    ADD COLUMN model_answer TEXT NULL,
    ADD COLUMN rubric JSON NULL;

ALTER TABLE quiz_attempts
    ADD COLUMN grading_status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending';

ALTER TABLE quiz_attempt_answers
    ADD COLUMN score DECIMAL(5,2) NULL,
    ADD COLUMN max_score DECIMAL(5,2) NULL,
    ADD COLUMN feedback TEXT NULL,
    ADD COLUMN criterion_comments JSON NULL,
    ADD COLUMN grading_status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending';
