-- Optional seed data — run this after schema.sql if you want some
-- subjects pre-populated instead of adding them one by one via the app.
USE saics_db;

INSERT INTO subjects (subject_name, subject_code) VALUES
  ('Software Development', 'ITSWD1'),
  ('Database Systems', 'ITDBS1'),
  ('Web Application Development', 'ITWAD1'),
  ('Networking', 'ITNET1'),
  ('Project Management', 'ITPMG1')
ON DUPLICATE KEY UPDATE subject_name = VALUES(subject_name);
