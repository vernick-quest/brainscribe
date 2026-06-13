# BrainScribe — Student App UI kit

A high-fidelity, click-through recreation of the BrainScribe student app, rebuilt
from the `vernick-quest/brainscribe` Next.js codebase and reskinned to the brand
(navy + warm orange on cream). It composes the design-system primitives — it does
**not** reimplement them.

## Run it
Open `index.html`. The flow is fully interactive (no backend):

1. **Login** — invite-only, "Continue with Google".
2. **Pick your tutor** — choose one of six coaching personas (Sage / Zip / Coach / Muse / Quill / Nova).
3. **Dashboard** — greeting, paste-an-assignment box (or "Use a sample"), past sessions.
4. **Session** — the two-panel core: Socratic chat + mic on the left, the essay
   building paragraph-by-paragraph on the right. Tap the mic to "speak" a scripted
   answer, watch it get scribed, then **Add to essay / Edit / Discard**.
5. **Teacher transcript** — final essay with the student's raw spoken text revealed,
   plus the full coaching dialogue (the accountability view).

Use the header **Teacher view** link to jump to the transcript; the **logo** returns home.

## Files
| File | Role |
|---|---|
| `index.html` | Mounts React + the DS bundle, routes between screens |
| `AppData.jsx` | Fake tutors, sample assignment, scripted session turns |
| `AppHeader.jsx` | Shared sticky app header (logo, tutor + student avatars) |
| `LoginScreen.jsx` | Invite-only login card |
| `TutorPickerScreen.jsx` | Coaching-persona selection grid |
| `DashboardScreen.jsx` | New-session form + past sessions |
| `SessionScreen.jsx` | Two-panel chat + document, mic & scribe flow |
| `TranscriptScreen.jsx` | Teacher/parent read-only transcript |

## Components used
`Button`, `Card`, `Input`, `Badge`, `Avatar`, `MicButton`, `ChatBubble`,
`ScribePreview`, `TutorCard` — all from `window.BrainScribeDesignSystem_eceaf4`.

## Fidelity notes
- Speech-to-text and text-to-speech are simulated. The mic plays a scripted answer;
  the read-aloud (🔊) button uses the browser `SpeechSynthesis` API where available.
- The original app uses two Claude calls per turn (tutor question + scribe cleanup);
  here those are replaced by the `BS_SCRIPT` data so the flow runs offline.
- The six tutor personas are a brand extension of the single tutor prompt in the
  codebase (`lib/prompts.js`), per the product brief ("several different tutors").
