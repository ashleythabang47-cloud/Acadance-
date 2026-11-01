-- Run against saics_db for existing installations; safe to rerun.
USE saics_db;

CREATE TABLE IF NOT EXISTS risk_analysis_state (
    student_id INT NOT NULL PRIMARY KEY,
    level ENUM('insufficient_data', 'low', 'medium', 'high') NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_risk_analysis_student
        FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    INDEX idx_risk_analysis_level (level, updated_at)
);
