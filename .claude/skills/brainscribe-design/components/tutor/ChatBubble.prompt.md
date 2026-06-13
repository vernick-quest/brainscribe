A single chat message in the tutor conversation. Tutor bubbles sit left (cream); student bubbles sit right (navy). Tutor bubbles can be read aloud with a word-by-word highlight that syncs to the speech.

```jsx
// Read-along synced to real speech boundaries:
function speak(text, setChar, onDone) {
  const u = new SpeechSynthesisUtterance(text)
  u.onboundary = (e) => setChar(e.charIndex)
  u.onend = onDone
  speechSynthesis.speak(u)
}

const [speaking, setSpeaking] = React.useState(false)
const [char, setChar] = React.useState(null)

<ChatBubble
  role="tutor"
  speaking={speaking}
  spokenChar={char}
  onSpeak={() => { setSpeaking(true); speak(text, setChar, () => setSpeaking(false)) }}
>
  {text}
</ChatBubble>

<ChatBubble role="student">I think he changes after his friend leaves.</ChatBubble>
```

`role`: `tutor` (left, read-aloud) or `student` (right, navy). Pass `speaking` to start the read-along; supply `spokenChar` for true speech sync, or omit it for an estimated pace. `streaming` shows a typing caret; `raw` renders mono verbatim text. Children must be a plain string for the highlight to work.
