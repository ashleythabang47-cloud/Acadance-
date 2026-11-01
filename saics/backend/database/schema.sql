-- ============================================================
-- Student Academic Insights & Collaborative System (SAICS)
-- Database Schema (MySQL)
-- Author: Thabang Ashley Phahlamohlaka
-- ============================================================

CREATE DATABASE IF NOT EXISTS saics_db;
USE saics_db;

-- ------------------------------------------------------------
-- 1. STUDENTS
-- ------------------------------------------------------------
CREATE TABLE students (
    student_id      INT AUTO_INCREMENT PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(254) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('student', 'admin') DEFAULT 'student',
    email_verified  BOOLEAN NOT NULL DEFAULT TRUE,
    is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMP NULL,
    token_version   INT NOT NULL DEFAULT 0,
    force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    lockout_until   TIMESTAMP NULL,
    last_login_at   TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE email_otps (
    student_id      INT NOT NULL PRIMARY KEY,
    otp_hash        CHAR(64) NOT NULL,
    expires_at      TIMESTAMP NOT NULL,
    attempts        TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_otps_student
        FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    INDEX idx_email_otps_expiry (expires_at),
    INDEX idx_email_otps_created (created_at)
);

-- ------------------------------------------------------------
-- 2. SUBJECTS (modules a student is enrolled in)
-- ------------------------------------------------------------
CREATE TABLE subjects (
    subject_id      INT AUTO_INCREMENT PRIMARY KEY,
    subject_name    VARCHAR(150) NOT NULL,
    subject_code    VARCHAR(20) NOT NULL UNIQUE
);

CREATE TABLE student_subjects (
    student_id      INT NOT NULL,
    subject_id      INT NOT NULL,
    PRIMARY KEY (student_id, subject_id),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 3. PERFORMANCE RECORDS (scores, grades)
-- ------------------------------------------------------------
CREATE TABLE performance_records (
    record_id       INT AUTO_INCREMENT PRIMARY KEY,
    student_id      INT NOT NULL,
    subject_id      INT NOT NULL,
    assessment_name VARCHAR(150) NOT NULL,      -- e.g. "Test 1", "Assignment 2"
    score           DECIMAL(5,2) NOT NULL,
    max_score       DECIMAL(5,2) NOT NULL DEFAULT 100,
    assessment_date DATE NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 4. QUIZZES & QUESTIONS
-- ------------------------------------------------------------
CREATE TABLE quizzes (
    quiz_id         INT AUTO_INCREMENT PRIMARY KEY,
    subject_id      INT NOT NULL,
    title           VARCHAR(150) NOT NULL,
    difficulty      ENUM('easy', 'medium', 'hard') DEFAULT 'medium',
    is_hidden       BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMP NULL,
    created_by      INT,                          -- student_id or admin who generated it
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES students(student_id) ON DELETE SET NULL
);

CREATE TABLE quiz_questions (
    question_id     INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id         INT NOT NULL,
    question_text   TEXT NOT NULL,
    question_type   ENUM('multiple_choice', 'short_answer', 'long_answer') NOT NULL,
    correct_answer  TEXT,                         -- reference answer for auto-marking
    model_answer    TEXT,
    rubric          JSON,
    is_hidden       BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMP NULL,
    option_a        VARCHAR(255),
    option_b        VARCHAR(255),
    option_c        VARCHAR(255),
    option_d         VARCHAR(255),
    FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
);

CREATE TABLE quiz_attempts (
    attempt_id      INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id         INT NOT NULL,
    student_id      INT NOT NULL,
    score           DECIMAL(5,2),
    max_score       DECIMAL(5,2),
    grading_status  ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
    started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP NULL,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

CREATE TABLE quiz_attempt_answers (
    answer_id       INT AUTO_INCREMENT PRIMARY KEY,
    attempt_id      INT NOT NULL,
    question_id     INT NOT NULL,
    student_answer  TEXT,
    is_correct      BOOLEAN,
    score           DECIMAL(5,2),
    max_score       DECIMAL(5,2),
    feedback        TEXT,
    criterion_comments JSON,
    grading_status  ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES quiz_questions(question_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 5. STUDY SESSIONS (voice-based collaboration)
-- ------------------------------------------------------------
CREATE TABLE study_sessions (
    session_id      INT AUTO_INCREMENT PRIMARY KEY,
    subject_id      INT,
    host_id         INT NOT NULL,
    title           VARCHAR(150),
    started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at        TIMESTAMP NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE SET NULL,
    FOREIGN KEY (host_id) REFERENCES students(student_id) ON DELETE CASCADE
);

CREATE TABLE study_session_participants (
    session_id      INT NOT NULL,
    student_id      INT NOT NULL,
    joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at         TIMESTAMP NULL,
    PRIMARY KEY (session_id, student_id),
    FOREIGN KEY (session_id) REFERENCES study_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 6. STREAKS (gamification)
-- ------------------------------------------------------------
CREATE TABLE streaks (
    streak_id           INT AUTO_INCREMENT PRIMARY KEY,
    student_id           INT NOT NULL UNIQUE,
    current_streak       INT DEFAULT 0,
    longest_streak        INT DEFAULT 0,
    last_activity_date    DATE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 7. PREDICTIONS (AI outputs)
-- ------------------------------------------------------------
CREATE TABLE predictions (
    prediction_id     INT AUTO_INCREMENT PRIMARY KEY,
    student_id        INT NOT NULL,
    subject_id        INT NOT NULL,
    predicted_grade    DECIMAL(5,2),
    risk_level        ENUM('low', 'medium', 'high') DEFAULT 'low',
    recommendation    TEXT,
    generated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE
);

CREATE TABLE risk_analysis_state (
    student_id      INT NOT NULL PRIMARY KEY,
    level           ENUM('insufficient_data', 'low', 'medium', 'high') NOT NULL,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    INDEX idx_risk_analysis_level (level, updated_at)
);

-- ------------------------------------------------------------
-- 8. NOTIFICATIONS
-- ------------------------------------------------------------
CREATE TABLE notifications (
    notification_id   INT AUTO_INCREMENT PRIMARY KEY,
    student_id        INT NOT NULL,
    message           VARCHAR(255) NOT NULL,
    type              ENUM('alert', 'reminder', 'suggestion') DEFAULT 'reminder',
    is_read           BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
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

CREATE TABLE ai_provider_events (
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

CREATE TABLE content_flags (
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

CREATE TABLE announcements (
    announcement_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NULL,
    message VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_announcements_created (created_at),
    CONSTRAINT fk_announcement_admin FOREIGN KEY (admin_id) REFERENCES students(student_id) ON DELETE SET NULL
);

DELIMITER //
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are append-only';
END//
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are append-only';
END//
DELIMITER ;

-- ------------------------------------------------------------
-- Helpful indexes
-- ------------------------------------------------------------
CREATE INDEX idx_performance_student ON performance_records(student_id);
CREATE INDEX idx_predictions_student ON predictions(student_id);
CREATE INDEX idx_notifications_student ON notifications(student_id, is_read);
