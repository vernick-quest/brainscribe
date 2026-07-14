// Renders a JSON-LD <script>. Server component (no hooks) so it works in any
// layout/page. Pass a plain schema object (see lib/schema.js).
export default function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
