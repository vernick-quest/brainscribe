-- Add subject classification to sessions
alter table sessions
  add column if not exists subject text not null default 'unspecified'
    check (subject in (
      'english', 'humanities', 'history_us', 'history_world',
      'social_studies', 'civics', 'economics',
      'science_biology', 'science_chemistry', 'science_physics', 'science_general',
      'foreign_language', 'psychology', 'art', 'drama', 'music',
      'computer_science', 'health', 'personal_statement',
      'other', 'unspecified'
    )),
  add column if not exists subject_custom_label text;
