import './globals.css'

export const metadata = {
  title: 'BrainScribe',
  description: 'Voice-first Socratic writing tutor',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
