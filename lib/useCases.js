// Content for the answer-first use-case pages under /writing-help/[topic].
// Rules baked in (see the GEO playbook): one topic per page; the lead is a
// question-format H2 with a complete, self-contained 40–60-word answer directly
// beneath it; supporting sections are also answer-first; tone is NEUTRAL and
// factual (promotional tone suppresses AI citations); where natural, one
// quotable, attributed claim. The lead + sections feed the page's FAQPage
// schema, so every `answer` here must match what renders on the page.

export const USE_CASES = {
  adhd: {
    h1: 'Writing help for a child with ADHD',
    metaTitle: 'Writing help for a child with ADHD',
    metaDescription:
      'Practical, voice-first ways to help a child with ADHD who struggles to write — why writing is hard, whether talking it out helps, and how a coaching approach fits.',
    lead: {
      question: 'How can you help a child with ADHD who struggles to write?',
      answer:
        'Break writing into small spoken steps instead of one blank page. Many kids with ADHD know what they want to say but stall on starting, organizing, and holding the thread. Let them talk their ideas out loud, capture the words as they speak, and build the piece one approved sentence at a time.',
    },
    citation: {
      text: 'The CDC estimates that about 1 in 9 U.S. children aged 3–17 has been diagnosed with ADHD.',
      sourceName: 'CDC',
      sourceUrl: 'https://www.cdc.gov/adhd/data/',
    },
    sections: [
      {
        question: 'Why is writing so hard for kids with ADHD?',
        answer:
          'Writing demands several executive-function skills at once — starting a task, sequencing ideas, holding a thought in working memory, and checking your own work. For many kids with ADHD those coordinating skills lag even when the ideas are strong, so the blank page feels impossible even though they can explain the topic out loud.',
      },
      {
        question: 'Does talking it out actually help?',
        answer:
          'Often, yes. Speaking sidesteps the handwriting and typing bottleneck and lets a child get ideas out at the speed they think. The remaining challenge is turning that speech into organized writing — which is where a coach that asks focused questions and captures the student’s own words can bridge the gap.',
      },
      {
        question: 'How does BrainScribe help a student with ADHD?',
        answer:
          'BrainScribe is a voice-first writing coach. It asks one Socratic question at a time, the student answers out loud, and a scribe cleans their spoken words into a paragraph they approve. It never writes the content for them, and parents or teachers can read the full transcript to confirm the work is the student’s own.',
      },
    ],
    related: ['dysgraphia', 'twice-exceptional', 'without-cheating'],
  },

  dysgraphia: {
    h1: 'Writing help for a child with dysgraphia',
    metaTitle: 'Writing help for a child with dysgraphia',
    metaDescription:
      'What kind of writing tool helps a child with dysgraphia — why the mechanics of writing get in the way, whether speech-to-text is enough, and how a voice-first coach fits.',
    lead: {
      question: 'What kind of writing tool helps a child with dysgraphia?',
      answer:
        'Tools that remove the physical act of writing help most. Dysgraphia makes handwriting — and often typing — slow and effortful, which pulls focus away from ideas and spelling. Speech-to-text lets a child compose by talking, so the words on the page reflect their thinking instead of their fine-motor struggle.',
    },
    citation: {
      text: 'Dysgraphia is a recognized learning difference that affects handwriting, spelling, and written expression, and often coexists with ADHD or dyslexia.',
      sourceName: 'Understood.org',
      sourceUrl: 'https://www.understood.org/en/articles/8-tools-for-kids-with-dysgraphia',
    },
    sections: [
      {
        question: 'What is dysgraphia?',
        answer:
          'Dysgraphia is a learning difference that affects written expression — handwriting, spelling, and getting thoughts onto paper. A child can be a strong thinker and speaker yet find the mechanics of writing exhausting. It frequently coexists with ADHD or dyslexia.',
      },
      {
        question: 'Is speech-to-text enough on its own?',
        answer:
          'Dictation removes the motor barrier, but raw speech is messy — full of restarts and filler — and a child still needs help shaping it into organized writing. A coaching approach that asks guiding questions and tidies the student’s own spoken words into clean sentences goes further than transcription alone.',
      },
      {
        question: 'How does BrainScribe support a student with dysgraphia?',
        answer:
          'BrainScribe lets the student speak instead of type. A scribe removes the filler from what they said and forms a paragraph in their own words, which they review and approve. The ideas, structure, and wording stay the student’s — the tool only removes the physical friction and the blank-page freeze.',
      },
    ],
    related: ['adhd', 'twice-exceptional', 'blank-page'],
  },

  'twice-exceptional': {
    h1: 'Writing help for a twice-exceptional (2e) child',
    metaTitle: 'Writing help for a twice-exceptional (2e) child',
    metaDescription:
      'How to help a gifted child who struggles to write. Why twice-exceptional (2e) kids have strong ideas but stall on the page, and how a voice-first coaching approach fits.',
    lead: {
      question: 'How do you help a gifted child who struggles to write?',
      answer:
        'Start from what they’re good at: talking. Gifted kids who struggle to write usually have strong, complex ideas but hit a wall on the mechanics — handwriting, spelling, organizing it fast enough. Let them say their thinking out loud and capture it, so the page reflects their ideas instead of their handwriting.',
    },
    citation: {
      text: 'Twice-exceptional students — gifted children who also have a learning difficulty such as dysgraphia, dyslexia, or ADHD — are among the most under-identified and underserved populations in schools.',
      sourceName: 'Davidson Institute',
      sourceUrl: 'https://www.davidsongifted.org/gifted-blog/twice-exceptional-definition-characteristics-identification/',
    },
    sections: [
      {
        question: 'What does twice-exceptional (2e) mean?',
        answer:
          'Twice-exceptional — or 2e — describes a child who is gifted and also has a learning difference such as dysgraphia, dyslexia, or ADHD. The two can hide each other: the giftedness masks the difficulty and the difficulty masks the giftedness, which is why 2e students are so often under-identified.',
      },
      {
        question: 'Why do so many gifted kids struggle with writing?',
        answer:
          'The ideas usually aren’t the problem — the output is. A 2e child can hold sophisticated thoughts but stall on the physical and organizational parts of writing: handwriting, spelling, sequencing, and getting it all down before it slips away. The result is written work that badly under-represents what the child actually knows.',
      },
      {
        question: 'How does BrainScribe help a twice-exceptional writer?',
        answer:
          'BrainScribe plays to a 2e child’s strengths — their thinking and their talking. The student speaks their ideas, the coach asks questions to draw them out, and a scribe tidies their own words into clean paragraphs they approve. It clears the mechanical wall without touching the ideas, and the transcript shows the work is genuinely theirs.',
      },
    ],
    related: ['dysgraphia', 'adhd', 'blank-page'],
  },

  'blank-page': {
    h1: 'How to help a kid who freezes at a blank page',
    metaTitle: 'How to help a kid who freezes at a blank page',
    metaDescription:
      'What to do when a kid freezes at a blank page — why the cold start overwhelms them, how talking breaks the freeze, and how a voice-first coach helps them begin.',
    lead: {
      question: 'What do you do when a kid freezes at a blank page?',
      answer:
        'Take the blank page away and start with a conversation. A frozen writer is usually stuck on starting, not on ideas. Ask one small, concrete question — “What happens first?” — and let them answer out loud. Capturing that spoken answer gives them a first sentence to react to, which breaks the freeze.',
    },
    sections: [
      {
        question: 'Why do kids freeze at the blank page?',
        answer:
          'The blank page asks a child to plan, organize, spell, and produce all at once, with nothing to react to. That cold-start load overwhelms working memory — especially for kids with ADHD or dysgraphia — so they stall before a single word appears.',
      },
      {
        question: 'How does talking break the freeze?',
        answer:
          'Speaking is lower-stakes than writing and lets ideas out at thinking speed. Once a student hears their own words captured on the page, they have something concrete to edit and extend — and editing is far easier than starting from nothing.',
      },
      {
        question: 'How does BrainScribe help a frozen writer start?',
        answer:
          'BrainScribe replaces the blank page with a coach that asks one question at a time. The student talks, their words are scribed into a sentence they approve, and the piece grows one small step at a time. Nothing is generated for them — the coach only draws out and organizes what the student already thinks.',
      },
    ],
    related: ['adhd', 'hate-writing', 'without-cheating'],
  },

  'hate-writing': {
    h1: 'A voice-to-writing app for kids who hate writing',
    metaTitle: 'A voice-to-writing app for kids who hate writing',
    metaDescription:
      'Is there a writing app for kids who hate writing? Why reluctant writers resist, how talking lowers the barrier, and how a voice-first coach differs from plain dictation.',
    lead: {
      question: 'Is there a writing app for kids who hate writing?',
      answer:
        'Yes — voice-first tools let kids who dread writing compose by talking instead. For many reluctant writers the resistance is about the effort of getting words down, not a lack of ideas. Speaking out loud lowers that barrier, and a coach can shape the spoken ideas into writing the child still owns.',
    },
    sections: [
      {
        question: 'Why do some kids hate writing?',
        answer:
          'Often the dislike is really avoidance of difficulty: slow handwriting or typing, spelling worries, or not knowing how to start. When writing feels like a fight every time, kids learn to dread it — even when they have plenty to say.',
      },
      {
        question: 'Can talking make writing less painful?',
        answer:
          'For many kids, yes. Removing the mechanical struggle lets them focus on ideas, and small, guided steps replace the overwhelming “write an essay” ask. Seeing their own spoken words become real sentences also builds confidence that the page is doable.',
      },
      {
        question: 'What makes BrainScribe different from a dictation app?',
        answer:
          'Plain dictation just transcribes; it doesn’t help a child organize or improve their writing. BrainScribe coaches: it asks questions, captures the student’s answers, and tidies them into paragraphs the student approves — turning talking into finished writing that’s genuinely theirs.',
      },
    ],
    related: ['adhd', 'dysgraphia', 'blank-page'],
  },

  'without-cheating': {
    h1: 'An AI that coaches writing without doing it for them',
    metaTitle: 'An AI that coaches writing without doing it for them',
    metaDescription:
      'Is there an AI that helps kids write without writing it for them? How a Socratic coaching AI differs from a chatbot, why it isn’t cheating, and how the work stays the student’s.',
    lead: {
      question: 'Is there an AI that helps kids write without writing it for them?',
      answer:
        'Yes. Unlike general chatbots that will draft an essay on request, a coaching AI is built so it can’t produce the content — it only asks questions and organizes what the student says. The writing comes from the student’s own spoken words, and a transcript shows exactly how each line was made.',
    },
    sections: [
      {
        question: 'Why is using ChatGPT for essays a problem?',
        answer:
          'General AI assistants will write a finished essay from a prompt, so the words aren’t the student’s and the learning is skipped. Teachers often can’t tell what the student actually did, and AI-detection tools are unreliable — OpenAI discontinued its own AI-text classifier, citing low accuracy — which is why many schools restrict AI on writing assignments.',
      },
      {
        question: 'How can an AI help without cheating?',
        answer:
          'By changing the job from “produce text” to “draw out the student’s thinking.” A Socratic coach asks one question at a time and captures the student’s spoken answers; it never adds ideas or sentences the student didn’t say. The result is the student’s own work, made visible.',
      },
      {
        question: 'How does BrainScribe keep the work the student’s?',
        answer:
          'BrainScribe only ever has the student’s own spoken words to work with, and a scribe cleans them into paragraphs the student approves. Every session is a transcript that parents and teachers can read line by line — so the process, not just the result, is visible and verifiable.',
      },
    ],
    related: ['blank-page', 'adhd', 'dysgraphia'],
  },
}

export const USE_CASE_SLUGS = Object.keys(USE_CASES)
export function getUseCase(slug) {
  return USE_CASES[slug] || null
}
