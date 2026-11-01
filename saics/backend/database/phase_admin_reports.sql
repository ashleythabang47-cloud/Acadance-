-- Add indexes used by date-bounded admin reports. Safe to reapply.
USE saics_db;

SET @admin_report_index_sql = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'students'
       AND index_name = 'idx_students_created_at') = 0,
    'CREATE INDEX idx_students_created_at ON students (created_at)',
    'SELECT 1'
);
PREPARE admin_report_index_stmt FROM @admin_report_index_sql;
EXECUTE admin_report_index_stmt;
DEALLOCATE PREPARE admin_report_index_stmt;

SET @admin_report_index_sql = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'students'
       AND index_name = 'idx_students_last_login') = 0,
    'CREATE INDEX idx_students_last_login ON students (last_login_at)',
    'SELECT 1'
);
PREPARE admin_report_index_stmt FROM @admin_report_index_sql;
EXECUTE admin_report_index_stmt;
DEALLOCATE PREPARE admin_report_index_stmt;

SET @admin_report_index_sql = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'performance_records'
       AND index_name = 'idx_performance_assessment_subject') = 0,
    'CREATE INDEX idx_performance_assessment_subject ON performance_records (assessment_date, subject_id)',
    'SELECT 1'
);
PREPARE admin_report_index_stmt FROM @admin_report_index_sql;
EXECUTE admin_report_index_stmt;
DEALLOCATE PREPARE admin_report_index_stmt;

SET @admin_report_index_sql = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'quiz_attempts'
       AND index_name = 'idx_quiz_attempts_started_quiz') = 0,
    'CREATE INDEX idx_quiz_attempts_started_quiz ON quiz_attempts (started_at, quiz_id)',
    'SELECT 1'
);
PREPARE admin_report_index_stmt FROM @admin_report_index_sql;
EXECUTE admin_report_index_stmt;
DEALLOCATE PREPARE admin_report_index_stmt;
