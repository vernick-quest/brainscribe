Review card shown after the scribe cleans up a student's spoken answer — they approve, edit, or discard before it joins the essay.

```jsx
<ScribePreview
  paragraph={scribed.text}
  isThin={scribed.isThin}
  thinNote="You shared a good starting idea — let's build on it!"
  onApprove={addToEssay}
  onEdit={(text) => addToEssay(text)}
  onDiscard={() => setPending(null)}
/>
```

Composes `Button` + `Badge`. Editing is handled internally; `onEdit` receives the final text.
