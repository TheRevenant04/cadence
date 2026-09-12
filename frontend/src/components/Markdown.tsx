import React from 'react'

type Node = React.ReactNode

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeUrl(url: string): string | null {
  const trimmed = url.trim()
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed
  return null
}

const INLINE_RE = new RegExp(
  [
    /(`[^`]+`)/.source, // code
    /(\*\*([^*]+)\*\*)/.source, // bold
    /(\*([^*]+)\*)/.source, // italic
    /(\[([^\[\]]+)\]\(([^)\s]+)\))/.source, // link
  ].join('|'),
  'g',
)

function renderInline(text: string, keyBase: string, depth = 0): Node[] {
  const nodes: Node[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  const re = new RegExp(INLINE_RE.source, 'g')
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<React.Fragment key={`${keyBase}-t${key++}`}>{text.slice(last, match.index)}</React.Fragment>)
    }
    const [full, code, , boldInner, _, italicInner, , linkText, linkUrl] = match
    if (code != null) {
      nodes.push(
        <code key={`${keyBase}-c${key++}`} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-rose-600">
          {escapeHtml(code.slice(1, -1))}
        </code>,
      )
    } else if (boldInner != null) {
      nodes.push(
        <strong key={`${keyBase}-b${key++}`} className="font-semibold">
          {renderInline(escapeHtml(boldInner), `${keyBase}-b${key}`, depth + 1)}
        </strong>,
      )
    } else if (italicInner != null) {
      nodes.push(
        <em key={`${keyBase}-i${key++}`}>{renderInline(escapeHtml(italicInner), `${keyBase}-i${key}`, depth + 1)}</em>,
      )
    } else if (linkUrl != null) {
      const href = safeUrl(escapeHtml(linkUrl))
      if (href) {
        nodes.push(
          <a
            key={`${keyBase}-l${key++}`}
            href={href}
            target={href.startsWith('#') ? undefined : '_blank'}
            rel={href.startsWith('#') ? undefined : 'noreferrer noopener'}
            className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700"
          >
            {renderInline(escapeHtml(linkText ?? ''), `${keyBase}-l${key}`, depth + 1)}
          </a>,
        )
      } else {
        nodes.push(<React.Fragment key={`${keyBase}-l${key++}`}>{full}</React.Fragment>)
      }
    } else {
      nodes.push(<React.Fragment key={`${keyBase}-e${key++}`}>{full}</React.Fragment>)
    }
    last = match.index + full.length
  }
  if (last < text.length) {
    nodes.push(<React.Fragment key={`${keyBase}-t${key++}`}>{text.slice(last)}</React.Fragment>)
  }
  return nodes
}

function renderListLine(line: string): Node[] {
  return renderInline(line, 'li')
}

function renderOlItems(items: string[], ordered: boolean, keyBase: string): React.ReactElement {
  const listClass =
    ordered
      ? 'my-1.5 list-decimal space-y-1 pl-5'
      : 'my-1.5 list-disc space-y-1 pl-5'
  if (!ordered) {
    return (
      <ul key={keyBase} className={listClass}>
        {items.map((item, i) => (
          <li key={`${keyBase}-${i}`} className="leading-relaxed">
            {renderListLine(item)}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ol key={keyBase} className={listClass}>
      {items.map((item, i) => (
        <li key={`${keyBase}-${i}`} className="leading-relaxed">
          {renderListLine(item)}
        </li>
      ))}
    </ol>
  )
}

export function renderMarkdownBlocks(text: string): Node[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Node[] = []
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[] = []
  let blockKey = 0
  let inCode = false
  let codeBuf: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const content = paragraph.join(' ')
    blocks.push(
      <p key={`p${blockKey}`} className="my-1.5 leading-relaxed text-slate-700">
        {renderInline(escapeHtml(content), `p${blockKey}`)}
      </p>,
    )
    blockKey++
    paragraph = []
  }

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      blocks.push(renderOlItems(listItems, listType === 'ol', `l${blockKey}`))
      blockKey++
      listItems = []
    }
    listType = null
  }

  for (const raw of lines) {
    const line = raw
    if (inCode) {
      if (line.trimStart().startsWith('```')) {
        blocks.push(
          <pre key={`code${blockKey}`} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            <code>{codeBuf.join('\n')}</code>
          </pre>,
        )
        blockKey++
        inCode = false
        codeBuf = []
      } else {
        codeBuf.push(line)
      }
      continue
    }

    if (line.trimStart().startsWith('```')) {
      flushParagraph()
      flushList()
      inCode = true
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1]!.length
      const text = escapeHtml(heading[2]!)
      const cls = level === 1 ? 'mt-3 mb-1 text-lg font-bold' : level === 2 ? 'mt-2 mb-1 text-base font-semibold' : 'mt-2 mb-1 text-sm font-semibold text-slate-800'
      blocks.push(
        <div key={`h${blockKey}`} className={cls}>
          {renderInline(text, `h${blockKey}`)}
        </div>,
      )
      blockKey++
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      flushParagraph()
      flushList()
      blocks.push(
        <blockquote key={`q${blockKey}`} className="my-1.5 border-l-4 border-slate-300 pl-3 italic text-slate-600">
          {renderInline(escapeHtml(quote[1] ?? ''), `q${blockKey}`)}
        </blockquote>,
      )
      blockKey++
      continue
    }

    const ul = /^\s*[-*]\s+(.*)$/.exec(line)
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
    if (ul || ol) {
      flushParagraph()
      const content = (ul ? ul[1] : ol![2]) ?? ''
      const type = ul ? 'ul' : 'ol'
      if (listType !== type) flushList()
      listType = type
      listItems.push(content)
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }

  flushParagraph()
  flushList()
  if (codeBuf.length > 0) {
    blocks.push(
      <pre key={`code${blockKey}`} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
        <code>{codeBuf.join('\n')}</code>
      </pre>,
    )
  }
  return blocks
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={className}>{renderMarkdownBlocks(text)}</div>
}

export function PlainToInterpolated(text: string): string {
  return escapeHtml(text)
}

export function isTitleOnly(text: string | null | undefined): boolean {
  if (!text) return true
  return text.replace(/\s/g, '').replace(/[#*_`>\[\]()-]/g, '') === ''
}
export function TextOnlyPreview(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}