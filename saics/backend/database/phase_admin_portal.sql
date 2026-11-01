-- Apply against an existing saics_db to add the admin portal schema.
-- IF NOT EXISTS keeps this migration safe for databases where a subset of
-- these columns or tables is already present.
USE saics_db;

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL;

ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

ALTER TABLE quiz_questions
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id VARCHAR(128) NULL,
    action VARCHAR(100) NOT NULL,
    before_values JSON NULL,
    after_values JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_actor (actor_id, created_at),
    INDEX idx_audit_action (action, created_at)
);

CREATE TABLE IF NOT EXISTS ai_provider_events (
    event_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    provider ENUM('groq', 'gemini', 'ollama') NOT NULL,
    operation ENUM('generation', 'grading') NOT NULL,
    succeeded BOOLEAN NOT NULL,
    rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
    error_message VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_events_created (created_at),
    INDEX idx_ai_events_provider (provider, operation, created_at)
);

CREATE TABLE IF NOT EXISTS content_flags (
    flag_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT NULL,
    quiz_id INT NULL,
    question_id INT NULL,
    reason VARCHAR(1000) NOT NULL,
    status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
    resolved_by INT NULL,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_flags_status_created (status, created_at),
    CONSTRAINT fk_flag_reporter FOREIGN KEY (reporter_id) REFERENCES students(student_id) ON DELETE SET NULL,
    CONSTRAINT fk_flag_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE SET NULL,
    CONSTRAINT fk_flag_question FOREIGN KEY (question_id) REFERENCES quiz_questions(question_id) ON DELETE SET NULL,
    CONSTRAINT fk_flag_resolver FOREIGN KEY (resolved_by) REFERENCES students(student_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS announcements (
    announcement_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NULL,
    message VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_announcements_created (created_at),
    CONSTRAINT fk_announcement_admin FOREIGN KEY (admin_id) REFERENCES students(student_id) ON DELETE SET NULL
);

DELIMITER //
DROP TRIGGER IF EXISTS audit_logs_no_update//
DROP TRIGGER IF EXISTS audit_logs_no_delete//
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are append-only';
END//
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are append-only';
END//
DELIMITER ;
