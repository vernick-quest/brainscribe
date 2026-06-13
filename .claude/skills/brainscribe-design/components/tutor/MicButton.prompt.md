The voice-capture button — the heart of BrainScribe's speech-to-text flow.

```jsx
const [listening, setListening] = React.useState(false)
<MicButton listening={listening} onClick={() => setListening(v => !v)} />
```

Rest state: orange with a spark glow. `listening`: red with pulsing rings + stop icon. Sizes: `sm` / `md`. Already labeled for screen readers ("Tap to speak" / "Stop recording").
