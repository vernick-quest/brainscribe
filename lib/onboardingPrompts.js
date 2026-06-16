// Rotating practice-prompt library for onboarding.
//
// Four categories. Each onboarding session draws ONE prompt from each category,
// so the student always sees a balanced set of four cards: one self-knowledge,
// one opinion, one hypothetical, one wildcard. Rotation means a student who
// resets onboarding rarely sees the same four, and it gives us a `prompt_key`
// to A/B which prompts lead to better first paragraphs later.
//
// Each prompt carries a `coach_opener` — a warm, topic-specific first line the
// coach can use instead of a generic greeting.

export const PROMPTS_SELF_KNOWLEDGE = [
  {
    key: 'skill',
    category: 'self_knowledge',
    icon: 'target',
    text: "What's a skill, hobby, or activity you're actually good at — and what makes you good at it?",
    coach_opener: "Everyone's got something they're genuinely good at. What's yours? Don't be modest — what do you actually do well?",
  },
  {
    key: 'surprise',
    category: 'self_knowledge',
    icon: 'bulb',
    text: "What's something you know a lot about that would surprise most people?",
    coach_opener: "Something you know way more about than people expect. Could be anything — what comes to mind?",
  },
  {
    key: 'got_better',
    category: 'self_knowledge',
    icon: 'trending',
    text: "What's something you used to be bad at that you got better at — and how did you do it?",
    coach_opener: "Think about something you've actually improved at — not something you're still bad at. What changed?",
  },
]

export const PROMPTS_OPINIONS = [
  {
    key: 'stuck_with_you',
    category: 'opinion',
    icon: 'film',
    text: "What's a movie, show, book, or game that actually stuck with you — and what made it hit different?",
    coach_opener: "Something that actually stayed with you after you finished it. Not your all-time favorite necessarily — just something that stuck. What comes to mind?",
  },
  {
    key: 'overrated',
    category: 'opinion',
    icon: 'question',
    text: "What's something most people seem to love that you just don't get — and why?",
    coach_opener: "Something everyone else is into that you just... don't get. Food, a show, a trend, anything. What's yours?",
  },
  {
    key: 'change_school',
    category: 'opinion',
    icon: 'school',
    text: "If you could change one thing about your school, what would it be and why?",
    coach_opener: "If you had the power to change one thing about your school — just one — what would it be? And why that thing?",
  },
]

export const PROMPTS_HYPOTHETICALS = [
  {
    key: 'job_for_a_day',
    category: 'hypothetical',
    icon: 'briefcase',
    text: "If you could have any job for one day just to see what it's like, what would you choose — and what do you think that day would actually be like?",
    coach_opener: "Any job in the world, just for one day. What would you pick? And more importantly — what do you think that day would actually be like?",
  },
  {
    key: 'anywhere',
    category: 'hypothetical',
    icon: 'globe',
    text: "If you could spend a week anywhere in the world, where would you go — and what would you actually do there?",
    coach_opener: "Anywhere in the world, one week, no limits. Where are you going — and what are you actually doing when you get there?",
  },
  {
    key: 'expert_overnight',
    category: 'hypothetical',
    icon: 'zap',
    text: "If you could wake up tomorrow as an expert in any subject or skill, what would you pick — and what would you do with it?",
    coach_opener: "You go to sleep tonight and wake up tomorrow as a genuine expert in something. Anything. What do you pick — and what's the first thing you do with it?",
  },
]

export const PROMPTS_WILDCARD = [
  {
    key: 'three_things',
    category: 'wildcard',
    icon: 'dice',
    text: "Describe your personality using three things — a place, an animal, and a type of weather. Why those three?",
    coach_opener: "This one's a bit different. A place, an animal, and a type of weather that represents you. What are yours — and why?",
  },
  {
    key: 'unpopular_opinion',
    category: 'wildcard',
    icon: 'flame',
    text: "What's an opinion you have that most people in your life would disagree with?",
    coach_opener: "Something you actually believe that people around you would push back on. Doesn't have to be controversial — just genuinely yours.",
  },
  {
    key: 'teach_one_thing',
    category: 'wildcard',
    icon: 'cap',
    text: "If you had to teach someone one thing you know well — in five minutes or less — what would you teach and how would you do it?",
    coach_opener: "You've got five minutes and one topic you know well. What are you teaching — and how do you actually explain it to someone who knows nothing about it?",
  },
]

const ALL_PROMPTS = [
  ...PROMPTS_SELF_KNOWLEDGE,
  ...PROMPTS_OPINIONS,
  ...PROMPTS_HYPOTHETICALS,
  ...PROMPTS_WILDCARD,
]

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// One prompt from each category — a balanced set of four cards. Card order is
// fixed (self-knowledge, opinion, hypothetical, wildcard) so the layout is stable.
export function selectOnboardingPrompts() {
  return [
    pickOne(PROMPTS_SELF_KNOWLEDGE),
    pickOne(PROMPTS_OPINIONS),
    pickOne(PROMPTS_HYPOTHETICALS),
    pickOne(PROMPTS_WILDCARD),
  ]
}

// Look up a prompt by its key (e.g. to recover the coach_opener after selection).
export function getPromptByKey(key) {
  return ALL_PROMPTS.find(p => p.key === key) ?? null
}
