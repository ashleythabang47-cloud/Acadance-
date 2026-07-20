-- Phase 3: Streaks & Gamification
-- Run this after schema.sql (and seed.sql, if you used it).
USE saics_db;

-- Tracks one row per student per calendar day they did something
-- countable (logged in, logged a result, attempted a quiz, joined a
-- study session). This is what streaks and the dashboard bar chart
-- are actually calculated from.
CREATE TABLE IF NOT EXISTS daily_activity (
    student_id      INT NOT NULL,
    activity_date   DATE NOT NULL,
    activity_count  INT DEFAULT 1,
    PRIMARY KEY (student_id, activity_date),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);
