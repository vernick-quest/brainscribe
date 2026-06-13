export const SUBJECTS = [
  { value: 'english',            label: 'English / Language Arts'         },
  { value: 'humanities',         label: 'Humanities'                      },
  { value: 'history_us',         label: 'History — US'                    },
  { value: 'history_world',      label: 'History — World'                 },
  { value: 'social_studies',     label: 'Social Studies'                  },
  { value: 'civics',             label: 'Civics / Government'             },
  { value: 'economics',          label: 'Economics'                       },
  { value: 'science_biology',    label: 'Science — Biology'               },
  { value: 'science_chemistry',  label: 'Science — Chemistry'             },
  { value: 'science_physics',    label: 'Science — Physics'               },
  { value: 'science_general',    label: 'Science — Earth / General'       },
  { value: 'foreign_language',   label: 'Foreign Language'                },
  { value: 'psychology',         label: 'Psychology'                      },
  { value: 'art',                label: 'Art / Art History'               },
  { value: 'drama',              label: 'Drama / Theater'                 },
  { value: 'music',              label: 'Music'                           },
  { value: 'computer_science',   label: 'Computer Science'                },
  { value: 'health',             label: 'Health'                          },
  { value: 'personal_statement', label: 'Personal Statement / College App'},
  { value: 'other',              label: 'Other'                           },
]

export const UNSPECIFIED_SUBJECT = { value: 'unspecified', label: 'Select a subject…' }

export function getSubject(value) {
  return SUBJECTS.find(s => s.value === value) ?? UNSPECIFIED_SUBJECT
}

export function getSubjectLabel(session) {
  if (!session.subject || session.subject === 'unspecified') return null
  if (session.subject === 'other') return session.subject_custom_label || 'Other'
  return getSubject(session.subject).label
}
