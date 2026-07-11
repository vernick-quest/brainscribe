// Curated writing-form + sample-prompt library for the "What do you want to
// write?" chooser (components/WritingFormChooser.js). A plain config so it's easy
// to extend — add a form object, or push a sample onto an existing form.
//
// HOW THE FORM HINT REACHES THE COACH (no migration):
//   The coach re-reads assignment_text from the DB and INFERS the form from it —
//   it already scaffolds a haiku as 5/7/5 and distinguishes custom vs prose off
//   the assignment wording alone (see lib/prompts.js: [SCAFFOLD:type:count] +
//   Rule 2 ASSIGNMENT ANALYSIS). So every prompt below NAMES its form in the
//   text ("Write a haiku…", "Write a persuasive letter…"). Filling the assignment
//   box with that text is the whole thread — custom forms scaffold as custom,
//   prose as prose, with no new column and no API change.
//
//   `type` ('prose' | 'custom') is carried for the UI (and future per-form
//   tuning); the persisted, load-bearing signal is the prompt text itself.

export const SAMPLE_LIBRARY = [
  {
    id: 'poetry',
    name: 'Poetry',
    type: 'custom',
    icon: 'sparkles',
    blurb: 'Play with words, rhythm, and images.',
    // Fills the box when the student picks "Write my own" — a light form-naming
    // scaffold line they finish. The blank keeps their topic theirs.
    ownStarter: 'Write a poem about ',
    samples: [
      { id: 'haiku-object', label: 'Haiku about an everyday object', prompt: 'Write a haiku about an everyday object you see all the time — a pencil, a spoon, your backpack. (A haiku is three lines: 5 syllables, then 7, then 5.)' },
      { id: 'free-verse-place', label: 'Free-verse poem about a place you love', prompt: 'Write a free-verse poem about a place you love. No rhyme or rhythm rules — just paint the place with words and images.' },
      { id: 'acrostic-name', label: 'Acrostic of your name', prompt: 'Write an acrostic poem using the letters of your name. Each line starts with the next letter and says something true about you.' },
    ],
  },
  {
    id: 'paragraph',
    name: 'A paragraph',
    type: 'prose',
    icon: 'pencil',
    blurb: 'One tight, well-built paragraph.',
    ownStarter: 'Write a paragraph about ',
    samples: [
      { id: 'senses-place', label: 'Describe a place using all five senses', prompt: 'Write one vivid paragraph describing a place you know well, using all five senses — what you see, hear, smell, taste, and touch there.' },
      { id: 'school-change', label: 'Argue for a small change at your school', prompt: 'Write one persuasive paragraph arguing for one small change you would make at your school. Give a clear reason and a real example.' },
      { id: 'how-to', label: "Explain how to do something you're good at", prompt: 'Write one clear paragraph explaining how to do something you are good at, step by step, so that a beginner could follow it.' },
    ],
  },
  {
    id: 'letter',
    name: 'A letter',
    type: 'custom',
    icon: 'mail',
    blurb: 'Write to a real or imagined reader.',
    ownStarter: 'Write a letter to ',
    samples: [
      { id: 'principal', label: 'Persuasive letter to your principal', prompt: 'Write a persuasive letter to your principal asking for one change you would like to see at school. Be polite, give reasons, and make your case.' },
      { id: 'thank-you', label: 'Thank-you letter to someone who helped you', prompt: 'Write a thank-you letter to someone who helped you. Tell them what they did and why it mattered to you.' },
      { id: 'future-self', label: 'Letter to your future self', prompt: 'Write a letter to your future self, five years from now. What do you want them to remember about who you are today?' },
    ],
  },
  {
    id: 'essay',
    name: 'An essay',
    type: 'prose',
    icon: 'doc',
    blurb: 'Build an argument across paragraphs.',
    ownStarter: 'Write an essay about ',
    samples: [
      { id: 'four-day-week', label: 'Should your school switch to a 4-day week?', prompt: 'Write a persuasive essay arguing whether your school should switch to a four-day week. Take a side and back it up with reasons and examples.' },
      { id: 'moment-changed', label: 'A moment that changed how you think', prompt: 'Write a narrative essay about a moment that changed how you think about something. Tell the story, then reflect on what it taught you.' },
      { id: 'character-change', label: 'Does the main character really change?', prompt: 'Write an essay arguing whether the main character in a book you have read really changes by the end. Use specific evidence from the text.' },
    ],
  },
  {
    id: 'story',
    name: 'A short story',
    type: 'custom',
    icon: 'book',
    blurb: 'Tell a story with a beginning, middle, and end.',
    ownStarter: 'Write a short story about ',
    samples: [
      { id: 'locked-door', label: 'A story that starts with a locked door', prompt: 'Write a short story that starts with a locked door. Who is there, what is behind it, and what happens? Give it a beginning, middle, and end.' },
      { id: 'villain-view', label: "Rewrite a fairy tale from the villain's view", prompt: 'Rewrite a fairy tale you know from the villain’s point of view. What is their side of the story?' },
      { id: 'wrong-then-right', label: 'A day everything went wrong (then right)', prompt: 'Write a short story about a day when everything went wrong — and then somehow turned out right.' },
    ],
  },
  {
    id: 'speech',
    name: 'A speech',
    type: 'custom',
    icon: 'mic',
    blurb: 'Write to be heard out loud.',
    ownStarter: 'Write a speech about ',
    samples: [
      { id: 'one-minute-change', label: "A 1-minute speech on something you'd change", prompt: 'Write a one-minute speech about one thing you would change if you could. Make your audience care about it.' },
      { id: 'favorite-hobby', label: 'Convince your class to try your favorite hobby', prompt: 'Write a short speech convincing your class to try your favorite hobby. Tell them why you love it.' },
      { id: 'accept-award', label: 'Accept an award for a talent you wish you had', prompt: 'Write a short acceptance speech for an award you wish you could win. What would you say, and who would you thank?' },
    ],
  },
]

// Convenience lookup used by the chooser when returning a selection.
export function getForm(formId) {
  return SAMPLE_LIBRARY.find(f => f.id === formId) ?? null
}
