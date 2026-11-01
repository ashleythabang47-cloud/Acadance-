-- Apply against saics_db after schema.sql (and rerun safely if needed).
USE saics_db;

SET @performance_source_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'performance_records'
      AND column_name = 'source'
);
SET @performance_source_sql = IF(
    @performance_source_exists = 0,
    'ALTER TABLE performance_records ADD COLUMN source ENUM(''manual'', ''quiz'') NOT NULL DEFAULT ''manual''',
    'SELECT 1'
);
PREPARE performance_source_stmt FROM @performance_source_sql;
EXECUTE performance_source_stmt;
DEALLOCATE PREPARE performance_source_stmt;

SET @performance_quiz_column_exists = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'performance_records'
      AND column_name = 'quiz_attempt_id'
);
SET @performance_quiz_column_sql = IF(
    @performance_quiz_column_exists = 0,
    'ALTER TABLE performance_records ADD COLUMN quiz_attempt_id INT NULL',
    'SELECT 1'
);
PREPARE performance_quiz_column_stmt FROM @performance_quiz_column_sql;
EXECUTE performance_quiz_column_stmt;
DEALLOCATE PREPARE performance_quiz_column_stmt;

SET @performance_quiz_index_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'performance_records'
      AND index_name = 'uq_performance_quiz_attempt'
);
SET @performance_quiz_index_sql = IF(
    @performance_quiz_index_exists = 0,
    'CREATE UNIQUE INDEX uq_performance_quiz_attempt ON performance_records (quiz_attempt_id)',
    'SELECT 1'
);
PREPARE performance_quiz_index_stmt FROM @performance_quiz_index_sql;
EXECUTE performance_quiz_index_stmt;
DEALLOCATE PREPARE performance_quiz_index_stmt;

SET @performance_quiz_fk_exists = (
    SELECT COUNT(*) FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'performance_records'
      AND constraint_name = 'fk_performance_quiz_attempt'
);
SET @performance_quiz_fk_sql = IF(
    @performance_quiz_fk_exists = 0,
    'ALTER TABLE performance_records ADD CONSTRAINT fk_performance_quiz_attempt FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts (attempt_id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE performance_quiz_fk_stmt FROM @performance_quiz_fk_sql;
EXECUTE performance_quiz_fk_stmt;
DEALLOCATE PREPARE performance_quiz_fk_stmt;
