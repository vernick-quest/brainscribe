// lib/gymChallengeBank.js — 72 challenge cards (24 skills × 3 grade bands), transcribed VERBATIM from docs/specs/brainscribe-gym-challenge-bank.md. Do not rewrite prompts — this IS the content. See C9 in the gym build plan.

export const GYM_CHALLENGE_BANK = {
  hook: {
    '6-7': {
      warmup: `"Think of a video or show you kept watching even though you meant to stop. What happened in the first ten seconds that grabbed you?"`,
      practiceA: `the weird house noise: "Something where you live makes a strange noise — a door, a vent, the fridge, a stair. Before you tell me anything about it, give me your opening line: ONE sentence that makes me *need* to know what that noise is. The story can't start until the hook is locked."`,
      practiceB: `lost and found: "Tell me about a time you lost something and found it somewhere weird. Rule: your first sentence comes first and alone. Say just the opening line, we test it, THEN you get to tell the rest."`,
      skillCheck: `The first sentence raises a question or lands a surprise instead of announcing the topic ("I'm going to tell you about…" = automatic redo). Not elegance — just: would a stranger want sentence two? One deliberate curiosity-gap is full marks.`,
      gamingNote: `Laziest dodge — skip the hook and slide straight into "One time I lost my charger…", or bolt on a shock line ("BOOM!") that has nothing to do with the story. Third dodge — the all-purpose question ("Have you ever wondered…?"): if the first line would work pasted onto anyone's story, it's a template, not a hook. Closing question: *"Read me only your first sentence. What does it promise — and does your story actually deliver that promise?"*`
    },
    '9-10': {
      warmup: `"Think of the last time you kept watching or listening past the moment you meant to stop. What grabbed you in the first ten seconds — and what did it *withhold*?"`,
      practiceA: `"You have a weirdly specific thing you're good at that almost nobody knows about. Write the opening line that makes a stranger *need* to hear the rest — then tell the story."`,
      practiceB: `"Something near where you live has a small mystery to it — a door nobody uses, a sign that makes no sense, a light that's always on. Open the story like it's episode one of a series."`,
      skillCheck: `First sentence opens a curiosity gap, tension, or image — never announces the topic. At this band: the student drafts ≥2 versions and can argue *why* the winner wins (what it promises, what it withholds) — and the story cashes the promise the line makes; a hook the paragraph can't pay off is a redo.`,
      gamingNote: `Laziest path — a gimmick question ("Have you ever wondered…?") or a shock word with no connection to the actual story. Closer: *"Read me just your first line. What does a stranger now want to know? If the answer is nothing, what's the real tension hiding in your story — and can the first line touch it?"*`
    },
    '11-12': {
      warmup: `"Think of a first line you can still quote from anything — a song, a video, a book you never finished. What did it promise, and what did it refuse to hand over yet?"`,
      practiceA: `"Write only the opening line of a piece about the most boring hour of your week. The hour has to stay genuinely boring — the line has to make me want it anyway. Two versions, then pick."`,
      practiceB: `"Open a piece about a routine you've done so many times you could do it asleep. First line only. It can't announce the topic and it can't lie about how interesting the routine is."`,
      skillCheck: `The line creates a specific imbalance or question without gimmick — no clickbait gap it can't pay off, no exclamation doing the work. Band bar: the student names what the line withholds, diagnoses the rejected version's specific failure in craft terms (overpromise, label, borrowed drama — not "it's weaker"), and the winning line survives the payoff audit: every promise it makes is one the genuinely boring hour can actually cash.`,
      gamingNote: `*Lazy path:* a label-opening ("This is about my Tuesday...") or a shock line the boring hour can't cash; the workshop kid's version is two polished openers narrated with AP-Lang vocabulary. *Closing question:* "You get one line and I get one question: tell me the exact question a stranger now has. Then tell me what the boring hour can actually deliver. If those two don't match, the line is writing a check the hour can't cash — which word is the forgery?"`
    }
  },
  specific_detail: {
    '6-7': {
      warmup: `"Close your eyes and picture the room you sleep in. Name one thing in it that nobody could guess without seeing it."`,
      practiceA: `bottom of the bag: "Describe what lives at the bottom of your backpack, bag, or school desk — using three details so specific that no one else's could match the description. 'Some old stuff' is banned."`,
      practiceB: `the sound that drives you crazy: "Pick a sound that makes you insane. Describe it exactly enough that I could recognize it with my eyes closed — what makes it, when it strikes, what it *actually* sounds like."`,
      skillCheck: `Swaps at least one vague word ("stuff," "weird," "nice") for something you could see, hear, or touch. Details are checkable facts, not opinions. Three concrete, only-mine details = full marks; nobody expects sensory prose.`,
      gamingNote: `Laziest dodge — stacking intensity adjectives ("really really loud annoying bad sound") instead of concrete nouns. Closing question: *"Could I draw a picture from that detail? What exactly would I draw?"*`
    },
    '9-10': {
      warmup: `"Picture wherever you were two hours ago. Name one thing you could see or hear that nobody else would have bothered to notice."`,
      practiceA: `"Describe the best seat you know — on a bus, in a theater, on a particular couch, in the bleachers — so precisely that someone could walk in and find it without asking."`,
      practiceB: `"Describe the exact feel of something you touch every day without looking — a railing, a zipper pull, the worn spot on a controller — precisely enough that I could pick it out of a lineup blindfolded."`,
      skillCheck: `≥2 concrete, sensory or proper-noun details in the paragraph; at least one vague→specific swap happens live in the session. At this band, details should also be *chosen* — the telling one, not just the first one.`,
      gamingNote: `Laziest path — stacking intensifier adjectives ("a really super annoying loud sound") and calling it detail. Closer: *"Adjectives are opinions. Which of your details would a camera or a microphone actually catch? And if I made you keep only one detail, which survives?"*`
    },
    '11-12': {
      warmup: `"Picture the door you use most often. Without checking — what's actually on it or right next to it? Notice which details you can retrieve and which your memory has smoothed away."`,
      practiceA: `"Describe someone you see regularly but have never spoken to — a driver, a cashier, a neighbor at their window — using only what's observable. Five details max, no guesses about their life."`,
      practiceB: `"Describe the exact sound of where you live at night, after everyone's stopped moving around. No visuals allowed. Make me able to tell your place from anyone else's."`,
      skillCheck: `Details are *selected*, not inventoried — each one earns its slot. Band bar: restraint (no interpretation smuggled in as observation) and at least one detail doing double duty — implying time, character, or history without saying it.`,
      gamingNote: `*Lazy path:* adjective-stacking a generic inventory ("old brown wooden door") — ten details, zero selection. *Closing question:* "If I made you cut all but one detail, which survives — and what does that one detail *prove*?"`
    }
  },
  closing_line: {
    '6-7': {
      warmup: `"Think of a movie or show ending that stuck with you for days. Did it end on an action, a line somebody said, or an idea it left you holding?"`,
      practiceA: `your spot: "Describe the spot where you feel most yourself — your bed, a stairwell, a corner of the library, anywhere. We'll write the paragraph, then spend real time on just the final sentence. Its job: leave me with a feeling, not a summary."`,
      practiceB: `the thing you outgrew: "Tell me about something you used to be completely into and have moved past. Then write TWO different final sentences and pick the one that echoes after it's over."`,
      skillCheck: `The last sentence does a job besides repeating ("and that's why I like my spot" = redo): an image, a small twist, a little truth. At this age, *final sentence ≠ restatement* is the entire skill.`,
      gamingNote: `Laziest dodge — ending with "The End," "and that's my story," or a restated first sentence. Second dodge — drama glued on ("…and nothing was ever the same"): ask *which word in your paragraph does your last line grow out of?* Closing question: *"Cover your last sentence. Does the paragraph feel finished without it? Then what job is your last sentence actually doing?"*`
    },
    '9-10': {
      warmup: `"Think of an ending that felt *right* — a song, a season finale, a match. What did it leave hanging in the air after it stopped?"`,
      practiceA: `"Tell the story of a small routine you stick to even though you know it changes nothing — an order you always do things in, a thing you always double-check, words you always say first. The last line has to make the routine mean something bigger than the routine."`,
      practiceB: `"Describe a place near you that's mid-disappearance — the shop that's closing, the lot getting built over, the room being turned into something else. End on a line that stays behind after the place is gone."`,
      skillCheck: `Final sentence echoes or *turns* the idea — it does not restate the paragraph, and "In conclusion" is extinct at this band. Leaves an image or an idea the reader keeps.`,
      gamingNote: `Laziest path — a dramatic non-sequitur bolted on ("…and that's when everything changed."). Closer: *"Cover your last line. Does the paragraph feel finished without it? Then your closer isn't closing — what does it add that the paragraph actually earned?"*`
    },
    '11-12': {
      warmup: `"Think of a conversation that ended at exactly the right moment. What made the last thing said *land* — and what would one more sentence have ruined?"`,
      practiceA: `"Something in your life got objectively upgraded — an app redesign, a rebuilt park, a fixed-up room, a better version of anything — and you still miss the old one. Short piece; the final line has to hold the upgrade and the loss at once, without the word *nostalgia* and without arguing the old one was better."`,
      practiceB: `"A short piece about a skill you're actively losing and don't mind losing — cursive, a game you were ranked in, a language app streak. The last line has to hold the losing and the not-minding at once, without the word *anymore* doing the work."`,
      skillCheck: `The final line *reframes* rather than summarizes. Band bar (both variants, no "ideally"): the line holds two feelings at once without naming either, the student can point to the single word doing the reframing, and the line fails the **portability test** — if it could be stapled onto a different piece and still sound wise, it wasn't earned by this one.`,
      gamingNote: `*Lazy path:* the moral-of-the-story close ("And that's why I'll always...") or portable profundity — a resonant-sounding image that "reframes" nothing. *Closing question:* "Does your last line tell me what I already read, or show the whole thing again in new light? Which single word does the reframing — and would the line still 'work' glued onto someone else's paragraph? If yes, it isn't yours."`
    }
  },
  word_choice: {
    '6-7': {
      warmup: `"'The dog went across the yard.' Give me three different words for 'went' that each show me a totally different dog."`,
      practiceA: `the chore you can't stand: "Describe doing a chore you hate — with a banned list: no 'very,' 'really,' 'thing,' 'stuff,' 'went,' or 'got.' Every verb has to earn its spot in the paragraph. When you're done, circle your three hardest-working verbs — and if any of them could belong to someone who secretly LIKES this chore, trade it for one that couldn't."`,
      practiceB: `caught in the weather: "Describe the last time weather got you — rain, wind, heat, cold. First pass, just say it. Then we hunt your three weakest words and trade each one for a stronger one you'd actually use."`,
      skillCheck: `Replaces flat verbs (went, got, said, did) with precise ones and cuts a couple of very/really fillers. Three strong swaps the kid can defend = full marks. This is not a thesaurus makeover. The pre-edit line(s) are retained as the badge's evidence pair.`,
      gamingNote: `Laziest dodge — thesaurus abuse: "I perambulated to the receptacle." Impressive-sounding words they'd never say. Closing question: *"Would you ever say that word out loud? What's a word that's strong AND yours?"*`
    },
    '9-10': {
      warmup: `"What word do you personally overuse? What is it standing in for when you reach for it?"`,
      practiceA: `"Describe how someone you know enters a room — without using 'walks,' 'goes,' or 'very.' The verbs have to do the character work."`,
      practiceB: `"Write instructions for losing gracefully at something you're actually competitive about. Every verb has to earn its spot."`,
      skillCheck: `The session captures a before/after line: filler cut, or a weak verb + adverb collapsed into one strong verb ("went quickly" → "bolted"). At this band the student defends one specific choice — why *this* word over its neighbors.`,
      gamingNote: `Laziest path — thesaurus mode: swapping plain words for fancy ones ("utilizes," "commences") and calling it precision. Closer: *"Would you say that word out loud to me right now? Precise beats fancy. What's the word you'd actually use if you were telling me this in person?"*`
    },
    '11-12': {
      warmup: `"What's a word you've stopped hearing because you use it so much — 'literally,' 'honestly,' 'lowkey'? What is it standing in for?"`,
      practiceA: `"Describe a specific smell that instantly puts you somewhere. Banned: *nice, good, weird, strong,* and the phrase *smells like.* Precision has to carry what the banned words used to fake."`,
      practiceB: `"Describe being truly tired without using *tired, exhausted, sleepy, drained,* or *dead.* Verbs do the lifting — what does tiredness *do* to you, not what is it called?"`,
      skillCheck: `Verbs carry the sentences; replacements are more *precise*, not more impressive. Band bar: the student rejects at least one thesaurus-y option in favor of a plain-exact one — and can say why plain won.`,
      gamingNote: `*Lazy path:* thesaurus swap — "tired" becomes "enervated," precision unchanged. Known exploit: the savvy gamer plants a sacrificial fancy word to kill on cue — if the kill comes too easily, it was planted; the coach picks the next casualty. *Closing question:* "Which of your new words is more precise, and which is just fancier? Kill one fancy one right now and defend the kill."`
    }
  },
  show_dont_tell: {
    '6-7': {
      warmup: `"Don't say the word 'nervous.' What does a nervous person DO with their hands?"`,
      practiceA: `maximum boredom: "Show me the most bored you have ever been WITHOUT ever saying 'bored' or 'boring.' Only what you did — what you counted, stared at, tapped, reread. If I can't guess the feeling from the actions, we add more scene."`,
      practiceB: `the tiny victory: "Tell me about a small victory — the stuck locker finally opening, the level finally beaten, the impossible jar lid. Banned words: happy, excited, awesome, great, and all their cousins. Show it in actions only — what your body did."`,
      skillCheck: `At least two sentences of observable action or scene where the feeling never gets named — and a reader could still guess the emotion. That guessability is the whole pass; extended scene-craft is beyond the band.`,
      gamingNote: `Laziest dodge — swapping the banned word for a synonym: "I was thrilled." Still telling. Closing question: *"You just told me the feeling with a different word. What were your hands, feet, and eyes doing instead?"*`
    },
    '9-10': {
      warmup: `"How can you tell a friend is nervous without them saying a word? Give me the visible evidence."`,
      practiceA: `"Show me the moment you realized you were completely out of your depth — wrong room, wrong difficulty, everyone else clearly knowing rules you didn't — without using 'awkward,' 'embarrassed,' or 'confused.'"`,
      practiceB: `"Show a moment you were completely locked in on something you love doing — and 'focused,' 'love,' and 'passionate' are all banned."`,
      skillCheck: `At least one emotion/judgment rendered as observable action or scene; one tell→show conversion happens live. At this band: the shown detail should carry *interpretive* weight, not just decoration.`,
      gamingNote: `Laziest path — the banned-word swap: replacing the feeling with a synonym and still telling. Closer: *"That's still a verdict word. What did your hands and eyes actually do? Give me the security-camera footage."*`
    },
    '11-12': {
      warmup: `"Think of someone who never says they're stressed — but you always know. How do you know? Be exact: what do you actually see or hear?"`,
      practiceA: `"Show me that someone is completely absorbed in their hobby — one scene of them mid-activity. Banned: every emotion word, plus *loves, obsessed, passionate,* and *you could tell.*"`,
      practiceB: `"Show me that two people are completely comfortable around each other, using only what they do and — this is the hard part — what they *don't bother* doing or saying."`,
      skillCheck: `A stranger could name the feeling from behavior alone; zero labeled emotions, including fig-leaf tells like *seemed* and *clearly*. Band bar: selection implies interiority — what the person *doesn't* do carries as much as what they do.`,
      gamingNote: `*Lazy path:* relabeled telling — "you could tell he was happy" instead of "he was happy." Same crime, fake receipt. *Closing question:* "Hunt down every emotion word hiding in there, including 'seemed.' For each one — what behavior replaces it?"`
    }
  },
  sentence_variety: {
    '6-7': {
      warmup: `"Say 'I opened the door.' Now say it like something scary is behind the door. What did you change — speed? Length? Where you paused?"`,
      practiceA: `the moment everything went sideways: "Tell me about a moment when everyone around you went quiet or went nuts at the same time — a fire drill, a blackout, a sudden downpour, a surprise announcement, the moment before a race started. Rule: at least one sentence must be three words or fewer, and at least one has to run long. Place the short one where it hits hardest."`,
      practiceB: `the silent mission: "Describe a moment you had to stay completely silent — hide-and-seek, trying not to wake anyone at night, the moment in a movie theater when everyone holds their breath. Short sentences for the held breath. One long sentence for when the silence finally broke. When you're done, point to your shortest sentence."`,
      skillCheck: `Honest sentence variety at 12 = ONE deliberately short sentence sitting next to longer ones, and the kid can say why it's short ("it's the panic part"). We're not grading clause structures — just on-purpose length changes.`,
      gamingNote: `Laziest dodge — chopping everything into fragments so it's all short (technically "different"). Closing question: *"Point to your one short sentence and tell me its job. What does it punch — and what happens if we move it somewhere else?"*`
    },
    '9-10': {
      warmup: `"Say your favorite short line from anything — a movie, a song, a game. Why does it hit harder *because* it's short?"`,
      practiceA: `"Describe the final seconds of a close game or round — any game, video, board, pickup, whatever — using at least one sentence under six words and one over twenty."`,
      practiceB: `"Walk me through your morning autopilot, beat by beat — then break the rhythm at the exact moment something went off-script."`,
      skillCheck: `Deliberate mix, not accident: the short sentence is placed for emphasis, a long one carries build-up. At this band the student can defend *placement*: why the short sentence lands where it does.`,
      gamingNote: `Laziest path — mechanical alternation (short, long, short, long) with no relation to meaning. Closer: *"Point to your shortest sentence. What is it punching? If you moved it two sentences earlier, what breaks?"*`
    },
    '11-12': {
      warmup: `"Say a full sentence about your day out loud. Now say the same fact in three words. Feel the different weight? That difference is a tool — today we aim it."`,
      practiceA: `"Describe waiting for a reply to a text you maybe shouldn't have sent. Use sentence length as the instrument: let the long sentences do the waiting, and the short ones do the buzz."`,
      practiceB: `"Describe the last thirty seconds before an alarm you know is coming — the one you're lying there dreading. Control my pulse with your sentence lengths, not your adjectives."`,
      skillCheck: `Length maps to *meaning* — pace mirrors the event, not a decorative short-long-short pattern. Band bar: at least one fragment deployed deliberately for impact, and the student can defend the placement. Artifact test (replaces narration where the defense sounds automated): the coach relocates one sentence and the student must identify *from the prose alone* what broke.`,
      gamingNote: `*Lazy path:* mechanical alternation — chop, sprawl, chop — with no relation to what's happening. *Closing question:* "Point at your shortest sentence. What is it doing *there* — and what breaks if I move it two sentences earlier?"`
    }
  },
  cutting: {
    '6-7': {
      warmup: `"When you tell a friend about your day, do you tell everything, or skip to the good part? How do you know what to skip?"`,
      practiceA: `surviving the boring hour: "Step one, ramble on purpose: explain everything you do to survive the most boring hour of your week — wherever it happens — the full uncut version, don't edit yourself. Step two: cut it to HALF the words without losing a single funny part. We keep both versions side by side."`,
      practiceB: `the whole entire plot: "Tell me the complete plot of a movie or episode you love — every detail, the messy long version. Then cut it so someone could hear the whole thing while waiting for a bus. Both versions get saved."`,
      skillCheck: `The after-version is at least a THIRD shorter with the best bits still alive — and because the long version was a ramble on purpose, half is in reach (that's why the prompt says half; the honest-draft bars live in the upper bands). The kid can name what they cut *and why*. The win is deleting whole sentences, not just trimming "very." Word counts are evidence, not the goal.`,
      gamingNote: `Laziest dodge — hitting the length by amputating the ending, or cutting the good stuff because it's easiest to grab. Third dodge — stuffing the long version with junk so the cut is free. Counter: *"Show me one cut you made INSIDE a sentence you kept — not a sentence you deleted whole."* Closing question: *"What's the single best sentence in the long version — and is it still alive in the short one?"*`
    },
    '9-10': {
      warmup: `"Someone you know tells stories with way too much backstory. What do you mentally fast-forward through — and what do you always stay for?"`,
      practiceA: `"Explain the full rules of a game you know inside out — card, video, playground, anything — every clause and exception, six to eight sentences. Then cut to the three sentences a brand-new player actually needs."`,
      practiceB: `"Recap your last week in eight sentences, everything included. Then cut to the three-sentence version that keeps only what mattered — and defend each survivor."`,
      skillCheck: `Both versions captured; the cut is 40%+ shorter with meaning intact, and at least one cut happens inside a surviving sentence. The student names *what kind of thing* each cut removed — repetition, throat-clearing, hedging — not just "extra words."`,
      gamingNote: `Laziest path — padding the first draft on purpose so cutting is free, or amputating substance instead of fat. Closer: *"Read the cut version. What fact or feeling did we actually lose? If the answer is nothing — was the first draft honest? Now find me one cut inside a sentence, not just a deleted sentence."*`
    },
    '11-12': {
      warmup: `"What's the longest way you've ever heard someone say something simple? What were all those extra words doing — besides not informing you?"`,
      practiceA: `BEFORE: explain to someone who's never managed it how you get a stubborn knot out — earbuds, shoelaces, a charging cable, any knot — in an honest 120 words: write it like you mean every word, no deliberate padding. AFTER: cut to 60 without losing a single fact. If none of the cuts hurt, the first draft wasn't honest — go find the sentence you're protecting.`,
      practiceB: `BEFORE: give directions from your front door to the nearest place you can buy a snack, in 100 words. AFTER: 40 words, and a stranger still arrives. Read both aloud — hear the difference.`,
      skillCheck: `The half-length version loses zero information and *gains* speed and force. Band bar: every kill is defensible on demand, the student catches at least one darling they initially refused to cut — then cuts it — and at least one cut is surgery **inside** a sentence: a clause excised, a hedge collapsed, not just a deleted sentence.`,
      gamingNote: `*Lazy path:* hitting the word count by deleting whole facts, or shaving filler while the flabby structure stands. *Closing question:* "Show me one sentence where the short version says *more* than the long one did. What did the cut add?"`
    }
  },
  voice: {
    '6-7': {
      warmup: `"How do you tell a story to your best friend versus standing in front of the class? What actually changes — words, speed, jokes?"`,
      practiceA: `the ridiculous rule rant: "Pick a rule you have to live with that you think is ridiculous — a school rule, a house rule, a rule at the pool or the park or in a game. Rant about it exactly the way you'd rant to a friend — say it out loud first, how you'd actually say it. Then we write down THAT version, not the polite translation."`,
      practiceB: `the last big laugh: "Tell the story of the last time you laughed really hard — but tell it like YOU, not like a book report. If you'd say 'it was so dumb,' the paragraph says 'it was so dumb.'"`,
      skillCheck: `The paragraph sounds like this kid talking — contractions, their real words, their rhythm — while still landing in complete sentences. The win is *dropping* stiff essay-voice, not adding slang.`,
      gamingNote: `Laziest dodge — a costume voice: slang-dump, ALL CAPS, fake-casual they'd never actually use. If a kid weaponizes the "write THAT version" instruction into pure filler ("so like, um, whatever"), borrow the 9–10 closer: *"Which filler word can go without losing you?"* Closing question: *"Say that sentence out loud to me right now. Is that honestly how you talk?"*`
    },
    '9-10': {
      warmup: `"You tell the same story to your best friend and to an adult you barely know. What actually changes — words, speed, what you leave out?"`,
      practiceA: `"Tell me about the most recent thing you couldn't shut up about — exactly the way you actually talked about it, to whoever got the rant. The page keeps YOUR wording, not the polite translation."`,
      practiceB: `"You get to leave a 60-second voicemail for the future version of you, five years out. Talk like you — not like an application, not like an essay."`,
      skillCheck: `Written register matches the student's *spoken* transcript from the session — contractions, rhythm, their actual word choices. Zero essay-voice tells ("In today's society…"). At this band: the student can point to one line and say "that sounds like me" *and* say what makes it so.`,
      gamingNote: `Laziest path — pure transcription slack: "like, um, so yeah basically" and calling the filler a voice. Closer: *"Casual isn't the skill — sounding like you on purpose is. Which line is doing both? Which filler word can go without losing you — and which line would you never actually say out loud?"*`
    },
    '11-12': {
      warmup: `"If I stripped your name off a text you sent this week, who could still identify it as yours? What exactly would give you away — a word, a rhythm, a punctuation habit?"`,
      practiceA: `"Retell your most reliable pet-peeve rant — the one your friends have heard — exactly the way you'd actually say it. Then find the three phrases in it that only you would use."`,
      practiceB: `"Write the note you'd leave for someone borrowing your most prized possession for a week. Instructions, warnings, threats — in a voice so unmistakably yours they'd hear you reading it."`,
      skillCheck: `Identifiable idiom *and* rhythm, sustained — not slang sprinkled on essay-voice — **verified against the session's own spoken transcript**: the written register must match how they actually talked in this room today. Band bar: the student points at which choices are natively theirs versus borrowed, and the coach spot-checks one "natively mine" claim against the transcript or a portfolio entry. A voice that appears only when graded is a costume.`,
      gamingNote: `*Lazy path:* essay sentences with casual garnish ("One pet peeve I find particularly egregious, ngl") — or the curated persona-voice, polished-casual but not theirs; the transcript match is the counter. *Closing question:* "Read it out loud. Which sentence would you never actually say — and what *would* you say instead?"`
    }
  },
  topic_sentence: {
    '6-7': {
      warmup: `"If you had to sum up your whole week in ONE sentence — not two — what would it be?"`,
      practiceA: `best part of the day: "Make the claim in one sentence: 'The best part of the day is ___ because ___.' That's your first sentence, and it's locked. Everything after has to back up THAT sentence — anything off-claim gets flagged."`,
      practiceB: `the most useful object: "Pick the single most useful object you touch every day and make one clear claim about it in your first sentence — not 'I'm going to talk about my charger,' an actual claim. Every following sentence must serve the claim."`,
      skillCheck: `First sentence makes ONE arguable claim (no announcements), and the sentences after mostly stay on it. Catching their *own* off-topic sentence during the read-back is the real win at this age.`,
      gamingNote: `Laziest dodge — writing a decent claim, then wandering off to whatever's fun to talk about. Closing question: *"Read your claim, then each sentence after it, and say 'proves it' or 'doesn't' out loud after each one."*`
    },
    '9-10': {
      warmup: `"'Weekends' is a topic. Turn it into a *claim* — one sentence somebody could actually argue with."`,
      practiceA: `"Should ties be allowed to stand, or does every competition need a winner? One clean claim sentence up front — then a paragraph that proves *only* that sentence."`,
      practiceB: `"Should birthdays be a big deal or kept low-key? Stake your claim in sentence one, then make every following sentence report back to it."`,
      skillCheck: `Sentence one makes ONE arguable claim; every subsequent sentence audits back to it. At this band the student can state the paragraph's promise in their own words — and spot the sentence that wandered off, if any. (Coach default: variant B is the livelier debatable.)`,
      gamingNote: `Laziest path — a fact or a vibe posing as a claim ("Ties happen in some sports."). Closer: *"Could a reasonable person argue against your first sentence? If not, it's a fact wearing a claim's jacket — what do you actually think about it?"*`
    },
    '11-12': {
      warmup: `"Think of a claim you could defend out loud for one full minute without wandering. Now shrink it until it *fits* in a minute. What did you have to leave out?"`,
      practiceA: `"Make one clear, arguable claim about what a real apology requires — for instance, whether the word *if* has any business in one. Then list the three things your paragraph would prove. Each must prove *that* claim, not its cousin."`,
      practiceB: `"One claim about what separates a great snack from merely food. Precise enough that some snacks *fail* your standard. Then the three-point proof list — check each point against the claim."`,
      skillCheck: `The claim is single, arguable, and paragraph-sized — provable in one paragraph, not a chapter. Band bar (compression): every planned support proves the stated claim, and the student can name what a *neighboring* claim would be so we know they see the boundary.`,
      gamingNote: `*Lazy path:* a claim so broad ("apologies are important") that anything counts as proof. *Closing question:* "Name one true, relevant fact your paragraph would have to *exclude*. If nothing gets excluded — is it a claim, or a topic?"`
    }
  },
  counterargument: {
    '6-7': {
      warmup: `"Think of something you argue about with someone your age. Say THEIR side out loud, honestly — no cheating by making it sound dumb."`,
      practiceA: `the spoiler question: "Where do you stand on spoilers — no big deal, or absolute crime? Argue YOUR side — but first, give the other side its best shot in two honest sentences. Then take it apart."`,
      practiceB: `the telling-on dilemma: "Is it ever right to tell an adult when a friend breaks a rule? Pick a side. Before you defend it, argue the other side so well that someone who believes it would nod. Then answer that version — not a weaker one. Keep it invented: made-up friend, made-up rule, no real names — this is a thinking game, not a confession."`,
      skillCheck: `States the opposing view *fairly* before their own, then responds to that specific view. One honest "someone might say ___, but ___" is the entire skill at this age. (Calibration log: Practice B's nod-along phrasing is a stretch goal borrowed from the 9–10 bar — grade only "states fairly"; do not raise this check to match the prompt.)`,
      gamingNote: `Laziest dodge — the strawman: making the other side sound idiotic, then heroically knocking it over. Closing question: *"Would someone who actually believes the other side hear your version and say 'yes, that's my argument'? If not, make it stronger before you answer it."*`
    },
    '9-10': {
      warmup: `"Think of an opinion you've genuinely changed. What did the other side say that finally landed — and why did it take so long to hear it?"`,
      practiceA: `"Is it acceptable to leave a group chat without saying a word — any group chat: team, family, whatever counts? Take a stand — but FIRST make the other side's best case so well that they'd nod along." *(This is the band's one phone/social prompt.)*`,
      practiceB: `"Do people who skip an episode — or a whole season — deserve spoiler protection? Steelman the side you're NOT on before you answer it." *(Declared refinement of the 6–7 spoiler family: skippers' entitlement, not spoilers-in-general.)*`,
      skillCheck: `A fair statement of the other side ("…and they have a point about…") followed by a rebuttal that engages *that actual point*. At this band: steelman, not strawman — the opposing case must be one a smart opponent would sign.`,
      gamingNote: `Laziest path — strawman-then-slam ("Some people think X, but they're just wrong"). Closer: *"Would someone on that side say 'yes, that's my argument'? If not, make it stronger before you beat it. What's the BEST reason they believe it?"*`
    },
    '11-12': {
      warmup: `"Think of someone who disagrees with you about something and is *not* stupid. What are they seeing that your version of the argument flattens?"`,
      practiceA: `"Take a taste-belief you'd defend for an hour — a 'best one ever' position. Build the strongest case *against* it, strong enough that someone on that side would nod and add nothing."`,
      practiceB: `"'It's completely fine to abandon a book or show halfway.' Take whichever side you *don't* hold and steelman it out loud. Then name the one point you genuinely can't beat."`,
      skillCheck: `The steelman would be signed by an actual holder of the view — no tells, no tee-ups. Band bar (nuance): the student returns to their own side *changed*, conceding what survived, rather than declaring untouched victory.`,
      gamingNote: `*Lazy path:* strawman-then-slam — or concession theater ("my opponent raises a fair point, however—"): gracious-sounding, costless. Artifact counter: the student restates their original claim with its new, narrower scope **in writing**; if the before and after claims are identical, no concession happened. *Closing question:* "Would someone who actually holds this view sign your version of it? And what's the one point of theirs you still can't beat?"`
    }
  },
  evidence: {
    '6-7': {
      warmup: `"You say a movie is 'so good.' Your friend says 'prove it.' What do you actually point to?"`,
      practiceA: `the case for your season: "Argue that your favorite season beats the other three — but every point must be a specific thing that actually happens: a smell, a thing you get to do, a change you can see. Two pieces of real evidence minimum — a third earns you a flex. 'It's just fun' doesn't count as evidence."`,
      practiceB: `funniest person alive: "Claim: someone you know is the funniest person alive. Prove it with two specific moments — actual things they did or said that you witnessed. 'They're just hilarious' is a claim wearing an evidence costume."`,
      skillCheck: `Support = specific happenings someone could have witnessed or checked, not the opinion restated. Two real examples per claim is solid sixth-grade evidence; sourcing and quoting come later.`,
      gamingNote: `Laziest dodge — evidence that's the claim said louder: "it's the best because it's amazing and everyone loves it." Closing question: *"Could someone who disagrees with you still check your evidence? What exactly would they see?"*`
    },
    '9-10': {
      warmup: `"Your friend insists some game or song is 'objectively the best.' What would count as actual evidence — versus just a louder opinion?"`,
      practiceA: `"Rewatching or replaying something you love versus always trying something new — which is the better use of a free evening? Convince me with exactly two concrete pieces of support: real moments, observable facts, not vibes."`,
      practiceB: `"Claim: background noise helps you get things done — or wrecks it. Back your side with two specific pieces of evidence from your own life. Moments, not generalities."`,
      skillCheck: `Support is specific and *explicitly tied* to the claim ("which shows…"), not just adjacent to it. At this band the coach also checks **selection**: the two *best* pieces, not the first two — and the student can say why one candidate got cut.`,
      gamingNote: `Laziest path — restating the claim louder and calling it evidence. Closer: *"That's the claim in a costume. What actually happened — one real moment — that a doubter couldn't wave away?"* (Coach note: probe suspiciously convenient evidence with "what happened right before that?")`
    },
    '11-12': {
      warmup: `"What's something you believe about yourself that you've never actually checked against evidence? Just hold it — we're about to build the habit of checking."`,
      practiceA: `"You know what kind of texter, listener, or eater you are. Prove it — three pieces of evidence a stranger could verify. No self-descriptions allowed; 'I'm just like that' is banned."`,
      practiceB: `"Pick the household task you're genuinely best at. Prove the *best at* part with observable evidence — outcomes, others' behavior, the record — not your own opinion of your work."`,
      skillCheck: `Evidence is verifiable and specific, with zero self-report adjectives smuggled in. Band bar: the strongest item is placed first or last *on purpose* — AND, stacking the 9–10 demand rather than swapping it, the student names the candidate piece that got cut and why (placement rationale alone is retro-fittable in one breath; the cut is not). The student can articulate the difference between an example and a proof.`,
      gamingNote: `*Lazy path:* the claim restated in costume — "for example, I really am a picky eater." *Closing question:* "Which of your three pieces survives a skeptic actually checking it? Which collapses back into your opinion of yourself?"`
    }
  },
  analysis: {
    '6-7': {
      warmup: `"A friend shows you a photo of their shoes completely wrecked with mud — and they're grinning. What's the story the photo doesn't say out loud?"`,
      practiceA: `your signature sound: "Name the word, sound, or emoji you use constantly — in texts if you text, or just out loud, the thing your friends would say is SO you. First the fact: you use it constantly. Now dig: what does using it that much actually SAY about you? You have to push past 'I just like it' — that push is the muscle we're training."`,
      practiceB: `the song on repeat: "Name a song you've played way too many times. The fact is you replay it. The analysis is WHY that one — what is it doing for you that other songs don't? Every 'because' has to go one layer deeper than the last."`,
      skillCheck: `One honest connecting move — "which shows that…" / "which means…" — linking a fact to what it reveals. ONE genuine layer past restating is a full pass at 12; a modest, checkable inference ("which shows that I like songs I can memorize") is full marks. Multi-step interpretation is high-school work.`,
      gamingNote: `Laziest dodge — restating the evidence in different words and calling it meaning ("I use it a lot because I use it all the time"). Closing question: *"You just told me WHAT again. Now finish this sentence: 'which shows that I…'"*`
    },
    '9-10': {
      warmup: `"People claim most new hobbies get quit inside two weeks. Suppose it's true — what would it MEAN? Give me two different possible meanings."`,
      practiceA: `"Is it better to be five minutes early or exactly on time? Give me one piece of evidence — then spend most of the paragraph on what that evidence *means* — and push at least one layer past the obvious reading."`,
      practiceB: `"Pick an unwritten rule some group you know actually follows — your family's, an online community's, the regulars anywhere. Nobody voted on it; everyone obeys it. The rule is your evidence. What it reveals about that group is your analysis."`,
      skillCheck: `After each piece of evidence, ≥1 sentence of reasoning that ADDS meaning ("which means… / and that matters because…") rather than restating. At this band, analysis reaches one level up — what it says about people or values, not just the thing itself.`,
      gamingNote: `Laziest path — "This shows that…" followed by the evidence again, slightly reworded. Closer: *"You just told me the evidence twice. Finish this sentence instead: 'and that matters because…' — what changes in the world if your claim is true?"*`
    },
    '11-12': {
      warmup: `"Think of a fact about you that's true but misleading without context. What's the one missing sentence that makes it mean the right thing? That sentence is analysis."`,
      practiceA: `"Name your idle-hands default — the thing you do the second your brain is unsupervised: the shape you always doodle, the tune you hum, the exact way you fidget. State the fact, then tell me what it *actually* reveals — and name the lazy conclusion a stranger would wrongly draw from the data alone."`,
      practiceB: `"Pick one small habit everyone in your household shares — where things get put down, what never gets thrown away. Analyze what it reveals about the household beyond the obvious first reading."`,
      skillCheck: `The analysis adds a *so what* not already present in the evidence — one genuine level below restatement. Band bar (nuance): the student explicitly names what the evidence does *not* show, resisting the overclaim.`,
      gamingNote: `*Lazy path:* evidence restated behind "this shows that..." *Closing question:* "Cover your evidence sentence. Does the analysis sentence still contain a new idea — or is it the same sentence in a trench coat?"`
    }
  },
  thesis: {
    '6-7': {
      warmup: `"'Dogs are animals' — can anyone argue with that? 'Dogs are the neediest pets' — now can they? What changed between those two sentences?"`,
      practiceA: `the best age: "Take a stand: what is the single best age to be — an exact number? Your first job is ONE sentence that's specific and arguable. 'Being a kid is fun' is banned for being unarguable mush. Claim first, then defend it briefly."`,
      practiceB: `overrated / underrated: "Name one thing everybody your age seems to love that you think is overrated — or something ignored that's secretly great. Boil your position into ONE sharp sentence a real person could disagree with. We test the sentence before you defend it."`,
      skillCheck: `One sentence with a specific topic AND an arguable position. The test is "could a reasonable person disagree?" — passing that test once, on purpose, is mastery for this band. Sophistication of the claim doesn't matter yet.`,
      gamingNote: `Laziest dodge — a safe fact ("phones are popular") or a pure preference ("I like summer") nobody can argue with. Closing question: *"Say the exact opposite of your sentence. Does the opposite sound like a position a real person could hold? If the opposite is nonsense, you wrote a fact, not a thesis."*`
    },
    '9-10': {
      warmup: `"'Sunsets are pretty' versus 'Golden hour is wasted on people who only photograph it.' Which one could start an essay — and what does it have that the other doesn't?"`,
      practiceA: `"One sentence you'd defend for a whole essay: what makes a remake or reboot *deserve* to exist? Specific, arguable, no hedging — then tell me what a smart person on the other side would say back."`,
      practiceB: `"One-sentence thesis on whether 'guilty pleasures' should be a category at all, or just taste-shaming with better PR. Then defend the sentence's arguability, not the sentence."`,
      skillCheck: `Specific + arguable (a reasonable person could disagree); no hedge words doing the arguing ("arguably," "in some ways"). At this band the student can articulate the exact disagreement the thesis *invites* — who pushes back, and with what.`,
      gamingNote: `Laziest path — the safe both-sides thesis ("Remakes have pros and cons"). Closer: *"Who disagrees with that sentence? Name the person and their comeback. If nobody would bother arguing, sharpen it until somebody would."*`
    },
    '11-12': {
      warmup: `"What's an opinion you hold that would take a full essay to defend properly — not a slogan, an *essay*? How do you know it's actually arguable?"`,
      practiceA: `"Write a thesis answering: when is it okay to tell a friend a hard truth they didn't ask for? It has to be specific and arguable — a fortune cookie fails, a list of factors fails."`,
      practiceB: `"A thesis on what actually makes something cringe. Run the tests out loud: could a smart person disagree? Could you prove it in four paragraphs? Does it contain a tension, not just a topic?"`,
      skillCheck: `Specific, arguable, and *sized* — the claim matches the scope it promises to prove. Band bar (compression): the thesis carries its central tension in 25 words or fewer, and the student can state what the thesis deliberately does *not* claim — the neighboring overclaim they refused. Smart-disagreer + comeback is assumed from the 9–10 badge, not re-credited here.`,
      gamingNote: `*Lazy path:* the unfalsifiable truism ("honesty matters in friendship") or the three-part road map with no claim inside it. *Closing question:* "Say the thesis you *almost* wrote — the safer, more defensible, duller one. Why is yours worth the extra risk? If you can't find a duller neighbor, yours is the duller neighbor."`
    }
  },
  transitions: {
    '6-7': {
      warmup: `"You're telling a friend two stories that have nothing to do with each other. What do you say in between so it doesn't feel like a robot changed the channel?"`,
      practiceA: `the secret connection: "Pick two things you're into that LOOK like they have nothing in common. But you love them both — so something connects them: a feeling, a reason, a thing they both give you. Write a few sentences about each, with your bridge sentence between them. Your bridge sentence's one job is to SAY the connection out loud."`,
      practiceB: `the no-'then' day: "Walk me through your day from wake-up to lights-out in about five sentences — but 'then,' 'and then,' and 'next' are banned. Every switch needs a connector that shows HOW one part leads to the other (because, but, even though, which is why…)."`,
      skillCheck: `Uses connectors that show a *relationship* (but, because, even though, which is why) instead of a then-chain. One genuine bridge sentence that earns its crossing = full marks.`,
      gamingNote: `Laziest dodge — swapping "then" for fancier stand-ins ("subsequently," "following that") without connecting any ideas. Closing question: *"Take the connector word out. Do the two sentences still feel linked? Then what's the real link — say it in plain words."*`
    },
    '9-10': {
      warmup: `"When a friend jumps topics with zero warning, you feel the gap. What do good 'meanwhile's and 'which is why's actually *do*?"`,
      practiceA: `"Two mini-paragraphs: one on something you used to be into, one on what you're into now. The bridge sentence between them has to explain the shift — and 'then' is banned."`,
      practiceB: `"Argue that being a good teammate and being a good opponent are secretly the same skill. One short paragraph on each — joined by a bridge sentence that *earns* the connection."`,
      skillCheck: `Connectors are logical, not temporal; the bridge sentence touches both sides. At this band the student names the *relationship* the bridge encodes — contrast, cause, escalation — not just the word they used.`,
      gamingNote: `Laziest path — sprinkling "However," "Moreover," "Furthermore" as decoration between unrelated ideas. Closer: *"Delete your transition word. If nothing breaks, it was decoration. So which is the real link: but, because, or so?"*`
    },
    '11-12': {
      warmup: `"Think of a conversation that jumped topics three times but never felt jumpy. What was carrying you across the gaps?"`,
      practiceA: `"Name a contradiction you actually live with — you love the game but never finish it, admire the artist but skip their biggest hits, want the plan but dread the leaving. Two short paragraphs, one per half — and a single bridge sentence carries the turn. 'Speaking of which' and its relatives are banned."`,
      practiceB: `"Narrate a small change of mind — a food, an artist, a game you flipped on. Two short chunks, before-mind and after-mind; one pivot sentence carries the entire turn. Build the piece so that sentence is load-bearing."`,
      skillCheck: `The bridge does logical work — concession, cause, genuine pivot — not adhesive vocabulary. Band bar: deleting the transition sentence visibly breaks the piece; if it reads fine without it, the transition was decoration.`,
      gamingNote: `*Lazy path:* gluing *however / moreover / additionally* onto ideas that stay unrelated underneath. *Closing question:* "Delete your bridge sentence and read across the gap. What breaks? If nothing breaks — what was it for?"`
    }
  },
  paragraph_structure: {
    '6-7': {
      warmup: `"A paragraph is a trip: you say where you're going, you actually go there, and you arrive. What does it feel like when someone skips the 'arrive'?"`,
      practiceA: `recruit me: "Build one complete paragraph convincing me to try an activity you actually do. Claim first. Two support sentences with real examples. One closer that seals it. As you go, every sentence gets a job title: claim / support / support / closer."`,
      practiceB: `the useless talent: "You have some small, odd talent — folding shirts fast, a perfect whistle, remembering every jingle. One paragraph: claim it matters more than people think, back it with two examples of the talent in action, close with a kicker. Label every sentence's job."`,
      skillCheck: `All four jobs present and in order — claim, two supports, close — and each sentence identifiable by its job. Pass = no orphan sentences doing nothing. Elegant flow between them is a bonus, not the bar.`,
      gamingNote: `Laziest dodge — writing four random sentences, then labeling them afterward with whatever fits. Closing question: *"Shuffle test: if I moved your third sentence to the top, would anything break? In a real structure, something breaks."*`
    },
    '9-10': {
      warmup: `"Claim, proof, so-what, close — four jobs. When you're winning an argument out loud, which of the four do you usually skip?"`,
      practiceA: `"Full paragraph, claim to close: who has it right — the person who plans everything down to the minute, or the one who decides everything in the moment?"`,
      practiceB: `"Full paragraph: should every game and app force a tutorial, or should people get dropped in to figure it out? Claim, evidence, what-it-means, and a close that doesn't just repeat the claim."`,
      skillCheck: `Claim → evidence → analysis → close, unified, no orphan sentences — this is the Tier 2 capstone and the format fits it exactly. At this band the close must *advance* (a consequence, a widening) rather than restate.`,
      gamingNote: `Laziest path — four disconnected sentences wearing the four labels. Closer: *"Read sentence three by itself. Which other sentence does it actually depend on? Every sentence points back to the claim — which one of yours is a stray?"*`
    },
    '11-12': {
      warmup: `"Think of the best paragraph-shaped thing in real life — a joke, a pitch, a good excuse. Where does it start, and where does it *choose* to stop?"`,
      practiceA: `"One complete paragraph — claim, evidence, analysis, close — answering: does a re-gifted gift still count as a gift? Every sentence has a job; no sentence gets to just stand around."`,
      practiceB: `"One complete paragraph on: is being late a moral failure or just a logistics problem? Claim it, support it, explain the support, and close somewhere your first sentence hadn't reached yet."`,
      skillCheck: `All four jobs present with no visible seams — it reads as one motion, not four labeled parts. Band bar (compression + nuance): nothing survives that isn't working, and the close *advances* the claim rather than restating it. (Seamlessness cannot be faked downward — if the jobs are present and invisible, the skill happened.)`,
      gamingNote: `*Lazy path:* claim + three examples + the claim again wearing a hat. *Closing question:* "Point at the sentence where you *explain* rather than show. And does your last sentence know something your first one didn't?"`
    }
  },
  essay_architecture: {
    '6-7': {
      warmup: `"Think of any movie: beginning, middle, end. What job does the beginning do that the ending can't do?"`,
      practiceA: `the neighborhood pitch: "You get to pitch one new thing your street or neighborhood could actually use — a free little library, a bench, a mural, a water fountain. DON'T write the essay. Build the map: one line for what the intro promises, one line each for what two or three body chunks prove, one line for what the ending leaves people holding. Then fully write ONLY the intro."`,
      practiceB: `the three-room museum: "Design a tiny three-room museum about something you know a ton about. Room 1 is the intro — why walk in? Rooms 2 and 3 are the body — one idea each. The exit sign is the conclusion. Map every room in one line, then fully write just ONE room of your choice."`,
      skillCheck: `The map shows intro, body, and conclusion doing *different jobs* (promise / prove / land) with body chunks that don't repeat each other — and the one written piece actually matches its box on the map. Map coherence over prose polish.`,
      gamingNote: `Laziest dodge — three body boxes that are the same idea reworded, or writing the fun piece and back-filling a fake map around it. Closing question: *"If I deleted Room 2, what would a visitor never find out? If the answer is 'nothing' — your rooms are duplicates."*`
    },
    '9-10': {
      warmup: `"Think of anything built in parts — a set list, a workout, a three-course meal. Why that order? What breaks if you swap two parts?"`,
      practiceA: `"Blueprint an essay: do popular things deserve the backlash they get *just* for going mainstream? Write the thesis, then a one-line JOB for the intro, each body section, and the conclusion — the job, not the content. Then draft the one section you'd most enjoy writing."`,
      practiceB: `"Blueprint a persuasive essay: is it better to be great at one thing or decent at many? Section jobs first — what each part *does to the reader* — then fully draft your opening section."`,
      skillCheck: `Every section has a distinct stated job; the swap test passes — the student can name what visibly breaks if two sections trade places; the drafted section actually performs its stated job.`,
      gamingNote: `Laziest path — a blueprint of topic labels ("Intro: introduce topic. Body 1: first reason."). Closer: *"'First reason' is a slot, not a job. What does section two DO to the reader that section one hasn't already done?"*`
    },
    '11-12': {
      warmup: `"Think of an album, movie, or game with great structure. What did the opening *promise* — and did the ending actually pay that specific promise back?"`,
      practiceA: `"Blueprint a full essay arguing for the golden era of something you care about — when it peaked and why. For each section write its *job*, not its topic: what the intro promises, what each body paragraph must prove, what the conclusion pays. Then write ONE piece: the intro or the conclusion."`,
      practiceB: `"Blueprint the essay for: which meal of the day is structurally the best — not tastiest, *best designed*. Jobs for every section, promise-to-payoff mapped. Then write one body paragraph and check it does exactly its blueprinted job."`,
      skillCheck: `The blueprint states each section's *function* ("body 2 handles the strongest rival era") rather than its topic. Band bar (self-aware craft): intro promise and conclusion payoff visibly match — enforced as *pointing at the exact lines*, not describing — the swap test passes (the student names what visibly breaks if two sections trade places; restored from the 9–10 card, demands stack), and the written piece executes its assigned job — nothing more, nothing less.`,
      gamingNote: `*Lazy path:* a topic list dressed as a blueprint — including the college-prepped kid's function-*sounding* labels emitted as fluently as topic labels. *Closing question:* "Read me only the jobs. What does your intro promise — and point to the exact line in the plan where the conclusion pays it back."`
    }
  },
  tone_control: {
    '6-7': {
      warmup: `"Think of a time the same news sounded totally different coming from two different people. What did each of them change — words, speed, drama?"`,
      practiceA: `the double cancel: "You have to cancel plans. Deliver the same message twice: once to your best friend, once to an adult you respect — a coach, a neighbor, a librarian. Same facts, two tones. Then name the three words that changed and why they had to."`,
      practiceB: `breaking news, boring news: "There's a spider in the room — any room with people in it. Deliver that news twice: first as a breathless breaking-news reporter, then as the world's most bored morning announcement. Same fact, opposite energy. What levers did you pull — word choice, sentence length, exclamation?"`,
      skillCheck: `The two versions genuinely differ in word choice and formality — not just greeting — and the kid can name at least TWO specific changes they made. Matching tone to audience once, on purpose, is the skill; a wide register range isn't expected yet.`,
      gamingNote: `Laziest dodge — version two is version one with "Dear Sir" stapled to the front. Closing question: *"Besides the greeting, point to two words in the MIDDLE that changed. If nothing changed in the middle, the tone didn't change."*`
    },
    '9-10': {
      warmup: `"Think of the last time you rewrote a message before sending it. What were you tuning — and for whom?"`,
      practiceA: `"Same 3–4 sentence announcement — 'practice / rehearsal / the meetup is moved to Saturday morning' — written twice: once to the group who'll be annoyed, once to the adult in charge. Then name three exact things you changed."`,
      practiceB: `"Review the same snack twice: once as a text hyping a friend into trying it tonight, once as a straight-faced formal product review. Same snack, two temperatures."`,
      skillCheck: `Both versions stay accurate; the register shift lives in diction, syntax, and stance — not just bolted-on politeness. At this band the student names the knobs they turned (contractions, sentence length, distance, hedges).`,
      gamingNote: `Laziest path — making one version sloppy instead of differently tuned ("formal" = the same text plus "Dear Sir"). Closer: *"Formal isn't casual with a tie on. What in version one would embarrass you if the adult read it — and what in version two would bore your friend to death?"*`
    },
    '11-12': {
      warmup: `"Recall a sentence you've had to write where two jobs pulled against each other — being honest and being kind, saying no and saying thank you. Which job won? Today neither gets to lose."`,
      practiceA: `the favor you're not owed: "You need to ask an adult you barely know — a neighbor, a coach from two seasons ago, a family friend — for a small real favor next week. ONE message that does two jobs at once: warm enough to be human, direct enough that the ask can't be missed. No over-apologizing, no acting entitled — and no splitting it into a warm half and an asking half."`,
      practiceB: `the honored no: "Someone invites you to something that genuinely flatters you — and you have to say no. ONE message that declines and appreciates at once: the no can't hide, and the thanks can't read as padding before the 'but.'"`,
      skillCheck: `One register doing two jobs simultaneously — both jobs verifiably present in the single message (the 9–10 skill was two clean single-audience versions; the 11–12 skill is the mix). Band bar (conflict location — an artifact test, not narration): the student points to the exact sentence where the two demands fought and names what the syntax did about it — what got subordinated, what earned its own sentence, where the 'but' lives. Not "what changed between versions" — where it *couldn't* change.`,
      gamingNote: `*Lazy path:* sequencing instead of mixing — one sentence of job A stapled to one sentence of job B ("Sorry to bother you! Anyway I need the thing.") — two registers taking turns isn't one register doing two jobs. *Closing question (tone-leak test):* the coach picks one sentence where stance leaked through the register — "you wrote 'it's fine' — is it?" — and the student patches it live. Tone that leaks under inspection was performed, not controlled. The pre-patch and patched versions are saved as the session's pair.`
    }
  },
  entering_conversation: {
    '6-7': {
      warmup: `"Your friends are all hyped about something you're lukewarm on. How do you drop your take without ignoring what everyone already said?"`,
      practiceA: `the take everyone has: "Pick an opinion 'everyone' around you seems to share — a show is peak, an app is dead, a trend is over. Your paragraph must START with their view, fairly: 'Most people I know think…' Then place YOUR take next to it: agree-but, disagree-because, or yes-and."`,
      practiceB: `the screens speech: "Adults love saying kids your age are glued to screens. Enter that conversation: state their view in one fair sentence, then position yours in relation to it — where are they right, and what are they missing? Your take has to touch theirs, not float beside it."`,
      skillCheck: `Names the existing view first, then locates their own *relative to it* (agree / disagree / partly) instead of announcing an opinion into a void. Doing the "most people say X, but I…" frame once, honestly, is mastery for this band.`,
      gamingNote: `Laziest dodge — a token "some people say…" followed by a take that never touches it. Closing question: *"How does your second sentence answer your first? If your take would be identical with sentence one deleted, you didn't enter the conversation — you interrupted it."*`
    },
    '9-10': {
      warmup: `"Before you drop your take on anything, how do you show you actually heard the other takes? What's the difference between 'everyone's wrong' and 'everyone's missing something'?"`,
      practiceA: `"People are permanently split on whether a cover version can beat the original song. Map the existing camps fairly — two or three real positions — then place YOUR take in relation to them: 'Most people say X; they're missing Y.'"`,
      practiceB: `"Pick a running low-stakes debate you keep seeing — among friends, in a family, in a comment section or community you only lurk in (keep it light). Lay out the standing positions like a fair reporter — then enter with a take that responds TO them, not past them."`,
      skillCheck: `≥2 existing positions represented fairly; the student's claim is explicitly positioned ("agrees with A that…, but…"). At this band the coach wants the "they're missing" move — a real contribution, not just a side-pick.`,
      gamingNote: `Laziest path — the token nod: "Some say otherwise, but…" followed by an uninterrupted monologue. Closer: *"You gave the other takes half a sentence. Which specific point of theirs does YOUR take answer? If it answers none of them, you're talking near the conversation, not in it."*`
    },
    '11-12': {
      warmup: `"What's a take that 'everyone knows' in some group you're part of — a fandom, a team, a friend group? And honestly: who is the *everyone*?"`,
      practiceA: `"Pick a consensus take from one of your communities — and the standard rebellion against it (every consensus has one; find yours). State *both* so fairly that each camp would nod. Then take the seat that isn't taken: your position has to split from each of them at a named point."`,
      practiceB: `"Pick a piece of advice adults hand your age group on repeat — 'follow your passion,' 'just be yourself.' Enter the conversation: what does everyone say, and what's *your* amendment to it?"`,
      skillCheck: `The they-say is represented fairly enough that its holders would co-sign it. Band bar (nuance): at least two positions mapped (the consensus and its stock counter), and the student's entry is a precise relation to *both* — if their take is just the room's pre-installed rebellion, they haven't entered the conversation, they've joined the other queue.`,
      gamingNote: `*Lazy path:* "Some people think X, but I think Y" — with X vague, unfair, or invented; at this band, also the autopilot contrarian sitting in the stock-rebellion chair. *Closing question:* "State their best version so well they'd nod along. Now, in one phrase: where *exactly* do you split from it?"`
    }
  },
  timed_writing: {
    '6-7': {
      warmup: `"When a clock says five minutes left — in a game, a test, your turn at anything — what happens in your brain? What would a plan look like that beats the panic instead of feeding it?"`,
      practiceA: `untimed shape first, then the clock: "Round one, NO clock: your topic is 'a small thing that made this week better.' Build your 30-second plan out loud — claim, two supports, close. Round two, clock ON: 8 minutes to get the whole paragraph out. Planning time is always free; the clock only ever runs on the writing."`,
      practiceB: `the clock round: "Topic: one thing you'd tell a kid exactly one year younger than you. One free minute to plan out loud, then 8 minutes on the clock for a complete paragraph. Done beats perfect — the win is reaching a real closing sentence, not trailing off when time's called."`,
      skillCheck: `A COMPLETE paragraph inside the budget — claim, some support, an actual final sentence — even if it's rough. Finishing with shape is the skill; polish under pressure is explicitly not the bar at 12.`,
      gamingNote: `Laziest dodge — writing two safe sentences and declaring "done!" with four minutes left, technically beating the clock. Closing question: *"You had four minutes left — where's the close? 'Complete' means claim, support, AND a final line. Use the whole runway."*`
    },
    '9-10': {
      warmup: `"When a clock starts, what's the first thing that goes wrong for you — blank brain, perfectionism on sentence one, or forgetting the ending? Name your failure mode before we start."`,
      practiceA: `"Eight minutes on the clock: what earns more respect — trying something new badly in public, or being reliably great at your one thing? Claim in the first minute. Go."`,
      practiceB: `"Eight minutes: one skill everyone should learn by sixteen. Pick it, claim it, prove it, close it. Go."`,
      skillCheck: `A complete, organized paragraph inside the window — claim early, ≥1 real support, an actual closing line. Fluency over polish. At this band: visible *planning before drafting* (the 90 seconds are spent, not skipped).`,
      gamingNote: `Laziest path — stalling the clock then rushing three thin sentences, or ignoring the timer to polish sentence one forever. Closer: *"Where did minute two go? Next rep, say your claim out loud inside the first sixty seconds — today the clock is the coach, not me."*`
    },
    '11-12': {
      warmup: `"When a clock is running, what's the first thing your writing sacrifices — spelling, structure, or thinking? Lock in a guess. We're about to check."`,
      practiceA: `"Twelve minutes on the clock: *is being easily impressed a strength or a weakness?* One complete paragraph — claim, two supports, a real close. Clock stays visible. No restarts."`,
      practiceB: `"Ten minutes: *which is worse — being bored, or being busy with something pointless?* Same full shape, less runway. Budget the minutes out loud before you start: how many to think, write, fix?"`,
      skillCheck: `A *complete* shape lands inside the budget — claim through close, not a longer unfinished blob. Band bar (stamina + self-aware craft): the student makes a visible triage decision mid-flight and can name it; degradation shows up in polish, never in structure. If the writer finishes with slack, the budget shrinks on the next rep until triage is *observed*, not claimed — the skill is choosing under pressure, and pressure is the coach's to guarantee.`,
      gamingNote: `*Lazy path:* writing long and unfinished then blaming the clock, or writing something tiny and safe that never risked the full shape — or coasting on a pre-cached argument. *Closing question:* "What did you consciously throw overboard to finish on time — and was that the right cargo?"`
    }
  },
  personal_statement_voice: {
    '6-7': {
      warmup: `"If someone who's never met you read one true paragraph about you, what's one small true thing you'd want them to walk away knowing? Not a brag — just true."`,
      practiceA: `the object that is you: "Pick one ordinary object you own that says something true about you — worn shoelaces, a cracked phone case, a keychain, a stub of a pencil. Write about the object and let IT do the talking. Claims like 'I am hardworking' are banned; the object has to show it."`,
      practiceB: `the invisible habit: "Describe one small habit you have that most people never notice — and what it quietly says about you. Rules: sound like you, be honest, and no superhero-résumé voice allowed."`,
      skillCheck: `One true, specific, non-braggy thing about themselves shown through concrete stuff, in their own voice. At 12 the pass is *honest-and-specific* — "impressive" is not a category we score. (The college-essay stakes arrive years from now; the voice habit starts here.)`,
      gamingNote: `Laziest dodge — the résumé-brag ("I am a natural leader who never gives up") or performed humility, both borrowed voices. Closing question: *"Which sentence here could ONLY have been written by you? If your best friend could hand in the same paragraph about themselves, it isn't yours yet."*`
    },
    '9-10': {
      warmup: `"What's something true about you that never shows up in how adults describe you?"`,
      practiceA: `"Write about the thing you do differently from everyone you've watched do it — how you take notes, warm up, pack, prep — and let the difference do the talking, WITHOUT ever writing 'this shows that I am…'"`,
      practiceB: `"Tell the story of getting slightly better at something nobody made you practice. Sound like a person, not an application."`,
      skillCheck: `A concrete scene or detail carries the trait; zero résumé-speak ("passionate," "driven," "ever since I was young"); the register matches the student's own Voice-session baseline, elevated but still theirs.`,
      gamingNote: `Laziest path — the humble-brag template ("Through this experience I learned the true meaning of leadership"). Closer: *"Delete the sentence that announces what it means. Does the story still say it on its own? If not, the story needs a better detail — not a better label."*`
    },
    '11-12': {
      warmup: `"Think of a small moment from this month you'd never put in a highlight reel — nothing heavy, the kind of thing you'd tell with a shrug — that you keep coming back to anyway. Hold that one. Do not trade it for a bigger one."`,
      practiceA: `"Pick a ten-minute stretch from the past month you'd relive exactly as it was. Rule: it must be small enough that nobody else would think to write about it. No milestones, no hardship, nothing that belongs in a movie trailer — the ordinary version of you is the interesting one. Talk it through, then write it so a stranger could tell it's *you*."`,
      practiceB: `"Something you're weirdly meticulous about that nobody asked you to be. Write it so the reader learns who you are without you ever describing yourself — no adjectives about your own character allowed."`,
      skillCheck: `A small true moment rendered in verifiable specifics, in the student's actual voice on its best day. Band bar: zero résumé varnish, zero borrowed gravity, zero imported adversity — the piece sounds like *them*, not like An Applicant.`,
      gamingNote: `*Lazy path:* upgrading the moment into a lesson-learned montage, or smuggling in achievement-speak and manufactured hardship because that's what The Essay is supposed to sound like. Residual risk (logged, not fully fixable): curated quirk — the strategically ordinary moment; the Voice transcript-match and this closer are the live counters. *Closing question:* "Which sentence here could nobody else have written? And which sentence could sit in anyone's essay — can we lose it right now?"`
    }
  },
  revision: {
    '6-7': {
      warmup: `"What's the difference between fixing the spelling in a sentence and deciding the sentence is about the wrong thing?"`,
      practiceA: `re-see a portfolio piece: "Pull up any paragraph from your gym portfolio — or if you'd rather, quick-draft a fresh one about a smell that teleports you somewhere. Now RE-SEE it: change at least one big thing — the order, the opening, or what it's really about. Not word swaps. Keep both versions and name the big change out loud."`,
      practiceB: `dig up the buried treasure: "Fast, messy draft — two minutes: 'the best gift you could give that costs nothing.' Now the revision pass: find the most interesting sentence buried in it and REBUILD the whole paragraph around that sentence. Both versions get saved."`,
      skillCheck: `The after-version differs *structurally* — something moved, died, or got reframed — not just word swaps, and the kid can state the one big decision they made. Proofreading-only = not revision, and saying so out loud is part of the lesson.`,
      gamingNote: `Laziest dodge — fixing commas and one word, then calling it revised. Closing question: *"Name one sentence that existed in draft one that's gone or moved in draft two — and why. No casualties, no revision."*`
    },
    '9-10': {
      warmup: `"What's the difference between fixing typos and changing your mind about a sentence? Which one scares you more?"`,
      practiceA: `"Fast draft, 4–5 sentences: convince someone to try your favorite way to spend a free afternoon — something ordinary and free. Then re-see it for a skeptic who hates being sold to: change the ANGLE and the order. Restructure — don't polish."`,
      practiceB: `"Quick paragraph on the most underrated hour of the day. Then revise under one hard rule: the paragraph must end where it currently begins — your first sentence becomes your LAST, and everything reorganizes to earn it."`,
      skillCheck: `Both versions captured; the change is structural — order, angle, or claim — not cosmetic. At this band the student names what they *rethought* and why, in revision language ("draft one assumed the reader already agreed").`,
      gamingNote: `Laziest path — swapping synonyms and shuffling commas, then calling it revision. Closer: *"Show me one sentence whose JOB changed, not just its outfit. What did draft one believe that draft two doesn't?"*`
    },
    '11-12': {
      warmup: `"Think of something you've rearranged — a room, a playlist, a shelf. What's the difference between *tidying* it and rethinking the whole layout? Today we do the second one to a paragraph."`,
      practiceA: `BEFORE: four fast minutes drafting a paragraph about a small decision you make every day without thinking. Then — before touching a word — say in ONE sentence what the draft is *secretly* about: the thing it circles but never lands on. Now revise so *that* is the organizing idea. AFTER goes next to BEFORE.`,
      practiceB: `"Quick-draft your method for remembering something you absolutely can't forget — a number, a name, lines, directions. Then revise under a purpose flip: the draft *explains*; the revision must *persuade* a specific skeptic to adopt your method. Same facts — every sentence gets a new job. Both versions stay visible."`,
      skillCheck: `The after differs *structurally* — new spine, not shaved sentences. Band bar (self-aware craft — an artifact, not narration): the one-sentence revision brief is stated *before* revising and becomes the artifact — the after is graded against the brief, not against vibes; and the best line of the before survives on purpose, with the student able to say what new job it's doing.`,
      gamingNote: `*Lazy path:* proofreading in a trench coat — commas fixed, two synonyms swapped, "revised." *Closing question:* "If I diff the two skeletons — not the words, the skeletons — do I see a new shape, or the same shape with a haircut?"`
    }
  },
  style_awareness: {
    '6-7': {
      warmup: `"Could you recognize a text from your best friend even with the name hidden? What gives them away?"`,
      practiceA: `writing detective: "Write a short paragraph about tonight's sky or today's light — whatever's out the window. Then we play detective on YOUR writing: put tonight's paragraph next to two older gym paragraphs — or if your portfolio's thin, write three more sentences about anything at all. A move only counts as YOURS if you can point to it showing up TWICE. Find two."`,
      practiceB: `the signature move, on purpose: "Skim the first lines of your last few gym paragraphs. What keeps showing up — a move, a rhythm, a kind of joke? Now write a tiny new paragraph about the moment right before something good happens, doing your signature move ON PURPOSE this time."`,
      skillCheck: `Names at least one real recurring habit in their own writing, points to an actual line as proof *in two separate samples*, and reuses it deliberately once. Self-recognition — "I do that thing" — is the entire skill at this age; *developing* a style is a years-long project.`,
      gamingNote: `Laziest dodge — claiming a generic style ("I'm descriptive," "I'm funny") with zero evidence. Closing question: *"Show me the line. Which exact words in your own paragraph prove that habit exists — and where does it show up a second time?"*`
    },
    '9-10': {
      warmup: `"If your friends read three anonymous texts, could they spot yours? What exactly gives you away?"`,
      practiceA: `"Short paragraph: rain doing its thing outside a window — first in YOUR style, then the same scene as written by the most dramatic narrator alive. Then name two moves that make version one unmistakably yours."`,
      practiceB: `"Describe the feeling of finally finishing something you'd been putting off — in your natural style. Then point at two fingerprints in it: a rhythm you fall into, a kind of joke, a move you keep making."`,
      skillCheck: `The student identifies ≥2 recurring moves in their own writing (pull portfolio entries as receipts where available); the contrast version sharpens the self-description. At this band, style is described as *choices* — never "idk, it's just how I write."`,
      gamingNote: `Laziest path — claiming a style with no evidence ("my style is deep and relatable"). Closer: *"Point to the exact line where that shows up. A style you can't point to is a mood, not a style — what do you do on the page more than once?"*`
    },
    '11-12': {
      warmup: `"If your best friend impersonated your texting style for a day, what would they exaggerate? That exaggeration is data — it's your style, seen from outside."`,
      practiceA: `"Write a short paragraph about one tiny thing that happened today. Then write a *parody of yourself* — same event, your tics cranked to eleven. Then name three signature moves the parody exposed."`,
      practiceB: `"Same tiny event twice: once in your natural style, once in the style of your exact opposite as a writer. Then tell me what your real version *refuses* to do — that refusal is style too."`,
      skillCheck: `The named moves are genuinely theirs — verifiable against their portfolio, not generic. Band bar (meta-craft): the parody proves real self-recognition, and the student can articulate their style's negative space — what it won't do even on a deadline.`,
      gamingNote: `*Lazy path:* parodying Generic Teen Writing instead of their own, or an "opposite" that's just formal. *Closing question:* "Which move in the parody is *actually yours* — show me it in the real paragraph. And what would your style never do, even rushed?"`
    }
  },
  complex_argument: {
    '6-7': {
      warmup: `"Big arguments are stacks: claim, reasons, the other side's best 'but what about—', and your answer to it. Think of an argument you actually won. What was the other person's strongest point?"`,
      practiceA: `a real say: "Take a real position: kids your age deserve more say in what they read and watch. (Or argue they don't!) Build the argument MAP, one line per slot: main claim → two reasons, each with one piece of evidence → the strongest pushback a smart adult would raise → your rebuttal. Then fully write ONLY the pushback-plus-rebuttal chunk."`,
      practiceB: `the missing holiday: "Argue that the world needs one new holiday — you invent it. Map it first: claim, two reasons with evidence, the best objection someone would actually raise, your answer to it. One line per slot. Then write just the paragraph for your single strongest reason."`,
      skillCheck: `The map holds a claim, two genuinely different reasons, a REAL objection, and a rebuttal that answers *that* objection — and the one written chunk does its single job well. Map coherence beats prose polish; a 12-year-old juggling all four slots on paper is the win.`,
      gamingNote: `Laziest dodge — inventing a softball objection just to swat it. Closing question: *"Is that the objection a smart disagree-er would actually raise? Ask me — I'll play the other side for real. Then answer THAT one."*`
    },
    '9-10': {
      warmup: `"Think of a question where your honest answer is 'it depends.' What does it depend ON? Congratulations — that's a multi-part argument being born."`,
      practiceA: `"Map a multi-paragraph argument: do people do their best work with a rival breathing down their neck, or with someone in their corner? Think ranked queues, duet covers, speedrun races — anywhere both exist. Thesis, two or three claim blocks that BUILD on each other, where the strongest objection lives, and your rebuttal. Then write the rebuttal paragraph in full."`,
      practiceB: `"Map the case for — or against — ranking things at all: top-10 lists, tier lists, MVPs. Thesis, claim blocks, a planted counterargument and your response. Then fully write whichever paragraph carries your best evidence."`,
      skillCheck: `The map shows claims that *build* (not three parallel reasons); the objection is planted where it hurts most, not where it's convenient; the written paragraph executes its slot in the map. At this band the rebuttal concedes something real before answering.`,
      gamingNote: `Laziest path — three restatements of the thesis dressed up as separate claims. Closer: *"If I delete claim two, what does the reader stop believing? If the answer is nothing, it's the same claim in a new shirt — what's the step it should actually be carrying?"*`
    },
    '11-12': {
      warmup: `"Think of an argument you find satisfying even though you disagree with its conclusion. What is it doing *right* that most arguments you agree with don't bother doing?"`,
      practiceA: `"Returning the shopping cart: the purest available test of character, or a meaningless chore we've collectively over-moralized? Blueprint first — claim, two supports, the strongest counter, your rebuttal. Then run the mini-arc: ¶1 claim + best support, ¶2 counter met head-on, ¶3 a close that's earned the right to say more than ¶1 did."`,
      practiceB: `"Do you owe honesty to people you'll never see again — the stranger who asks 'how are you,' the cashier, the wrong number? Same drill: blueprint, then the three-paragraph arc with the counter given its best day in court."`,
      skillCheck: `The mini-arc holds one through-line — each paragraph needs the previous one. Band bar (nuance + compression): the rebuttal engages the counter's *strongest* form rather than a convenient one, and ¶3 moves past ¶1 instead of re-parking on it.`,
      gamingNote: `*Lazy path:* three disconnected paragraphs in a trench coat — a token one-sentence counter, instantly waved off. The shopping cart is a famous internet ethics meme — if the argument sounds downloaded, ask: *"what does the internet version of this fight get wrong?"* Original position not required; original reasoning is. *Closing question:* "Read me only your three first-sentences. Do they tell one story that's *moving* — or three parked next to each other?"`
    }
  },
  portfolio_review: {
    '6-7': {
      warmup: `"Without looking — which paragraph from your gym do you remember most? Why that one, do you think?"`,
      practiceA: `old you, new you: "Open your earliest gym paragraph and your newest one side by side. Talk me through it: one thing old-you did that new-you doesn't, and one move new-you has that old-you didn't. Then write a short note to a kid starting week 1 — what actually changes, from someone who knows?"`,
      practiceB: `the top three: "Pick your personal top-3 paragraphs from the whole portfolio and defend the ranking out loud — what earns each spot? Then write a museum-style label card for your #1: two or three sentences on what skill it shows and how you'd push it even further."`,
      skillCheck: `Points to *specific lines* as evidence of change, not "I got better." Naming one concrete before→after difference in their own writing, with the receipts, is the whole win — and it's a big one.`,
      gamingNote: `Laziest dodge — vibes-only reflection: "I improved a lot and learned many skills." Closing question: *"Show me the sentence. Which exact line in the new piece could week-1 you not have written?"*`
    },
    '9-10': {
      warmup: `"Before you look at anything — predict: what do you think Week-1 you sounds like? Be specific. Then we check."`,
      practiceA: `"Open your first three portfolio paragraphs next to your three most recent. Pull one exact line from each era, set them side by side, and write a short piece on what changed — quoting yourself as the evidence."`,
      practiceB: `"Write the trailer for your portfolio: the three moments you'd show someone to prove you leveled up. Specific paragraphs, specific lines — and what each one proves."`,
      skillCheck: `Growth claims cite *specific lines* from the portfolio (the Evidence skill, turned on the self); skills are named by name ("that's the show-don't-tell move"). At this band the review also names the NEXT gap, honestly.`,
      gamingNote: `Laziest path — the generic glow-up narrative ("I used to be bad at writing and now I'm better"). Closer: *"Prove it the way the Evidence session taught you. Which exact sentence from this month could the September version of you not have written — and what, specifically, is in it that used to be missing?"*`
    },
    '11-12': {
      warmup: `"Before you look back at anything: predict what's changed most in your writing since your first session. Lock the guess in — then we check it against the actual evidence." *(Deliberate reuse of the 9–10 prediction-lock device — the right anti-confabulation tool at both bands; logged in the derivation ledger.)*`,
      practiceA: `"Open your earliest portfolio piece next to your latest. Name — in craft terms, not vibes — three things later-you does that earlier-you didn't. Then write a short paragraph about the writer who's emerging, citing your own lines like evidence, because they are."`,
      practiceB: `"Pick the portfolio piece you'd most want to revise today. Say exactly what current-you would change and *why* — every specific change you can name is a skill you didn't have when you wrote it. Then write the paragraph making that case."`,
      skillCheck: `Growth claims cite specific lines and named moves — hook restraint, verb choice, a load-bearing transition. Band bar (self-aware craft): the student frames growth as *acquired moves*, not revealed talent, and names one current weakness without flinching — **shown in a quoted line from their own work**, same evidence standard as the growth claims (closes the humblebrag exploit: "I overwrite because I care too much" needs a receipt too).`,
      gamingNote: `*Lazy path:* the vibes-based redemption arc — "I used to be bad at writing, now I'm confident." *Closing question:* "Show me one sentence from this month that week-one you *couldn't* have written. Name the move inside it. Now show me the line where your named weakness actually happens."`
    }
  }
}

export function getChallenge(skillKey, band) { return GYM_CHALLENGE_BANK[skillKey]?.[band] ?? GYM_CHALLENGE_BANK[skillKey]?.['9-10'] ?? null }
