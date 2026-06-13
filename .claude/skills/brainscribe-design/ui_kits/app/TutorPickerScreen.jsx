const { TutorCard, Button } = window.BrainScribeDesignSystem_eceaf4

function TutorPickerScreen({ onPick }) {
  const [picked, setPicked] = React.useState('sage')
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-page)', padding: 'var(--space-8) var(--space-6)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <p style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--accent)', margin: '0 0 8px' }}>
          Pick your coach
        </p>
        <h1 style={{ font: 'var(--type-title)', color: 'var(--text-strong)', margin: '0 0 6px' }}>
          Who would you like to write with?
        </h1>
        <p style={{ font: 'var(--type-lead)', color: 'var(--text-muted)', margin: '0 0 var(--space-7)', maxWidth: '46ch' }}>
          Every tutor asks great questions — they just have different styles. You can switch any time.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          {window.BS_TUTORS.map(t => (
            <TutorCard key={t.persona} persona={t.persona} name={t.name} style={t.style}
              description={t.desc} selected={picked === t.persona} onSelect={() => setPicked(t.persona)} />
          ))}
        </div>

        <div style={{ marginTop: 'var(--space-7)', display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" size="lg" onClick={() => onPick(picked)}>
            Continue with {window.BS_TUTORS.find(t => t.persona === picked).name}
          </Button>
        </div>
      </div>
    </div>
  )
}
window.TutorPickerScreen = TutorPickerScreen
