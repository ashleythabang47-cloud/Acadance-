-- Run once (or rerun safely) against saics_db using MySQL Workbench.
USE saics_db;

ALTER TABLE students
    MODIFY COLUMN email VARCHAR(254) NOT NULL;

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE students SET email_verified = TRUE WHERE email_verified IS NULL;

CREATE TABLE IF NOT EXISTS email_otps (
    student_id INT NOT NULL PRIMARY KEY,
    otp_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_otps_student
        FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    INDEX idx_email_otps_expiry (expires_at),
    INDEX idx_email_otps_created (created_at)
);
