-- Student profile setup
-- Adds fields for bio, academic year, and a simple avatar color
-- (no file upload infrastructure — keeping this lightweight).
USE saics_db;

ALTER TABLE students
  ADD COLUMN bio VARCHAR(255) NULL,
  ADD COLUMN academic_year VARCHAR(50) NULL,
  ADD COLUMN avatar_color VARCHAR(7) DEFAULT '#0e6e66';
