/* @ds-bundle: {"format":3,"namespace":"BrainScribeDesignSystem_eceaf4","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"ChatBubble","sourcePath":"components/tutor/ChatBubble.jsx"},{"name":"MicButton","sourcePath":"components/tutor/MicButton.jsx"},{"name":"ScribePreview","sourcePath":"components/tutor/ScribePreview.jsx"},{"name":"TutorCard","sourcePath":"components/tutor/TutorCard.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"763bd48a4f70","components/core/Badge.jsx":"e7b5432d2f99","components/core/Button.jsx":"10ab156dd59b","components/core/Card.jsx":"d3e5b0130f44","components/forms/Input.jsx":"00f51ea7e4a9","components/tutor/ChatBubble.jsx":"b7baddea49d0","components/tutor/MicButton.jsx":"7c257c98f428","components/tutor/ScribePreview.jsx":"9273736990f1","components/tutor/TutorCard.jsx":"cc8848a27584","ui_kits/app/AppData.jsx":"6e5cae0dafa3","ui_kits/app/AppHeader.jsx":"7954e723449d","ui_kits/app/DashboardScreen.jsx":"a5673919e0f2","ui_kits/app/LoginScreen.jsx":"2bac7d822c80","ui_kits/app/SessionScreen.jsx":"7ed79a644ecb","ui_kits/app/TranscriptScreen.jsx":"90d20a3ff599","ui_kits/app/TutorPickerScreen.jsx":"ad5d618c1644"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.BrainScribeDesignSystem_eceaf4 = window.BrainScribeDesignSystem_eceaf4 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-avatar {
  font-family: var(--font-display);
  font-weight: var(--fw-bold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  color: #fff;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
.bs-avatar img { width: 100%; height: 100%; object-fit: cover; }
.bs-avatar--sm { width: 32px; height: 32px; font-size: var(--text-xs); }
.bs-avatar--md { width: 44px; height: 44px; font-size: var(--text-base); }
.bs-avatar--lg { width: 64px; height: 64px; font-size: var(--text-xl); }
`;
const TUTOR_COLORS = {
  sage: 'var(--tutor-sage)',
  zip: 'var(--tutor-spark)',
  coach: 'var(--tutor-coach)',
  muse: 'var(--tutor-muse)',
  quill: 'var(--tutor-quill)',
  nova: 'var(--tutor-nova)'
};

/** Round avatar — tutor persona, student initial, or photo. */
function Avatar({
  name = '',
  src = null,
  tutor = null,
  color = null,
  size = 'md',
  className = '',
  ...rest
}) {
  useStyle('bs-avatar', CSS);
  const bg = color || tutor && TUTOR_COLORS[tutor] || 'var(--navy-600)';
  const initial = name ? name.trim()[0].toUpperCase() : '?';
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `bs-avatar bs-avatar--${size} ${className}`,
    style: {
      background: src ? 'transparent' : bg
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name
  }) : initial);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-badge {
  font-family: var(--font-sans);
  font-weight: var(--fw-semibold);
  font-size: var(--text-xs);
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.bs-badge .bs-badge__dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.bs-badge--neutral { background: var(--surface-muted); color: var(--ink-700); }
.bs-badge--navy    { background: var(--navy-100); color: var(--navy-800); }
.bs-badge--accent  { background: var(--accent-soft); color: var(--orange-700); }
.bs-badge--success { background: var(--status-success-bg); color: var(--green-500); }
.bs-badge--thin    { background: var(--status-thin-bg); color: var(--amber-500); }
.bs-badge--error   { background: var(--status-error-bg); color: var(--red-500); }
.bs-badge--solid   { background: var(--accent); color: #fff; }
`;

/** Small status / category pill. */
function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
  ...rest
}) {
  useStyle('bs-badge', CSS);
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `bs-badge bs-badge--${tone} ${className}`
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    className: "bs-badge__dot"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Inject component CSS once. Hover/press/focus need real CSS, so each
   component ships a tiny stylesheet keyed by id. */
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-btn {
  font-family: var(--font-sans);
  font-weight: var(--fw-semibold);
  border-radius: var(--radius-pill);
  border: 1.5px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  transition: background var(--dur-base) var(--ease-soft),
              color var(--dur-base) var(--ease-soft),
              border-color var(--dur-base) var(--ease-soft),
              transform var(--dur-fast) var(--ease-soft),
              box-shadow var(--dur-base) var(--ease-soft);
}
.bs-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.bs-btn:active { transform: translateY(1px) scale(0.985); }
.bs-btn[disabled] { opacity: 0.45; cursor: not-allowed; transform: none; }

.bs-btn--sm { font-size: var(--text-sm); padding: 8px 16px; min-height: 36px; }
.bs-btn--md { font-size: var(--text-base); padding: 11px 22px; min-height: var(--tap-min); }
.bs-btn--lg { font-size: var(--text-md); padding: 15px 30px; min-height: 54px; }
.bs-btn--block { width: 100%; }

.bs-btn--primary { background: var(--accent); color: var(--text-on-accent); box-shadow: var(--shadow-spark); }
.bs-btn--primary:hover:not([disabled]) { background: var(--accent-hover); }
.bs-btn--primary:active:not([disabled]) { background: var(--accent-press); }

.bs-btn--navy { background: var(--primary); color: var(--text-on-dark); box-shadow: var(--shadow-sm); }
.bs-btn--navy:hover:not([disabled]) { background: var(--primary-hover); }

.bs-btn--secondary { background: var(--surface-card); color: var(--text-strong); border-color: var(--border-strong); }
.bs-btn--secondary:hover:not([disabled]) { border-color: var(--navy-800); background: var(--navy-50); }

.bs-btn--soft { background: var(--accent-soft); color: var(--orange-700); }
.bs-btn--soft:hover:not([disabled]) { background: var(--orange-200); }

.bs-btn--ghost { background: transparent; color: var(--text-link); }
.bs-btn--ghost:hover:not([disabled]) { background: var(--navy-50); }
`;

/**
 * Primary action button. `variant` sets intent, `size` sets scale.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  leftIcon = null,
  rightIcon = null,
  as = 'button',
  className = '',
  ...rest
}) {
  useStyle('bs-button', CSS);
  const Tag = as;
  const cls = ['bs-btn', `bs-btn--${variant}`, `bs-btn--${size}`, block ? 'bs-btn--block' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), leftIcon, children, rightIcon);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-card {
  font-family: var(--font-sans);
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
  color: var(--text-body);
}
.bs-card--flat { box-shadow: none; }
.bs-card--raised { box-shadow: var(--shadow-md); border-color: transparent; }
.bs-card--muted { background: var(--surface-muted); border-color: transparent; box-shadow: none; }
.bs-card--ink { background: var(--surface-ink); color: var(--text-on-dark); border-color: transparent; }
.bs-card--interactive { cursor: pointer; transition: box-shadow var(--dur-base) var(--ease-soft), transform var(--dur-base) var(--ease-soft); }
.bs-card--interactive:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
`;

/** Surface container — the basic paper block of the UI. */
function Card({
  children,
  variant = 'default',
  interactive = false,
  as = 'div',
  className = '',
  ...rest
}) {
  useStyle('bs-card', CSS);
  const Tag = as;
  const cls = ['bs-card', variant !== 'default' ? `bs-card--${variant}` : '', interactive ? 'bs-card--interactive' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-field { font-family: var(--font-sans); display: flex; flex-direction: column; gap: 7px; }
.bs-field__label { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.bs-field__hint { font-size: var(--text-xs); color: var(--text-muted); }
.bs-input, .bs-textarea {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  color: var(--text-body);
  background: var(--surface-card);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color var(--dur-base) var(--ease-soft), box-shadow var(--dur-base) var(--ease-soft);
}
.bs-textarea { resize: vertical; line-height: var(--leading-relaxed); min-height: 96px; }
.bs-input::placeholder, .bs-textarea::placeholder { color: var(--text-subtle); }
.bs-input:hover, .bs-textarea:hover { border-color: var(--border-strong); }
.bs-input:focus, .bs-textarea:focus { outline: none; border-color: var(--orange-400); box-shadow: var(--focus-ring); }
.bs-field--error .bs-input, .bs-field--error .bs-textarea { border-color: var(--status-error); }
.bs-field__error { font-size: var(--text-xs); color: var(--status-error); }
`;

/** Labeled text input / textarea with hint and error states. */
function Input({
  label,
  hint,
  error,
  id,
  multiline = false,
  className = '',
  ...rest
}) {
  useStyle('bs-input', CSS);
  const fieldId = id || (label ? `f-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const Control = multiline ? 'textarea' : 'input';
  return /*#__PURE__*/React.createElement("div", {
    className: `bs-field ${error ? 'bs-field--error' : ''} ${className}`
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "bs-field__label",
    htmlFor: fieldId
  }, label), /*#__PURE__*/React.createElement(Control, _extends({
    id: fieldId,
    className: multiline ? 'bs-textarea' : 'bs-input'
  }, rest)), error ? /*#__PURE__*/React.createElement("span", {
    className: "bs-field__error"
  }, error) : hint && /*#__PURE__*/React.createElement("span", {
    className: "bs-field__hint"
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/tutor/ChatBubble.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-bubble-row { display: flex; gap: 10px; align-items: flex-end; width: 100%; }
.bs-bubble-row--tutor { justify-content: flex-start; }
.bs-bubble-row--student { justify-content: flex-end; }
.bs-bubble {
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-relaxed);
  max-width: 30rem;
  width: fit-content;
  padding: 13px 17px;
  border-radius: var(--radius-lg);
}
.bs-bubble--tutor {
  background: var(--surface-muted);
  color: var(--text-body);
  border-bottom-left-radius: var(--radius-xs);
  order: 2;
}
.bs-bubble-row--tutor .bs-bubble__speak { order: 1; }
.bs-bubble--student {
  background: var(--primary);
  color: var(--text-on-dark);
  border-bottom-right-radius: var(--radius-xs);
}
.bs-bubble--raw { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--ink-700); background: var(--cream-200); }

/* Read-along (karaoke) highlight — words light up as they're spoken */
.bs-bubble__w { border-radius: 5px; padding: 0 1px; transition: color var(--dur-fast) var(--ease-soft), background var(--dur-fast) var(--ease-soft); }
.bs-bubble.is-reading .bs-bubble__w { color: var(--text-subtle); }
.bs-bubble.is-reading .bs-bubble__w--said { color: var(--text-body); }
.bs-bubble.is-reading .bs-bubble__w--now {
  color: var(--orange-800);
  background: var(--accent-soft);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.bs-bubble__speak {
  flex-shrink: 0;
  width: 34px; height: 34px;
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--border-default);
  background: var(--surface-card);
  color: var(--navy-700);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background var(--dur-base) var(--ease-soft), border-color var(--dur-base) var(--ease-soft);
}
.bs-bubble__speak:hover { background: var(--navy-50); border-color: var(--navy-300); }
.bs-bubble__speak.is-speaking {
  background: var(--accent-soft); border-color: var(--border-accent); color: var(--orange-700);
  animation: bs-speak-pulse 1.4s var(--ease-out) infinite;
}
.bs-bubble__speak svg { width: 16px; height: 16px; }
@keyframes bs-speak-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(240,129,30,0.0); }
  50% { box-shadow: 0 0 0 5px rgba(240,129,30,0.18); }
}
@media (prefers-reduced-motion: reduce) {
  .bs-bubble__speak.is-speaking { animation: none; }
}
.bs-bubble__caret { display: inline-block; width: 2px; margin-left: 2px; animation: bs-blink 1s steps(2) infinite; }
@keyframes bs-blink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }
`;

/* Tokenize a string into words + whitespace, tracking each token's
   starting character offset so we can sync to speech boundaries. */
function tokenize(text) {
  const out = [];
  let i = 0;
  text.split(/(\s+)/).forEach(part => {
    if (part.length) out.push({
      text: part,
      start: i,
      ws: /^\s+$/.test(part)
    });
    i += part.length;
  });
  return out;
}

/**
 * A single chat message. Tutor messages sit left in a cream bubble with a
 * read-aloud button; student messages sit right in a navy bubble.
 *
 * When `speaking` is true (string children only), words highlight one at a
 * time as a read-along. Pass `spokenChar` to drive the highlight from real
 * SpeechSynthesis word-boundary events; omit it and the bubble estimates
 * the pace itself.
 */
function ChatBubble({
  role = 'tutor',
  children,
  speaking = false,
  spokenChar = null,
  onSpeak,
  streaming = false,
  raw = false,
  className = '',
  ...rest
}) {
  useStyle('bs-bubble', CSS);
  const isTutor = role === 'tutor';
  const text = typeof children === 'string' ? children : null;
  const canRead = !!text && isTutor;

  // Estimated read-along progress. Runs whenever `speaking` so the highlight
  // never stalls; real `spokenChar` boundary events refine it (whichever is
  // further along wins).
  const [autoChar, setAutoChar] = React.useState(0);
  React.useEffect(() => {
    if (!canRead) return;
    if (speaking) {
      setAutoChar(0);
      const total = text.length;
      const start = performance.now();
      const charsPerSec = 13.5; // ~ natural reading pace
      let raf;
      const tick = t => {
        const c = Math.min(total, (t - start) / 1000 * charsPerSec);
        setAutoChar(c);
        if (c < total) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    setAutoChar(0);
  }, [speaking, canRead, text]);
  const reading = canRead && speaking;
  const cursor = Math.max(autoChar, spokenChar || 0);
  let content = children;
  if (canRead) {
    const tokens = tokenize(text);
    content = tokens.map((tok, k) => {
      if (tok.ws) return tok.text;
      const end = tok.start + tok.text.length;
      let state = '';
      if (reading) {
        if (cursor >= end) state = 'bs-bubble__w--said';else if (cursor >= tok.start) state = 'bs-bubble__w--now';
      }
      return /*#__PURE__*/React.createElement("span", {
        key: k,
        className: `bs-bubble__w ${state}`
      }, tok.text);
    });
  }
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `bs-bubble-row bs-bubble-row--${role} ${className}`
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: `bs-bubble bs-bubble--${role} ${raw ? 'bs-bubble--raw' : ''} ${reading ? 'is-reading' : ''}`
  }, content, streaming && /*#__PURE__*/React.createElement("span", {
    className: "bs-bubble__caret"
  }, "\u258B")), isTutor && onSpeak && /*#__PURE__*/React.createElement("button", {
    className: `bs-bubble__speak ${speaking ? 'is-speaking' : ''}`,
    onClick: onSpeak,
    "aria-label": speaking ? 'Stop reading aloud' : 'Read aloud'
  }, speaking ? /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "6",
    width: "12",
    height: "12",
    rx: "3"
  })) : /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M11 5 6 9H3v6h3l5 4V5z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M15.5 8.5a4 4 0 0 1 0 7",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18 6a7 7 0 0 1 0 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }))));
}
Object.assign(__ds_scope, { ChatBubble });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tutor/ChatBubble.jsx", error: String((e && e.message) || e) }); }

// components/tutor/MicButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-mic {
  position: relative;
  width: 76px; height: 76px;
  border-radius: var(--radius-pill);
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-spark);
  transition: background var(--dur-base) var(--ease-soft), transform var(--dur-fast) var(--ease-soft);
}
.bs-mic:hover { background: var(--accent-hover); }
.bs-mic:active { transform: scale(0.95); }
.bs-mic:focus-visible { outline: none; box-shadow: var(--focus-ring), var(--shadow-spark); }
.bs-mic[disabled] { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.bs-mic svg { width: 32px; height: 32px; position: relative; z-index: 1; }

.bs-mic--listening { background: var(--red-500); }
.bs-mic--listening:hover { background: var(--red-500); }
.bs-mic--listening::before,
.bs-mic--listening::after {
  content: ''; position: absolute; inset: 0;
  border-radius: var(--radius-pill);
  border: 2px solid var(--red-500);
  animation: bs-mic-ring 1.8s var(--ease-out) infinite;
}
.bs-mic--listening::after { animation-delay: 0.9s; }
@keyframes bs-mic-ring {
  0%   { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.7); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .bs-mic--listening::before, .bs-mic--listening::after { animation: none; opacity: 0; }
}
.bs-mic__sizes-sm { width: 56px; height: 56px; }
.bs-mic__sizes-sm svg { width: 24px; height: 24px; }
`;

/** The voice-capture button — BrainScribe's signature affordance. */
function MicButton({
  listening = false,
  disabled = false,
  size = 'md',
  onClick,
  className = '',
  ...rest
}) {
  useStyle('bs-mic', CSS);
  const cls = ['bs-mic', listening ? 'bs-mic--listening' : '', size === 'sm' ? 'bs-mic__sizes-sm' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    disabled: disabled,
    onClick: onClick,
    "aria-pressed": listening,
    "aria-label": listening ? 'Stop recording' : 'Tap to speak'
  }, rest), listening ? /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "6",
    width: "12",
    height: "12",
    rx: "3"
  })) : /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 9a.5.5 0 0 1 .5.5 7 7 0 0 1-6.5 6.97V20h2.5a.5.5 0 0 1 0 1h-6a.5.5 0 0 1 0-1H11v-2.53A7 7 0 0 1 4.5 10.5a.5.5 0 0 1 1 0 6 6 0 0 0 12 0 .5.5 0 0 1 .5-.5z"
  })));
}
Object.assign(__ds_scope, { MicButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tutor/MicButton.jsx", error: String((e && e.message) || e) }); }

// components/tutor/ScribePreview.jsx
try { (() => {
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-scribe {
  font-family: var(--font-sans);
  background: var(--surface-spark);
  border: 1.5px solid var(--border-accent);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-4);
}
.bs-scribe__head { display: flex; align-items: center; gap: 10px; }
.bs-scribe__eyebrow { font-size: var(--text-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: var(--tracking-caps); color: var(--orange-700); }
.bs-scribe__note { font-size: var(--text-sm); color: var(--amber-500); background: var(--status-thin-bg); border-radius: var(--radius-sm); padding: 9px 13px; }
.bs-scribe__para { font-size: var(--text-md); line-height: var(--leading-relaxed); color: var(--text-body); margin: 0; }
.bs-scribe__edit { font-family: var(--font-sans); font-size: var(--text-md); line-height: var(--leading-relaxed); color: var(--text-body); width: 100%; box-sizing: border-box; border: 1.5px solid var(--border-accent); border-radius: var(--radius-md); padding: 12px 14px; resize: vertical; min-height: 110px; }
.bs-scribe__edit:focus { outline: none; box-shadow: var(--focus-ring); }
.bs-scribe__actions { display: flex; gap: 10px; align-items: center; }
`;

/** Review card for a freshly scribed paragraph before it joins the essay. */
function ScribePreview({
  paragraph,
  isThin = false,
  thinNote,
  onApprove,
  onEdit,
  onDiscard
}) {
  useStyle('bs-scribe', CSS);
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(paragraph);
  React.useEffect(() => {
    setText(paragraph);
  }, [paragraph]);
  return /*#__PURE__*/React.createElement("div", {
    className: "bs-scribe"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bs-scribe__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bs-scribe__eyebrow"
  }, "Scribed paragraph \u2014 your review"), isThin && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "thin"
  }, "Thin")), isThin && thinNote && /*#__PURE__*/React.createElement("p", {
    className: "bs-scribe__note"
  }, thinNote), editing ? /*#__PURE__*/React.createElement("textarea", {
    className: "bs-scribe__edit",
    value: text,
    onChange: e => setText(e.target.value)
  }) : /*#__PURE__*/React.createElement("p", {
    className: "bs-scribe__para"
  }, paragraph), /*#__PURE__*/React.createElement("div", {
    className: "bs-scribe__actions"
  }, editing ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    onClick: () => {
      onEdit && onEdit(text);
      setEditing(false);
    }
  }, "Save edits"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    onClick: () => setEditing(false)
  }, "Cancel")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    onClick: onApprove
  }, "Add to essay"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    onClick: () => setEditing(true)
  }, "Edit"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    size: "sm",
    onClick: onDiscard
  }, "Discard"))));
}
Object.assign(__ds_scope, { ScribePreview });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tutor/ScribePreview.jsx", error: String((e && e.message) || e) }); }

// components/tutor/TutorCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }
}
const CSS = `
.bs-tutor {
  font-family: var(--font-sans);
  background: var(--surface-card);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-3);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur-base) var(--ease-soft), box-shadow var(--dur-base) var(--ease-soft), transform var(--dur-base) var(--ease-soft);
}
.bs-tutor:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.bs-tutor:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.bs-tutor.is-selected { border-color: var(--tutor-color, var(--accent)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tutor-color, var(--accent)) 22%, transparent); }
.bs-tutor__head { display: flex; align-items: center; gap: 12px; }
.bs-tutor__name { font-family: var(--font-display); font-weight: var(--fw-bold); font-size: var(--text-lg); color: var(--text-strong); margin: 0; }
.bs-tutor__style { font-size: var(--text-xs); font-weight: var(--fw-semibold); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--tutor-color, var(--accent)); }
.bs-tutor__desc { font-size: var(--text-sm); line-height: var(--leading-relaxed); color: var(--text-muted); margin: 0; }
.bs-tutor__check { margin-left: auto; width: 24px; height: 24px; border-radius: var(--radius-pill); background: var(--tutor-color, var(--accent)); color: #fff; display: flex; align-items: center; justify-content: center; }
.bs-tutor__check svg { width: 14px; height: 14px; }
`;
const TUTOR_COLORS = {
  sage: 'var(--tutor-sage)',
  zip: 'var(--tutor-spark)',
  coach: 'var(--tutor-coach)',
  muse: 'var(--tutor-muse)',
  quill: 'var(--tutor-quill)',
  nova: 'var(--tutor-nova)'
};

/** Selectable coaching-persona card for the tutor picker. */
function TutorCard({
  persona = 'sage',
  name,
  style,
  description,
  selected = false,
  onSelect,
  className = '',
  ...rest
}) {
  useStyle('bs-tutor', CSS);
  return /*#__PURE__*/React.createElement("button", _extends({
    className: `bs-tutor ${selected ? 'is-selected' : ''} ${className}`,
    style: {
      '--tutor-color': TUTOR_COLORS[persona]
    },
    onClick: onSelect,
    "aria-pressed": selected
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "bs-tutor__head"
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    tutor: persona,
    name: name,
    size: "md"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "bs-tutor__name"
  }, name), /*#__PURE__*/React.createElement("span", {
    className: "bs-tutor__style"
  }, style)), selected && /*#__PURE__*/React.createElement("span", {
    className: "bs-tutor__check"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  })))), /*#__PURE__*/React.createElement("p", {
    className: "bs-tutor__desc"
  }, description));
}
Object.assign(__ds_scope, { TutorCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tutor/TutorCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/AppData.jsx
try { (() => {
/* Fake data + scripted session for the BrainScribe UI kit demo. */

window.BS_TUTORS = [{
  persona: 'sage',
  name: 'Sage',
  style: 'Methodical · calm',
  desc: 'Breaks big assignments into clear, ordered steps.'
}, {
  persona: 'zip',
  name: 'Zip',
  style: 'Energetic · brisk',
  desc: 'Keeps momentum going with quick, punchy questions.'
}, {
  persona: 'coach',
  name: 'Coach',
  style: 'Steady · cheering',
  desc: 'Celebrates every bit of progress to build confidence.'
}, {
  persona: 'muse',
  name: 'Muse',
  style: 'Imaginative · playful',
  desc: 'Sparks ideas with vivid what-ifs and fun analogies.'
}, {
  persona: 'quill',
  name: 'Quill',
  style: 'Curious · precise',
  desc: 'Digs into the details and presses gently for evidence.'
}, {
  persona: 'nova',
  name: 'Nova',
  style: 'Bold · expressive',
  desc: 'Pushes for a strong voice and a point of view.'
}];
window.BS_ASSIGNMENT = 'Write a 5-paragraph essay arguing whether the main character in "The Outsiders" changes by the end of the novel. Use specific evidence from the text.';

/* A scripted back-and-forth so the mic flow feels real without a backend.
   Each turn: the tutor's Socratic question, the student's raw spoken answer,
   and the scribe's cleaned-up paragraph. */
window.BS_SCRIPT = [{
  tutor: "Let's start simple — in your own words, who is Ponyboy at the very beginning of the story?",
  raw: "um ok so like ponyboy at the start he's kind of just a greaser he hangs out with his brothers and his gang and he likes movies and books and stuff but he doesn't really get along with the socs",
  scribed: "At the beginning of the novel, Ponyboy is a greaser who spends his time with his brothers and his gang. He loves movies and books, but he doesn't get along with the rival Socs.",
  isThin: false
}, {
  tutor: "Nice setup. Now — what's one moment where Ponyboy starts to see things differently?",
  raw: "i think when he talks to cherry and she says the socs have problems too like watching sunsets",
  scribed: "Ponyboy begins to see things differently when he talks with Cherry. She explains that the Socs have their own problems too, and they realize they both watch the same sunsets.",
  isThin: true,
  thinNote: "Good moment to point to! Let's add why that conversation matters to him."
}, {
  tutor: "So by the end, would you say Ponyboy has changed? What's your strongest reason?",
  raw: "yeah he changes because after johnny dies he decides to write everything down so other kids dont end up like them he kind of grows up and sees the bigger picture",
  scribed: "By the end, Ponyboy has clearly changed. After Johnny's death, he decides to write their story down so that other kids won't end up the same way. He has grown up and can finally see the bigger picture.",
  isThin: false
}];
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/AppData.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/AppHeader.jsx
try { (() => {
const {
  Avatar
} = window.BrainScribeDesignSystem_eceaf4;

/* The signed-in student, shown top-right with a small Google "G" badge so
   it reads as a Google SSO account. */
function GoogleUserAvatar({
  name = 'Maya R.',
  photo = null
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 34,
      height: 34
    },
    title: `Signed in with Google · ${name}`
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: name,
    src: photo,
    size: "sm",
    color: "var(--navy-700)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: -3,
      bottom: -3,
      width: 16,
      height: 16,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-xs)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    fill: "#4285F4",
    d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#34A853",
    d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#FBBC05",
    d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#EA4335",
    d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
  }))));
}
window.GoogleUserAvatar = GoogleUserAvatar;

/* Student-facing header. Note: there is intentionally NO teacher-view entry
   here — students cannot reach the transcript view. Teachers/parents open
   transcripts from their own signed-in view (see the demo role switcher). */
function AppHeader({
  tutor,
  onHome,
  right,
  user = 'Maya R.'
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)',
      padding: '12px var(--space-6)',
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-default)',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onHome,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/brainscribe-wordmark.png",
    alt: "BrainScribe",
    style: {
      height: 32,
      width: 'auto',
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)'
    }
  }, right, tutor && /*#__PURE__*/React.createElement(Avatar, {
    tutor: tutor.persona,
    name: tutor.name,
    size: "sm"
  }), /*#__PURE__*/React.createElement(GoogleUserAvatar, {
    name: user
  })));
}
window.AppHeader = AppHeader;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/AppHeader.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/DashboardScreen.jsx
try { (() => {
const {
  Card,
  Button,
  Input,
  Badge
} = window.BrainScribeDesignSystem_eceaf4;
const BS_PAST = [{
  title: 'Persuasive essay: should phones be allowed in class?',
  when: 'Yesterday',
  status: 'complete'
}, {
  title: 'Analysis of the green light symbol in The Great Gatsby',
  when: '3 days ago',
  status: 'complete'
}, {
  title: 'Personal narrative: a time I surprised myself',
  when: 'Last week',
  status: 'draft'
}];
function DashboardScreen({
  tutor,
  onStart,
  onHome
}) {
  const [assignment, setAssignment] = React.useState('');
  const [file, setFile] = React.useState(null); // {name, kind}
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef(null);
  function pickFile(f) {
    if (!f) return;
    const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
    setFile({
      name: f.name,
      kind: isPdf ? 'PDF' : 'Image'
    });
    setAssignment(a => a || `Assignment uploaded: ${f.name}`);
  }
  const canStart = !!assignment.trim() || !!file;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--bg-page)'
    }
  }, window.AppHeader({
    tutor,
    onHome
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-prose)',
      margin: '0 auto',
      padding: 'var(--space-8) var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-title)',
      color: 'var(--text-strong)',
      margin: '0 0 4px'
    }
  }, "Hey, Maya \uD83D\uDC4B"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-lead)',
      color: 'var(--text-muted)',
      margin: '0 0 var(--space-7)'
    }
  }, "What are we writing today? Type your assignment, or upload a photo or PDF \u2014 ", tutor ? tutor.name : 'your tutor', " will take it from there."), /*#__PURE__*/React.createElement(Card, {
    variant: "raised",
    style: {
      padding: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-subhead)',
      color: 'var(--text-strong)',
      margin: '0 0 var(--space-4)'
    }
  }, "Start a new session"), /*#__PURE__*/React.createElement(Input, {
    multiline: true,
    rows: 4,
    value: assignment,
    onChange: e => setAssignment(e.target.value),
    placeholder: "Paste or type your writing assignment here\u2026"
  }), /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    type: "file",
    accept: "image/*,application/pdf,.pdf",
    style: {
      display: 'none'
    },
    onChange: e => pickFile(e.target.files && e.target.files[0])
  }), file ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-3)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-spark)',
      border: '1.5px solid var(--border-accent)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 'var(--radius-sm)',
      background: 'var(--accent-soft)',
      color: 'var(--orange-700)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14 2v6h6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-ui)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-strong)',
      margin: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, file.name), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--text-muted)',
      margin: '2px 0 0'
    }
  }, file.kind, " attached \xB7 we'll read it for you")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    },
    "aria-label": "Remove file",
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text-muted)',
      padding: 4
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  })))) : /*#__PURE__*/React.createElement("button", {
    onClick: () => inputRef.current && inputRef.current.click(),
    onDragOver: e => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: e => {
      e.preventDefault();
      setDragging(false);
      pickFile(e.dataTransfer.files && e.dataTransfer.files[0]);
    },
    style: {
      marginTop: 'var(--space-3)',
      width: '100%',
      cursor: 'pointer',
      textAlign: 'left',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 16px',
      borderRadius: 'var(--radius-md)',
      background: dragging ? 'var(--surface-spark)' : 'var(--surface-muted)',
      border: `1.5px dashed ${dragging ? 'var(--orange-400)' : 'var(--border-strong)'}`,
      transition: 'background var(--dur-base) var(--ease-soft), border-color var(--dur-base) var(--ease-soft)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--accent-soft)',
      color: 'var(--orange-700)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 16V4m0 0L7 9m5-5 5 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
  }))), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-ui)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-strong)',
      display: 'block'
    }
  }, "Upload a photo or PDF"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--text-muted)'
    }
  }, "Snap your worksheet or drop a handout \u2014 JPG, PNG, or PDF"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginTop: 'var(--space-4)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    disabled: !canStart,
    onClick: () => onStart(assignment || `Assignment from ${file.name}`)
  }, "Start writing"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAssignment(window.BS_ASSIGNMENT),
    style: {
      font: 'var(--type-ui)',
      color: 'var(--text-link)',
      background: 'none',
      border: 'none',
      cursor: 'pointer'
    }
  }, "Use a sample assignment"))), /*#__PURE__*/React.createElement("section", {
    style: {
      marginTop: 'var(--space-8)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-meta)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-muted)',
      margin: '0 0 var(--space-4)'
    }
  }, "Past sessions"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, BS_PAST.map((s, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    interactive: true,
    variant: "default",
    style: {
      padding: 'var(--space-4) var(--space-5)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--text-strong)',
      margin: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--text-subtle)',
      margin: '3px 0 0'
    }
  }, s.when)), /*#__PURE__*/React.createElement(Badge, {
    tone: s.status === 'complete' ? 'success' : 'neutral',
    dot: s.status === 'complete'
  }, s.status === 'complete' ? 'Complete' : 'Draft')))))));
}
window.DashboardScreen = DashboardScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/LoginScreen.jsx
try { (() => {
const {
  Button,
  Card
} = window.BrainScribeDesignSystem_eceaf4;
function LoginScreen({
  onContinue
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-page)',
      padding: 'var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 'var(--width-form)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/brainscribe-logo.png",
    alt: "BrainScribe",
    style: {
      width: 280,
      maxWidth: '80%',
      height: 'auto',
      marginBottom: 'var(--space-7)'
    }
  }), /*#__PURE__*/React.createElement(Card, {
    variant: "raised",
    style: {
      padding: 'var(--space-7)'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-heading)',
      color: 'var(--text-strong)',
      margin: '0 0 6px'
    }
  }, "Welcome back"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-muted)',
      margin: '0 0 var(--space-6)'
    }
  }, "Your voice-first writing tutor."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    block: true,
    size: "lg",
    onClick: onContinue,
    leftIcon: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("path", {
      fill: "#4285F4",
      d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    }), /*#__PURE__*/React.createElement("path", {
      fill: "#34A853",
      d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    }), /*#__PURE__*/React.createElement("path", {
      fill: "#FBBC05",
      d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    }), /*#__PURE__*/React.createElement("path", {
      fill: "#EA4335",
      d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    }))
  }, "Continue with Google"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--text-subtle)',
      marginTop: 'var(--space-5)',
      lineHeight: 'var(--leading-relaxed)'
    }
  }, "BrainScribe is invite-only. You'll need an invite link from a teacher or parent."))));
}
window.LoginScreen = LoginScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/SessionScreen.jsx
try { (() => {
const {
  MicButton,
  ChatBubble,
  ScribePreview,
  Button,
  Badge,
  Avatar
} = window.BrainScribeDesignSystem_eceaf4;
function speak(text, onChar, onEnd) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd && onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.onboundary = e => {
    if (onChar && e.charIndex != null) onChar(e.charIndex);
  };
  u.onend = () => onEnd && onEnd();
  window.speechSynthesis.speak(u);
}
function deriveTitle(assignment) {
  const q = assignment.match(/["“']([^"”']+)["”']/);
  if (q) return `“${q[1]}” essay`;
  const words = assignment.trim().split(/\s+/).slice(0, 6).join(' ');
  return words ? words + '…' : 'New assignment';
}
function SessionScreen({
  tutor,
  assignment,
  onFinish,
  onHome
}) {
  const script = window.BS_SCRIPT;
  const [messages, setMessages] = React.useState([]);
  const [paragraphs, setParagraphs] = React.useState([]);
  const [turn, setTurn] = React.useState(0);
  const [phase, setPhase] = React.useState('intro'); // intro|listening|recording|scribing|preview|done
  const [pending, setPending] = React.useState(null);
  const [speakingIdx, setSpeakingIdx] = React.useState(null);
  const [spokenChar, setSpokenChar] = React.useState(null);
  const chatRef = React.useRef(null);
  const essayRef = React.useRef(null);
  const t = tutor || {
    persona: 'sage',
    name: 'Sage',
    style: 'Methodical · calm'
  };
  React.useEffect(() => {
    setMessages([{
      role: 'tutor',
      content: script[0].tutor
    }]);
    setPhase('listening');
  }, []);
  React.useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, phase, pending]);
  React.useEffect(() => {
    if (essayRef.current) essayRef.current.scrollTop = essayRef.current.scrollHeight;
  }, [paragraphs]);
  function handleMic() {
    if (phase !== 'listening') return;
    setPhase('recording');
    const step = script[turn];
    setTimeout(() => {
      setMessages(m => [...m, {
        role: 'student',
        content: step.raw,
        raw: true
      }]);
      setPhase('scribing');
      setTimeout(() => {
        setPending(step);
        setPhase('preview');
      }, 1100);
    }, 1600);
  }
  function commit(text) {
    setParagraphs(p => [...p, {
      text,
      isThin: pending.isThin
    }]);
    setPending(null);
    const next = turn + 1;
    if (next < script.length) {
      setMessages(m => [...m, {
        role: 'tutor',
        content: script[next].tutor
      }]);
      setTurn(next);
      setPhase('listening');
    } else {
      setPhase('done');
    }
  }
  const essay = paragraphs.map(p => p.text).join('\n\n');
  const railItem = (label, value) => /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-meta)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-subtle)',
      marginBottom: 4
    }
  }, label), value);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-page)'
    }
  }, window.AppHeader({
    tutor: t,
    onHome
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 264,
      flexShrink: 0,
      background: 'var(--cream-200)',
      borderRight: '1px solid var(--border-default)',
      padding: 'var(--space-5)',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "navy"
  }, "Session"), railItem('Assignment', /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-subhead)',
      color: 'var(--text-strong)',
      margin: '6px 0 0',
      lineHeight: 'var(--leading-snug)'
    }
  }, deriveTitle(assignment))), railItem('Prompt', /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-meta)',
      fontWeight: 'var(--fw-regular)',
      color: 'var(--text-muted)',
      margin: '4px 0 0',
      lineHeight: 'var(--leading-relaxed)'
    }
  }, assignment)), railItem('Tutor', /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    tutor: t.persona,
    name: t.name,
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-ui)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-strong)'
    }
  }, t.name), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--text-subtle)'
    }
  }, t.style)))), railItem('Last updated', /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-ui)',
      color: 'var(--text-muted)',
      margin: '4px 0 0'
    }
  }, "Today \xB7 just now")), railItem('Progress', /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-ui)',
      color: 'var(--text-muted)',
      margin: '4px 0 0'
    }
  }, paragraphs.length, " paragraph", paragraphs.length === 1 ? '' : 's', " confirmed"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("section", {
    style: {
      flex: 1.7,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      background: 'var(--surface-card)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px var(--space-6)',
      borderBottom: '1px solid var(--border-default)',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-meta)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--text-muted)'
    }
  }, "Working it out"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--text-subtle)'
    }
  }, "\xB7 talk it through with ", t.name)), /*#__PURE__*/React.createElement("div", {
    ref: chatRef,
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 'var(--space-6)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 680,
      width: '100%',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-4)'
    }
  }, messages.map((m, i) => /*#__PURE__*/React.createElement(ChatBubble, {
    key: i,
    role: m.role,
    raw: m.raw,
    speaking: speakingIdx === i,
    spokenChar: speakingIdx === i ? spokenChar : null,
    onSpeak: m.role === 'tutor' ? () => {
      if (speakingIdx === i) {
        window.speechSynthesis && window.speechSynthesis.cancel();
        setSpeakingIdx(null);
        setSpokenChar(null);
        return;
      }
      setSpeakingIdx(i);
      setSpokenChar(0);
      speak(m.content, c => setSpokenChar(c), () => {
        setSpeakingIdx(null);
        setSpokenChar(null);
      });
    } : undefined
  }, m.content)), phase === 'scribing' && /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--text-subtle)',
      fontStyle: 'italic',
      textAlign: 'center'
    }
  }, "Scribing your answer\u2026"), phase === 'preview' && pending && /*#__PURE__*/React.createElement(ScribePreview, {
    paragraph: pending.scribed,
    isThin: pending.isThin,
    thinNote: pending.thinNote,
    onApprove: () => commit(pending.scribed),
    onEdit: x => commit(x),
    onDiscard: () => {
      setPending(null);
      setPhase('listening');
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-4) var(--space-6)',
      borderTop: '1px solid var(--border-default)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-4)',
      minHeight: 96
    }
  }, (phase === 'listening' || phase === 'recording') && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(MicButton, {
    listening: phase === 'recording',
    size: "sm",
    onClick: handleMic
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-ui)',
      color: 'var(--text-muted)'
    }
  }, phase === 'recording' ? 'Listening… tap to stop' : `Tap to speak your answer`)), phase === 'scribing' && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-ui)',
      color: 'var(--text-muted)'
    }
  }, "One sec\u2026"), phase === 'preview' && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-ui)',
      color: 'var(--text-muted)'
    }
  }, "Review your paragraph above \u2191"), phase === 'done' && /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true
  }, "All done \u2014 great work!"))), /*#__PURE__*/React.createElement("section", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      background: 'var(--cream-50)',
      borderTop: '2px solid var(--border-accent)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px var(--space-6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-default)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-ui)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-strong)'
    }
  }, "Your essay"), /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, paragraphs.length, " paragraph", paragraphs.length === 1 ? '' : 's')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, paragraphs.length > 0 && /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => navigator.clipboard && navigator.clipboard.writeText(essay)
  }, "Copy"), phase === 'done' && /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    onClick: onFinish
  }, "Finish & save"))), /*#__PURE__*/React.createElement("div", {
    ref: essayRef,
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 'var(--space-5) var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 680,
      margin: '0 auto'
    }
  }, paragraphs.length === 0 ? /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-subtle)',
      fontStyle: 'italic'
    }
  }, "Paragraphs you confirm move down here and become your finished essay.") : paragraphs.map((p, i) => /*#__PURE__*/React.createElement("p", {
    key: i,
    style: {
      font: 'var(--type-lead)',
      color: 'var(--text-body)',
      marginBottom: 'var(--space-4)'
    }
  }, p.text, p.isThin && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--amber-500)',
      fontStyle: 'italic',
      marginLeft: 8
    }
  }, "(building on this)")))))))));
}
window.SessionScreen = SessionScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/SessionScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/TranscriptScreen.jsx
try { (() => {
const {
  Card,
  Badge,
  Avatar,
  Button
} = window.BrainScribeDesignSystem_eceaf4;
function TranscriptScreen({
  tutor,
  onHome
}) {
  const script = window.BS_SCRIPT;
  const [showRaw, setShowRaw] = React.useState(true);
  const paragraphs = script.map(s => ({
    text: s.scribed,
    raw: s.raw,
    isThin: s.isThin
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--bg-page)'
    }
  }, window.AppHeader({
    tutor: null,
    onHome,
    user: 'Mr. Lee',
    right: /*#__PURE__*/React.createElement("span", {
      style: {
        font: 'var(--type-meta)',
        fontWeight: 'var(--fw-bold)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-caps)',
        color: 'var(--navy-600)',
        background: 'var(--navy-100)',
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)'
      }
    }, "Teacher")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-prose)',
      margin: '0 auto',
      padding: 'var(--space-8) var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 'var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "navy"
  }, "Teacher transcript"), /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true
  }, "Complete")), /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-title)',
      color: 'var(--text-strong)',
      margin: '0 0 6px'
    }
  }, "Maya R. \xB7 \"The Outsiders\" essay"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-muted)',
      margin: '0 0 var(--space-7)'
    }
  }, "Worked with ", tutor ? tutor.name : 'Sage', " \xB7 June 6, 2026 \xB7 3 paragraphs"), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-subhead)',
      color: 'var(--text-strong)',
      margin: '0 0 var(--space-3)'
    }
  }, "Assignment"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--text-body)',
      margin: 0
    }
  }, window.BS_ASSIGNMENT)), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-subhead)',
      color: 'var(--text-strong)',
      margin: 0
    }
  }, "Final essay & process"), /*#__PURE__*/React.createElement("label", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--text-muted)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: showRaw,
    onChange: e => setShowRaw(e.target.checked)
  }), "Show what the student said")), paragraphs.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginBottom: 'var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-lead)',
      color: 'var(--text-body)',
      margin: '0 0 6px'
    }
  }, p.text, p.isThin && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-meta)',
      color: 'var(--amber-500)',
      fontStyle: 'italic',
      marginLeft: 8
    }
  }, "(student was building on this)")), showRaw && /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-meta)',
      fontFamily: 'var(--font-mono)',
      color: 'var(--ink-600)',
      background: 'var(--cream-200)',
      borderLeft: '3px solid var(--border-accent)',
      borderRadius: 'var(--radius-sm)',
      padding: '10px 12px',
      margin: 0,
      lineHeight: 'var(--leading-relaxed)'
    }
  }, "\u201C", p.raw, "\u201D")))), /*#__PURE__*/React.createElement(Card, {
    variant: "muted"
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--type-subhead)',
      color: 'var(--text-strong)',
      margin: '0 0 var(--space-4)'
    }
  }, "Coaching dialogue"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }
  }, script.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--navy-700)',
      margin: '0 0 2px'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 'var(--fw-bold)'
    }
  }, tutor ? tutor.name : 'Sage', ":"), " ", s.tutor), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-body)',
      color: 'var(--ink-700)',
      margin: '0 0 var(--space-3)'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 'var(--fw-bold)'
    }
  }, "Maya:"), " ", s.raw)))))));
}
window.TranscriptScreen = TranscriptScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/TranscriptScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/TutorPickerScreen.jsx
try { (() => {
const {
  TutorCard,
  Button
} = window.BrainScribeDesignSystem_eceaf4;
function TutorPickerScreen({
  onPick
}) {
  const [picked, setPicked] = React.useState('sage');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--bg-page)',
      padding: 'var(--space-8) var(--space-6)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-meta)',
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-caps)',
      color: 'var(--accent)',
      margin: '0 0 8px'
    }
  }, "Pick your coach"), /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--type-title)',
      color: 'var(--text-strong)',
      margin: '0 0 6px'
    }
  }, "Who would you like to write with?"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--type-lead)',
      color: 'var(--text-muted)',
      margin: '0 0 var(--space-7)',
      maxWidth: '46ch'
    }
  }, "Every tutor asks great questions \u2014 they just have different styles. You can switch any time."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-4)'
    }
  }, window.BS_TUTORS.map(t => /*#__PURE__*/React.createElement(TutorCard, {
    key: t.persona,
    persona: t.persona,
    name: t.name,
    style: t.style,
    description: t.desc,
    selected: picked === t.persona,
    onSelect: () => setPicked(t.persona)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-7)',
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: () => onPick(picked)
  }, "Continue with ", window.BS_TUTORS.find(t => t.persona === picked).name))));
}
window.TutorPickerScreen = TutorPickerScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/TutorPickerScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.ChatBubble = __ds_scope.ChatBubble;

__ds_ns.MicButton = __ds_scope.MicButton;

__ds_ns.ScribePreview = __ds_scope.ScribePreview;

__ds_ns.TutorCard = __ds_scope.TutorCard;

})();
