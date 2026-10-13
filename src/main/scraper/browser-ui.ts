import type { Page } from 'puppeteer-core'

/**
 * Injects a floating overlay using only DOM APIs (no innerHTML).
 * Required because Google's pages enforce Trusted Types CSP which blocks innerHTML.
 */
export async function injectOverlay(
  page: Page,
  opts: {
    message: string
    buttons: { label: string; action: string; primary?: boolean }[]
    loading?: boolean
  }
): Promise<void> {
  await page.evaluate((o: typeof opts) => {
    // Remove existing overlay
    document.getElementById('__badger_overlay__')?.remove()

    // ── Helpers ──────────────────────────────────────────────────────────────
    const el = (tag: string, styles: Partial<CSSStyleDeclaration> = {}, attrs: Record<string, string> = {}) => {
      const e = document.createElement(tag)
      Object.assign(e.style, styles)
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
      return e
    }
    const txt = (content: string) => document.createTextNode(content)

    // ── Inject keyframes once ────────────────────────────────────────────────
    if (!document.getElementById('__badger_styles__')) {
      const style = document.createElement('style')
      style.id = '__badger_styles__'
      style.textContent = `
        @keyframes __badger_in__ { from { opacity:0; transform:translateY(20px) scale(.94) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes __badger_spin__ { to { transform:rotate(360deg) } }
        @keyframes __badger_pulse__ { 0%,100%{opacity:1} 50%{opacity:.2} }
        #__badger_overlay__ { animation:__badger_in__ .25s cubic-bezier(.34,1.56,.64,1) both }
        #__badger_overlay__ .__badger_spin__ { animation:__badger_spin__ .75s linear infinite }
        #__badger_overlay__ .__badger_dot__ { animation:__badger_pulse__ 1.4s ease-in-out infinite }
        #__badger_overlay__ button:hover { filter:brightness(1.12); transform:translateY(-1px) }
      `
      document.head.appendChild(style)
    }

    // ── Root ────────────────────────────────────────────────────────────────
    const root = el('div', {
      position: 'fixed', bottom: '24px', right: '24px',
      zIndex: '2147483647',
      background: 'rgba(13,20,36,0.97)',
      border: '1px solid rgba(0,255,166,0.4)',
      borderRadius: '14px',
      padding: '18px 20px',
      minWidth: '300px', maxWidth: '380px',
      fontFamily: '-apple-system,"Segoe UI",sans-serif',
      fontSize: '13px', color: '#e2e8f4',
      boxShadow: '0 12px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(0,255,166,.08)',
      backdropFilter: 'blur(16px)',
    }, { id: '__badger_overlay__' })

    // ── Header ───────────────────────────────────────────────────────────────
    const header = el('div', { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' })

    // Badge: rounded tile with "B"
    const badge = el('div', {
      width: '18px', height: '18px', borderRadius: '5px',
      background: '#0f172a', border: '1px solid rgba(0,255,166,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: '800', fontSize: '11px', color: '#00ffa6',
      fontFamily: '-apple-system,"Segoe UI",sans-serif', flexShrink: '0',
    })
    badge.appendChild(txt('B'))
    header.appendChild(badge)

    const titleSpan = el('span', { fontWeight: '700', fontSize: '12px', color: '#00ffa6', letterSpacing: '0.06em', textTransform: 'uppercase' })
    titleSpan.appendChild(txt('badger'))
    header.appendChild(titleSpan)

    if (o.loading) {
      const spinner = el('span', {
        display: 'inline-block', width: '11px', height: '11px',
        border: '2px solid rgba(0,255,166,0.25)', borderTopColor: '#00ffa6',
        borderRadius: '50%',
      })
      spinner.className = '__badger_spin__'
      header.appendChild(spinner)
    } else {
      const dot = el('span', {
        width: '7px', height: '7px', borderRadius: '50%',
        background: '#00ffa6', flexShrink: '0',
      })
      dot.className = '__badger_dot__'
      header.appendChild(dot)
    }
    root.appendChild(header)

    // ── Message (safe text only — no HTML parsing) ───────────────────────────
    // We support a tiny subset: <br>, <strong>, <em>, <code>, <small>, <a>
    // by building DOM nodes from a simple recursive parser
    const msgEl = el('div', {
      fontSize: '12.5px', color: '#94a3c0', lineHeight: '1.6', marginBottom: '16px',
    }, { id: '__badger_msg__' })

    function parseSimpleHTML(html: string, parent: HTMLElement) {
      // Tags we handle
      const tagRe = /<(\/?)(\w+)([^>]*)>/g
      let last = 0, m: RegExpExecArray | null
      const stack: HTMLElement[] = [parent]

      while ((m = tagRe.exec(html)) !== null) {
        // Text before this tag
        const before = html.slice(last, m.index)
        if (before) stack[stack.length - 1].appendChild(document.createTextNode(before))
        last = tagRe.lastIndex

        const [, closing, tag, attrs] = m
        const lcTag = tag.toLowerCase()

        if (closing) {
          if (stack.length > 1) stack.pop()
        } else {
          if (lcTag === 'br') {
            stack[stack.length - 1].appendChild(document.createElement('br'))
          } else if (['strong','b','em','i','code','small','span','a'].includes(lcTag)) {
            const node = document.createElement(lcTag) as HTMLElement
            // Parse href for <a>
            if (lcTag === 'a') {
              const hrefM = attrs.match(/href=["']([^"']+)["']/)
              if (hrefM) { (node as HTMLAnchorElement).href = hrefM[1]; node.style.color = '#00ffa6' }
            }
            // Parse style attr
            const styleM = attrs.match(/style=["']([^"']+)["']/)
            if (styleM) node.setAttribute('style', styleM[1])
            // Parse color shorthand
            const colorM = attrs.match(/color=["']([^"']+)["']/)
            if (colorM) (node as HTMLElement).style.color = colorM[1]

            if (lcTag === 'strong' || lcTag === 'b') node.style.fontWeight = '700'
            if (lcTag === 'code') { node.style.fontFamily = 'monospace'; node.style.fontSize = '11px' }
            if (lcTag === 'small') node.style.fontSize = '11px'

            stack[stack.length - 1].appendChild(node)
            stack.push(node)
          }
          // Self-closing
          if (lcTag === 'br') { /* already handled */ }
        }
      }
      // Remaining text
      const tail = html.slice(last)
      if (tail) stack[stack.length - 1].appendChild(document.createTextNode(tail))
    }

    parseSimpleHTML(o.message, msgEl)
    root.appendChild(msgEl)

    // ── Buttons ──────────────────────────────────────────────────────────────
    if (o.buttons.length > 0) {
      const btns = el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap' })
      for (const b of o.buttons) {
        const btn = el('button', {
          flex: '1', padding: '9px 14px', borderRadius: '8px',
          fontSize: '12px', fontWeight: b.primary ? '700' : '500',
          cursor: 'pointer', fontFamily: 'inherit', border: 'none',
          background: b.primary ? '#00ffa6' : 'rgba(255,255,255,0.08)',
          color: b.primary ? '#0f172a' : '#e2e8f4',
          outline: b.primary ? '2px solid rgba(0,255,166,.4)' : '1px solid rgba(255,255,255,.12)',
          outlineOffset: '-1px',
          transition: 'all .14s',
        })
        btn.setAttribute('data-action', b.action)
        btn.appendChild(document.createTextNode(b.label))
        btn.addEventListener('click', () => {
          ;(window as any).__badger_result__ = b.action
        })
        btns.appendChild(btn)
      }
      root.appendChild(btns)
    }

    document.body.appendChild(root)
  }, opts)
}

export async function removeOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('__badger_overlay__')?.remove()
  }).catch(() => {})
}

export async function updateOverlayMessage(page: Page, message: string): Promise<void> {
  // Re-inject with updated message rather than touching innerHTML
  await page.evaluate((msg: string) => {
    const el = document.getElementById('__badger_msg__')
    if (!el) return false
    // Clear existing children
    while (el.firstChild) el.removeChild(el.firstChild)
    el.appendChild(document.createTextNode(msg))
    return true
  }, message).catch(() => {})
}

export async function pollOverlayResult(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const r = (window as any).__badger_result__
    if (r !== undefined) delete (window as any).__badger_result__
    return r ?? null
  }).catch(() => null)
}
