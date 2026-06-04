import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Render a markdown string to HTML. Used SSR-only (no `client:*` directive), so
 * Astro renders it to static HTML and ships zero JS — informe content (plans,
 * reviews) reads as formatted markdown instead of raw `##`/`**` text.
 */
export default function Markdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
}
