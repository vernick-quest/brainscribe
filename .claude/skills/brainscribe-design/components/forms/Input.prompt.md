Labeled text field with hint + error states. Set `multiline` for a textarea.

```jsx
<Input label="Email" type="email" placeholder="you@school.edu" hint="Use your school email" />

<Input
  label="Your assignment"
  multiline
  rows={4}
  placeholder="Paste your writing assignment here…"
  error={tooShort ? 'Add a bit more detail' : undefined}
/>
```

Passes through all native input/textarea attributes. Focus ring is the warm orange `--ring`.
