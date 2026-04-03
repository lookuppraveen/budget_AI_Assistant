-- Drop old format check and add pdf support
ALTER TABLE manual_reports
  DROP CONSTRAINT IF EXISTS manual_reports_format_check;

ALTER TABLE manual_reports
  ADD CONSTRAINT manual_reports_format_check
    CHECK (format IN ('txt', 'docx', 'pdf'));
