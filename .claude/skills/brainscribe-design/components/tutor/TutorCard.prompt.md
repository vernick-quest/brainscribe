Selectable coaching-persona card for the "choose your tutor" picker.

```jsx
<TutorCard
  persona="sage" name="Sage" style="Methodical · calm"
  description="Breaks big assignments into clear, ordered steps."
  selected={picked === 'sage'}
  onSelect={() => setPicked('sage')}
/>
```

Personas: `sage` (navy), `zip` (orange), `coach` (green), `muse` (violet) — each sets the accent ring + Avatar color. Composes `Avatar`.
