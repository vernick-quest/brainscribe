Primary action button — use orange `primary` for the main, inviting action on a view; `navy` for dark/structural contexts; `secondary`/`soft`/`ghost` for lower-emphasis actions.

```jsx
<Button variant="primary" size="lg" onClick={start}>
  Start writing with BrainScribe
</Button>

<Button variant="secondary">Edit</Button>
<Button variant="ghost" size="sm">Discard</Button>
```

Variants: `primary` (orange, glows), `navy`, `secondary` (outline), `soft` (orange tint), `ghost`. Sizes: `sm` / `md` / `lg`. Pass `block` for full-width, `leftIcon`/`rightIcon` for icons, `as="a"` to render a link. All native button props pass through.
