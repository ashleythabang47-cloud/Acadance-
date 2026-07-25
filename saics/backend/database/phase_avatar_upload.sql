-- Adds support for uploaded profile pictures, on top of the existing
-- color-avatar fallback. avatar_url is NULL until a student uploads a
-- real photo; the frontend falls back to the colored initial otherwise.
USE saics_db;

ALTER TABLE students
  ADD COLUMN avatar_url VARCHAR(255) NULL AFTER avatar_color;
