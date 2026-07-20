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
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('student', 'admin') DEFAULT 'student',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

-- ------------------------------------------------------------
-- Helpful indexes
-- ------------------------------------------------------------
CREATE INDEX idx_performance_student ON performance_records(student_id);
CREATE INDEX idx_predictions_student ON predictions(student_id);
CREATE INDEX idx_notifications_student ON notifications(student_id, is_read);
