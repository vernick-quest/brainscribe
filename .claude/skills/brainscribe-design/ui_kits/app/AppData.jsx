/* Fake data + scripted session for the BrainScribe UI kit demo. */

window.BS_TUTORS = [
  { persona: 'sage',  name: 'Sage',  style: 'Methodical · calm',     desc: 'Breaks big assignments into clear, ordered steps.' },
  { persona: 'zip',   name: 'Zip',   style: 'Energetic · brisk',     desc: 'Keeps momentum going with quick, punchy questions.' },
  { persona: 'coach', name: 'Coach', style: 'Steady · cheering',     desc: 'Celebrates every bit of progress to build confidence.' },
  { persona: 'muse',  name: 'Muse',  style: 'Imaginative · playful', desc: 'Sparks ideas with vivid what-ifs and fun analogies.' },
  { persona: 'quill', name: 'Quill', style: 'Curious · precise',     desc: 'Digs into the details and presses gently for evidence.' },
  { persona: 'nova',  name: 'Nova',  style: 'Bold · expressive',     desc: 'Pushes for a strong voice and a point of view.' },
]

window.BS_ASSIGNMENT =
  'Write a 5-paragraph essay arguing whether the main character in "The Outsiders" changes by the end of the novel. Use specific evidence from the text.'

/* A scripted back-and-forth so the mic flow feels real without a backend.
   Each turn: the tutor's Socratic question, the student's raw spoken answer,
   and the scribe's cleaned-up paragraph. */
window.BS_SCRIPT = [
  {
    tutor: "Let's start simple — in your own words, who is Ponyboy at the very beginning of the story?",
    raw: "um ok so like ponyboy at the start he's kind of just a greaser he hangs out with his brothers and his gang and he likes movies and books and stuff but he doesn't really get along with the socs",
    scribed: "At the beginning of the novel, Ponyboy is a greaser who spends his time with his brothers and his gang. He loves movies and books, but he doesn't get along with the rival Socs.",
    isThin: false,
  },
  {
    tutor: "Nice setup. Now — what's one moment where Ponyboy starts to see things differently?",
    raw: "i think when he talks to cherry and she says the socs have problems too like watching sunsets",
    scribed: "Ponyboy begins to see things differently when he talks with Cherry. She explains that the Socs have their own problems too, and they realize they both watch the same sunsets.",
    isThin: true,
    thinNote: "Good moment to point to! Let's add why that conversation matters to him.",
  },
  {
    tutor: "So by the end, would you say Ponyboy has changed? What's your strongest reason?",
    raw: "yeah he changes because after johnny dies he decides to write everything down so other kids dont end up like them he kind of grows up and sees the bigger picture",
    scribed: "By the end, Ponyboy has clearly changed. After Johnny's death, he decides to write their story down so that other kids won't end up the same way. He has grown up and can finally see the bigger picture.",
    isThin: false,
  },
]
