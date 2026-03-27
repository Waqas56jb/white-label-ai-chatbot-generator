import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DEFAULT_LANDING_LOGO_CDN } from './brandMark.js'
import {
  SCRAPE_API,
  CONTEXT_API_BASE,
  CHAT_TEST_BASE,
  TRIAL_INQUIRY_API,
  CONTACT_DEMO_API,
  ADMIN_SETTINGS_API,
} from './api.js'

function chatDayLabel(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function chatTimeLabel(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function useReveal() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -32px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible])

  return [ref, visible]
}

function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const [ref, visible] = useReveal()
  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'reveal--visible' : ''} ${className}`.trim()}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </Tag>
  )
}

/** Remote images (Unsplash CDN). Replace with your own assets in production if you prefer. */
function unsplash(photoPath, w = 1200) {
  return `https://images.unsplash.com/${photoPath}?auto=format&fit=crop&w=${w}&q=82`
}

function LiveImage({ src, alt, className = '', sizes, loading = 'lazy', width, height }) {
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      sizes={sizes}
      width={width}
      height={height}
    />
  )
}

const STATS = [
  {
    value: 'After hours',
    label: 'Most homeowners look up plumbers, HVAC, and painters when your office is closed.',
  },
  {
    value: '24/7 answers',
    label: 'Your site can explain services and next steps while you are off the clock.',
  },
  {
    value: 'Morning leads',
    label: 'Wake up to questions, urgency, and contact details—already written down.',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Send your website',
    body: 'We pull what is already public: services, areas, hours, and FAQs—so the bot matches how you really work.',
    image: unsplash('photo-1460925895917-afdab827c52f', 640),
    imageAlt: 'Laptop showing website analytics on a desk',
  },
  {
    n: '02',
    title: 'Tune the bot',
    body: 'Pick tone and colors. Add must-know rules (emergency fees, brands you service, what you never promise).',
    image: unsplash('photo-1522071820081-009f0129c71c', 640),
    imageAlt: 'Team collaborating at a table',
  },
  {
    n: '03',
    title: 'Paste one embed',
    body: 'Bubble, inline, or full-page—one snippet on WordPress, Wix, Squarespace, or custom HTML.',
    image: unsplash('photo-1498050108023-c5249f4df085', 640),
    imageAlt: 'Laptop on desk with code on screen',
  },
  {
    n: '04',
    title: 'Edit anytime',
    body: 'Change offers, FAQs, or disclaimers. Read transcripts and leads so nothing important is lost.',
    image: unsplash('photo-1553877522-43269d4ea984', 640),
    imageAlt: 'People reviewing notes and laptop together',
  },
]

const FEATURES = [
  {
    title: 'Grounded answers',
    body: 'Replies follow your site and your rules—fewer wild guesses about price or coverage.',
    icon: '◇',
    image: unsplash('photo-1454165804606-c3d57bc86b40', 480),
    imageAlt: 'Notebook and coffee with planning notes',
  },
  {
    title: 'Night & weekend coverage',
    body: 'Visitors get help at 9 PM instead of a dead page—without putting your cell on the homepage.',
    icon: '◆',
    image: unsplash('photo-1512941937669-90a1b58e7e9c', 480),
    imageAlt: 'Person using a smartphone in dim light',
  },
  {
    title: 'Lead capture',
    body: 'Collect name, phone, email, and job type when someone is ready for a callback.',
    icon: '◎',
    image: unsplash('photo-1556761175-5973dc0f32e7', 480),
    imageAlt: 'Business handshake in office',
  },
  {
    title: 'Chat history',
    body: 'See every overnight conversation—great for morning dispatch and showing value to your team.',
    icon: '▣',
    image: unsplash('photo-1551288049-bebda4e38f71', 480),
    imageAlt: 'Charts and data on a screen',
  },
  {
    title: 'DIY or we do it',
    body: 'Edit yourself when you want—or hand changes to us. Same system either way.',
    icon: '◈',
    image: unsplash('photo-1600880292203-757bb62b4baf', 480),
    imageAlt: 'Two colleagues talking in office',
  },
  {
    title: 'White-label',
    body: 'Agencies can ship bots under their brand with one repeatable onboarding flow.',
    icon: '⬡',
    image: unsplash('photo-1542744173-8e7e53415bb0', 480),
    imageAlt: 'Team meeting in modern office',
  },
]

const INDUSTRIES = [
  {
    name: 'Plumbing',
    blurb: 'Leaks, water heaters, drains, and “is this an emergency?”—sorted by area and urgency.',
    tags: ['Emergency triage', 'Dispatch notes', 'Warranty FAQs'],
    image: unsplash('photo-1607472586893-edb57bdc0e39', 800),
    imageAlt: 'Plumber working on pipes under a sink',
  },
  {
    name: 'HVAC',
    blurb: 'No-cool calls, tune-ups, filters, and memberships—explained in plain language.',
    tags: ['Seasonal offers', 'Brands you service', 'Maintenance plans'],
    image: unsplash('photo-1581094794329-c8112a89af12', 800),
    imageAlt: 'Technician in industrial setting with equipment',
  },
  {
    name: 'Painting',
    blurb: 'Prep, sheen, timelines, and cabinet work—without endless back-and-forth email.',
    tags: ['Prep scope', 'Lead times', 'Cabinet jobs'],
    image: unsplash('photo-1589939705384-5185137a7f0f', 800),
    imageAlt: 'Painter with roller and blue wall',
  },
  {
    name: 'Roofing',
    blurb: 'Storm questions, materials, inspections, and when to send a human estimator.',
    tags: ['Storm season', 'Materials', 'Financing hints'],
    image: unsplash('photo-1600585154526-990dced4db0d', 800),
    imageAlt: 'Modern home exterior and roofline',
  },
  {
    name: 'Electrical',
    blurb: 'Panels, EV chargers, safety limits—know what needs a licensed pro on site.',
    tags: ['Safety first', 'Permits', 'After-hours'],
    image: unsplash('photo-1621905252507-b35492cc74b4', 800),
    imageAlt: 'Electrician working on wiring',
  },
  {
    name: 'Landscaping',
    blurb: 'Seasonal work, irrigation, and design consults—capture the job type before you call back.',
    tags: ['Seasons', 'Recurring visits', 'Estimates'],
    image: unsplash('photo-1558904541-efa843a96f01', 800),
    imageAlt: 'Landscaping and lawn care outdoors',
  },
]

const GALLERY_IMAGES = [
  { src: unsplash('photo-1503387762-592deb58ef4e', 600), alt: 'Construction site and building frame' },
  { src: unsplash('photo-1504148455328-c376907d081c', 600), alt: 'Electrician tools and hands working' },
  { src: unsplash('photo-1564013799919-ab600027ffc6', 600), alt: 'Modern suburban home exterior' },
  { src: unsplash('photo-1600585154340-be6161a56a0c', 600), alt: 'Bright living room interior' },
  { src: unsplash('photo-1600607687939-ce8a6c25118c', 600), alt: 'Kitchen interior in home' },
]

const TESTIMONIALS = [
  {
    quote:
      'Night browsers used to vanish. Now the bot explains our plans and grabs the address—we call them first thing.',
    name: 'Daniela Ruiz',
    role: 'Owner, Northline Heating & Cooling',
    locale: 'Suburban corridor, GA',
    metric: 'More callback-ready leads (demo pilot)',
    photo: unsplash('photo-1573496359142-b8d87734a5a2', 200),
  },
  {
    quote:
      'Same ten questions about slab leaks and heaters. The bot handles the repeat stuff; we handle the wrenches.',
    name: 'Marcus Webb',
    role: 'Lead Plumber, Webb Family Plumbing',
    locale: 'Metro fringe, NC',
    metric: 'Fewer vague voicemails',
    photo: unsplash('photo-1560250097-0b93528c311a', 200),
  },
  {
    quote:
      'Painting needs education—prep, dry time, sheen. The chat covers basics and leaves a clear note for the morning.',
    name: 'Priya Nair',
    role: 'Estimator, Brush & Beam Co.',
    locale: 'Mid-size city, TN',
    metric: 'Better-qualified inquiries',
    photo: unsplash('photo-1580489944761-15a19d654956', 200),
  },
]

const PLANS_BASE = [
  {
    name: 'Starter',
    price: '$299',
    period: 'setup + $79/mo',
    desc: 'Ideal for a single trade, one location, and a straightforward website.',
    bullets: ['Single bot & embed', 'Core FAQ tuning', 'Email support', 'Monthly transcript summary (sample)'],
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$499',
    period: 'setup + $129/mo',
    desc: 'For shops that refresh offers seasonally and want faster turnaround on edits.',
    bullets: ['Everything in Starter', 'Priority edit queue', 'Lead export (CSV)', 'Quarterly content refresh call'],
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '$799',
    period: 'setup + $199/mo',
    desc: 'Multi-crew operators, franchises, or agencies white-labeling for several brands.',
    bullets: ['Everything in Growth', 'Multiple intake paths', 'Advanced lead routing labels', 'Dedicated success check-ins'],
    highlighted: false,
  },
]

const FAQS = [
  {
    q: 'Do customers install an app?',
    a: 'No. It is a normal website chat—one embed snippet, like analytics or a booking widget.',
  },
  {
    q: 'What if my website is outdated?',
    a: 'The bot only knows what is public. We can add pinned FAQs and “source of truth” notes so policies stay correct.',
  },
  {
    q: 'How do I get overnight leads?',
    a: 'Usually email digest, spreadsheet row, or a simple dashboard—whatever matches your morning routine. Exact options depend on your plan.',
  },
  {
    q: 'Will it make up prices?',
    a: 'It should only quote what you allow (ranges or “starting at”). Otherwise it collects details and offers a callback.',
  },
  {
    q: 'Can I change look and tone?',
    a: 'Yes—colors, fonts, and voice presets so it feels like your trucks and website.',
  },
  {
    q: 'What if traffic grows?',
    a: 'We can adjust plans for higher volume when you outgrow starter traffic.',
  },
]

const NAV_SECTION_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

const LOCAL_SITE_MARK = `${import.meta.env.BASE_URL}favicon.svg`
/** Set `VITE_LANDING_LOGO_URL` to any image URL (matches index.html favicon / OG when set at build). Chatbot uses only scraped `theme.logoUrl`. */
const PREFERRED_LANDING_LOGO =
  String(import.meta.env.VITE_LANDING_LOGO_URL || '').trim() || DEFAULT_LANDING_LOGO_CDN

function LandingMark({ variant = 'nav' }) {
  const footer = variant === 'footer'
  const [src, setSrc] = useState(PREFERRED_LANDING_LOGO)
  const [nativeFallback, setNativeFallback] = useState(false)
  const imgErrorOnce = useRef(false)
  const onImgError = useCallback(() => {
    if (imgErrorOnce.current) return
    imgErrorOnce.current = true
    setNativeFallback(true)
    setSrc(LOCAL_SITE_MARK)
  }, [])

  return (
    <span
      className={[
        'nav__logo-badge',
        footer ? 'nav__logo-badge--footer' : '',
        nativeFallback ? 'nav__logo-badge--fallback' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        className="nav__logo-img"
        src={src}
        width={nativeFallback ? (footer ? 32 : 36) : footer ? 20 : 22}
        height={nativeFallback ? (footer ? 32 : 36) : footer ? 20 : 22}
        alt=""
        decoding="async"
        fetchPriority={footer ? 'low' : 'high'}
        loading={footer ? 'lazy' : undefined}
        referrerPolicy="no-referrer"
        onError={onImgError}
      />
    </span>
  )
}

/** Preset palettes (red / black / green / white only). */
const CHAT_THEME_PRESETS = [
  { id: 'server', label: 'Auto' },
  {
    id: 'brand',
    label: 'Brand',
    swatch: 'linear-gradient(135deg, #dc2626, #000000)',
    colors: {
      headerBg: '#dc2626',
      headerText: '#ffffff',
      accent: '#dc2626',
      accentSoft: '#fee2e2',
      surface: '#ffffff',
      surfaceBorder: 'rgba(0, 0, 0, 0.12)',
      userBubble: '#fee2e2',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.18)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
  {
    id: 'noir',
    label: 'Noir',
    swatch: 'linear-gradient(135deg, #000000, #dc2626)',
    colors: {
      headerBg: '#000000',
      headerText: '#ffffff',
      accent: '#dc2626',
      accentSoft: '#fee2e2',
      surface: '#ffffff',
      surfaceBorder: 'rgba(0, 0, 0, 0.14)',
      userBubble: '#fee2e2',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.2)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
  {
    id: 'crimson',
    label: 'Crimson',
    swatch: 'linear-gradient(135deg, #991b1b, #000000)',
    colors: {
      headerBg: '#991b1b',
      headerText: '#ffffff',
      accent: '#dc2626',
      accentSoft: '#fee2e2',
      surface: '#ffffff',
      surfaceBorder: 'rgba(220, 38, 38, 0.22)',
      userBubble: '#fee2e2',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(220, 38, 38, 0.28)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
]

function resolvePersonalChatColors(themeColors, presetId) {
  const base = themeColors && typeof themeColors === 'object' ? themeColors : {}
  if (presetId === 'server') return base
  const preset = CHAT_THEME_PRESETS.find((p) => p.id === presetId)
  return preset?.colors || base
}

const PERSONAL_CHAT_COLOR_DEFAULTS = {
  headerBg: '#171717',
  headerText: '#ffffff',
  accent: '#dc2626',
  accentSoft: '#fee2e2',
  surface: '#ffffff',
  surfaceBorder: 'rgba(0, 0, 0, 0.14)',
  userBubble: '#fee2e2',
  botBubble: '#ffffff',
  text: '#000000',
  textMuted: 'rgba(0, 0, 0, 0.58)',
  inputBorder: 'rgba(0, 0, 0, 0.22)',
  sendBg: '#dc2626',
  sendText: '#ffffff',
}

const CHAT_DOCK_COLOR_STORAGE_KEY = 'sitemind_chat_dock_color_preset'
const CHAT_DOCK_TONE_STORAGE_KEY = 'sitemind_chat_dock_tone'
const CHAT_DOCK_DEFAULT_TONE_ID = 'professional'

/** Seven red / black / white dock themes (merged over the server chatbot palette). */
const CHAT_DOCK_COLOR_PRESETS = [
  {
    id: 'ember',
    label: 'Ember',
    swatch: 'linear-gradient(135deg,#dc2626,#1a0505)',
    colors: {
      headerBg: '#dc2626',
      headerText: '#ffffff',
      accent: '#dc2626',
      accentSoft: '#fee2e2',
      surface: '#ffffff',
      surfaceBorder: 'rgba(0, 0, 0, 0.12)',
      userBubble: '#fee2e2',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.18)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
  {
    id: 'noir',
    label: 'Noir',
    swatch: 'linear-gradient(135deg,#000000,#dc2626)',
    colors: {
      headerBg: '#000000',
      headerText: '#ffffff',
      accent: '#dc2626',
      accentSoft: '#fecaca',
      surface: '#fafafa',
      surfaceBorder: 'rgba(0, 0, 0, 0.12)',
      userBubble: '#e5e5e5',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.2)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    swatch: 'linear-gradient(135deg,#ffffff,#fca5a5)',
    colors: {
      headerBg: '#ffffff',
      headerText: '#000000',
      accent: '#dc2626',
      accentSoft: '#fee2e2',
      surface: '#fafafa',
      surfaceBorder: 'rgba(0, 0, 0, 0.12)',
      userBubble: '#fee2e2',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.18)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
  {
    id: 'wine',
    label: 'Wine',
    swatch: 'linear-gradient(135deg,#7f1d1d,#000000)',
    colors: {
      headerBg: '#7f1d1d',
      headerText: '#ffffff',
      accent: '#fecaca',
      accentSoft: '#fee2e2',
      surface: '#ffffff',
      surfaceBorder: 'rgba(127, 29, 29, 0.25)',
      userBubble: '#fee2e2',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.2)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    swatch: 'linear-gradient(135deg,#171717,#525252)',
    colors: {
      headerBg: '#171717',
      headerText: '#ffffff',
      accent: '#dc2626',
      accentSoft: '#fee2e2',
      surface: '#ffffff',
      surfaceBorder: 'rgba(0, 0, 0, 0.14)',
      userBubble: '#f5f5f5',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.22)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
  {
    id: 'crimson',
    label: 'Crimson',
    swatch: 'linear-gradient(135deg,#991b1b,#450a0a)',
    colors: {
      headerBg: '#991b1b',
      headerText: '#ffffff',
      accent: '#fecaca',
      accentSoft: '#fee2e2',
      surface: '#ffffff',
      surfaceBorder: 'rgba(153, 27, 27, 0.22)',
      userBubble: '#fee2e2',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.2)',
      sendBg: '#dc2626',
      sendText: '#ffffff',
    },
  },
  {
    id: 'frost',
    label: 'Frost',
    swatch: 'linear-gradient(135deg,#f5f5f5,#000000)',
    colors: {
      headerBg: '#f5f5f5',
      headerText: '#000000',
      accent: '#dc2626',
      accentSoft: '#fee2e2',
      surface: '#fafafa',
      surfaceBorder: 'rgba(0, 0, 0, 0.1)',
      userBubble: '#fee2e2',
      botBubble: '#ffffff',
      text: '#000000',
      textMuted: 'rgba(0, 0, 0, 0.58)',
      inputBorder: 'rgba(0, 0, 0, 0.16)',
      sendBg: '#000000',
      sendText: '#ffffff',
    },
  },
]

const CHAT_DOCK_TONE_OPTIONS = [
  { id: 'friendly', label: 'Friendly', hint: 'Warm & approachable' },
  { id: 'witty', label: 'Witty', hint: 'Clever, never snarky' },
  { id: 'concise', label: 'Concise', hint: 'Short & direct' },
  { id: 'professional', label: 'Professional', hint: 'Clear business voice' },
  { id: 'casual', label: 'Casual', hint: 'Relaxed conversation' },
  { id: 'expert', label: 'Expert', hint: 'Confident & precise' },
  { id: 'empathetic', label: 'Empathetic', hint: 'Supportive & gentle' },
]

function readDockColorPresetId() {
  try {
    const v = localStorage.getItem(CHAT_DOCK_COLOR_STORAGE_KEY)
    if (!v) return ''
    if (v === 'auto') return ''
    return CHAT_DOCK_COLOR_PRESETS.some((p) => p.id === v) ? v : ''
  } catch {
    return ''
  }
}

function readDockToneId() {
  try {
    const v = localStorage.getItem(CHAT_DOCK_TONE_STORAGE_KEY)
    if (v && CHAT_DOCK_TONE_OPTIONS.some((t) => t.id === v)) return v
  } catch {
    /* ignore */
  }
  return CHAT_DOCK_DEFAULT_TONE_ID
}

function chatHeaderIsLight(headerBg) {
  const s = String(headerBg || '').trim()
  if (!s.startsWith('#')) return false
  const hex =
    s.length === 4
      ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
      : s.length === 7
        ? s
        : ''
  if (!hex) return false
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return L > 0.62
}

/** Ensures every palette key is set so CSS vars and inline styles never fall back to the wrong theme. */
function withFullPersonalChatColors(col) {
  const c = col && typeof col === 'object' ? col : {}
  return { ...PERSONAL_CHAT_COLOR_DEFAULTS, ...c }
}

/** CSS variables on the modal root so all descendants inherit (avoids .chat-personal defaults fighting presets). */
function personalChatThemeStyle(c) {
  const x = withFullPersonalChatColors(c)
  return {
    background: x.surface,
    color: x.text,
    '--cp-surface': x.surface,
    '--cp-text': x.text,
    '--cp-text-muted': x.textMuted,
    '--cp-border': x.surfaceBorder,
    '--cp-accent': x.accent,
    '--cp-accent-soft': x.accentSoft,
    '--cp-header-bg': x.headerBg,
    '--cp-header-text': x.headerText,
    '--cp-user-bubble': x.userBubble,
    '--cp-bot-bubble': x.botBubble,
    '--cp-input-border': x.inputBorder,
    '--cp-send-bg': x.sendBg,
    '--cp-send-text': x.sendText,
  }
}

/** Fix escaped Markdown some models emit; normalize newlines; turn • lines into Markdown lists. */
function normalizeAssistantMarkdownSource(text) {
  if (text == null || typeof text !== 'string') return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\\([*_#`])/g, '$1')
    .replace(/^([ \t]*)•[ \t]+/gm, '$1- ')
    .replace(/^([ \t]*)▪[ \t]+/gm, '$1- ')
}

function ChatAssistantMarkdown({ text }) {
  const src = normalizeAssistantMarkdownSource(text)
  return (
    <div className="chat-personal__md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href || '#'} target="_blank" rel="noopener noreferrer" {...rest}>
              {children}
            </a>
          ),
        }}
      >
        {src}
      </ReactMarkdown>
    </div>
  )
}

function ChatBrandAvatar({ logoUrl, chatbotName, variant = 'light' }) {
  const [failed, setFailed] = useState(false)
  const initial = (chatbotName || '?').trim().slice(0, 1).toUpperCase() || '?'
  const wrapClass = [
    'chat-personal__brand-logo-wrap',
    variant === 'onDark' ? 'chat-personal__brand-logo-wrap--on-dark' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const logoAlt = chatbotName && String(chatbotName).trim() ? `${String(chatbotName).trim()} logo` : 'Business logo'
  if (logoUrl && typeof logoUrl === 'string' && logoUrl.trim() && !failed) {
    return (
      <span className={wrapClass}>
        <img
          src={logoUrl.trim()}
          alt={logoAlt}
          className="chat-personal__brand-logo"
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }
  return (
    <span
      className={`${wrapClass} chat-personal__brand-logo-wrap--fallback${variant === 'onDark' ? ' chat-personal__brand-logo-wrap--fallback-on-dark' : ''}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

function publicErrorMessage(raw, fallback = 'Something went wrong. Please try again.') {
  if (raw == null || typeof raw !== 'string') return fallback
  const m = raw.trim()
  if (
    m.length > 160 ||
    /chrome|selenium|driver|openai|chromedriver|api_key|stack|localhost|127\.0\.0\.1|http\s*5\d\d|json\.?parse|encrypt|decrypt|bundle|server/i.test(
      m,
    )
  ) {
    return fallback
  }
  return m
}

function DemoChatbotModal({ open, onClose, onAutoSessionReady }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    website: '',
  })
  const [errors, setErrors] = useState({})
  const [phase, setPhase] = useState('form')
  const [scrapeError, setScrapeError] = useState('')
  const [scrapeText, setScrapeText] = useState('')
  const [structuredJson, setStructuredJson] = useState('')
  const [structuredMeta, setStructuredMeta] = useState(null)
  const [pageTitle, setPageTitle] = useState('')
  const [scrapedUrl, setScrapedUrl] = useState('')
  const [crawlMeta, setCrawlMeta] = useState(null)
  const [chatbotId, setChatbotId] = useState('')
  const [extraKnowledge, setExtraKnowledge] = useState('')
  const [confidentialPrompts, setConfidentialPrompts] = useState('')
  const [editingScrape, setEditingScrape] = useState(false)
  const [secureSubmitting, setSecureSubmitting] = useState(false)
  const [secureError, setSecureError] = useState('')
  const [securedExport, setSecuredExport] = useState(null)
  const [secureSaved, setSecureSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && phase !== 'loading' && !secureSubmitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, phase, secureSubmitting])

  useEffect(() => {
    if (!open) {
      setForm({ name: '', email: '', phone: '', website: '' })
      setErrors({})
      setPhase('form')
      setScrapeError('')
      setScrapeText('')
      setStructuredJson('')
      setStructuredMeta(null)
      setPageTitle('')
      setScrapedUrl('')
      setCrawlMeta(null)
      setChatbotId('')
      setExtraKnowledge('')
      setConfidentialPrompts('')
      setEditingScrape(false)
      setSecureSubmitting(false)
      setSecureError('')
      setSecuredExport(null)
      setSecureSaved(false)
    }
  }, [open])

  useEffect(() => {
    if (phase !== 'result' || !open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${CONTEXT_API_BASE}/new-id`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled && data.ok && data.chatbotId) setChatbotId(String(data.chatbotId))
        else if (!cancelled)
          setChatbotId(String(Math.floor(Math.random() * 90_000_000) + 10_000_000))
      } catch {
        if (!cancelled)
          setChatbotId(String(Math.floor(Math.random() * 90_000_000) + 10_000_000))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [phase, open])

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Please enter your name'
    if (!form.email.trim()) e.email = 'Please enter your email'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email'
    if (!form.phone.trim()) e.phone = 'Please enter your phone number'
    if (!form.website.trim()) e.website = 'Please enter your business website'
    else {
      const w = form.website.trim()
      const ok = /^https?:\/\/.+/i.test(w) || /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(w)
      if (!ok) e.website = 'Enter a valid URL (e.g. https://yoursite.com)'
    }
    return e
  }

  const handleSubmit = async (ev) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return

    const website = form.website.trim().startsWith('http')
      ? form.website.trim()
      : `https://${form.website.trim()}`

    setScrapeError('')
    setPhase('loading')

    try {
      const res = await fetch(SCRAPE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          website,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        const apiErr = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : ''
        throw new Error(apiErr || '__SCRAPE_GENERIC__')
      }
      setScrapeText(data.text || '')
      setPageTitle(data.title || '')
      setScrapedUrl(data.url || website)
      setStructuredMeta(data.meta?.structured || null)
      setCrawlMeta(data.meta?.crawl || null)
      setChatbotId('')
      setExtraKnowledge('')
      setConfidentialPrompts('')
      setEditingScrape(false)
      setSecureError('')
      setSecuredExport(null)
      setSecureSaved(false)
      if (data.structuredContext && typeof data.structuredContext === 'object') {
        setStructuredJson(JSON.stringify(data.structuredContext, null, 2))
      } else {
        setStructuredJson('')
      }
      setPhase('result')
      console.info('[Demo chatbot] scrape ok', {
        url: data.url,
        chars: data.text?.length,
        structured: !!data.structuredContext,
      })
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      const fallback = 'We couldn’t read that website. Check the link and try again.'
      setScrapeError(m === '__SCRAPE_GENERIC__' ? fallback : publicErrorMessage(m, fallback))
      setPhase('error')
    }
  }

  const fetchNewChatbotId = async () => {
    if (secureSaved) return
    setSecureError('')
    try {
      const res = await fetch(`${CONTEXT_API_BASE}/new-id`)
      const data = await res.json().catch(() => ({}))
      if (data.ok && data.chatbotId) setChatbotId(String(data.chatbotId))
    } catch {
      setSecureError('Could not allocate a new ID. Try again.')
    }
  }

  const downloadJsonFile = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleDownloadPlainDraft = () => {
    setSecureError('')
    let structuredContext = null
    if (structuredJson.trim()) {
      try {
        structuredContext = JSON.parse(structuredJson)
      } catch {
        structuredContext = { _error: 'Summary tab needs a quick fix before this export is reliable.' }
      }
    }
    downloadJsonFile(
      {
        format: 'plain-draft-v1',
        chatbotContextId: chatbotId || null,
        websiteUrl: scrapedUrl,
        pageTitle,
        scrapedText: scrapeText,
        structuredContext,
        confidentialPrompts,
        owner: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        },
        warning:
          'Plain copy — anyone with this file can read it. Save below to lock your chatbot with a password.',
      },
      `chatbot-context-${chatbotId || 'draft'}-plain.json`,
    )
  }

  const handleDownloadSecuredBackup = () => {
    if (!securedExport) return
    downloadJsonFile(securedExport, `chatbot-context-${chatbotId}-secured.json`)
  }

  const handleSecureSubmit = async () => {
    setSecureError('')
    if (!chatbotId || !/^\d{8}$/.test(chatbotId)) {
      setSecureError('Almost ready — wait a moment or tap New ID.')
      return
    }
    let structuredContext = null
    if (structuredJson.trim()) {
      try {
        structuredContext = JSON.parse(structuredJson)
      } catch {
        setSecureError('Something in the Summary tab doesn’t look right. Take another look and try again.')
        return
      }
    }
    const mergedKnowledge = [String(scrapeText || '').trim(), String(extraKnowledge || '').trim()]
      .filter(Boolean)
      .join('\n\n=== ADDITIONAL KNOWLEDGE BASE (USER-ADDED) ===\n\n')
    setSecureSubmitting(true)
    try {
      const res = await fetch(`${CONTEXT_API_BASE}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatbotId,
          payload: {
            websiteUrl: scrapedUrl,
            pageTitle,
            scrapedText: mergedKnowledge,
            structuredContext,
            confidentialPrompts,
            owner: {
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone.trim(),
            },
            crawl: crawlMeta,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        const apiErr = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : ''
        throw new Error(apiErr || '__SAVE_GENERIC__')
      }
      setSecuredExport(data.securedExport)
      setSecureSaved(true)
      setEditingScrape(false)
      if (onAutoSessionReady && data?.widgetBootstrap?.chatbotId && data?.widgetBootstrap?.integrationSecret) {
        await onAutoSessionReady(data.widgetBootstrap)
        onClose()
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      const fallback = 'We couldn’t save that. Try again in a moment.'
      setSecureError(m === '__SAVE_GENERIC__' ? fallback : publicErrorMessage(m, fallback))
    } finally {
      setSecureSubmitting(false)
    }
  }

  if (!open) return null

  const panelClass =
    phase === 'result'
      ? 'demo-modal__panel demo-modal__panel--wide'
      : 'demo-modal__panel'

  return (
    <div className="demo-modal" role="dialog" aria-modal="true" aria-labelledby="demo-modal-title">
      <button
        type="button"
        className="demo-modal__backdrop"
        aria-label="Close dialog"
        onClick={() => phase !== 'loading' && !secureSubmitting && onClose()}
      />
      <div className={panelClass}>
        <div className="demo-modal__head">
          <div className="demo-modal__head-text">
            <p className="demo-modal__eyebrow">Free demo</p>
            <h2 id="demo-modal-title" className="demo-modal__title">
              Create your demo chatbot
            </h2>
            <p className="demo-modal__sub">We read your public site and turn it into a chatbot you can try right away.</p>
          </div>
          <button
            type="button"
            className="demo-modal__close"
            onClick={onClose}
            aria-label="Close"
            disabled={phase === 'loading' || secureSubmitting}
          >
            ×
          </button>
        </div>

        {phase === 'loading' && (
          <div className="demo-modal__loading">
            <div className="demo-modal__spinner" aria-hidden />
            <p className="demo-modal__loading-title">Reading your website…</p>
            <p className="demo-modal__loading-text">This usually takes a minute. Sit tight.</p>
            <p className="demo-modal__loading-url">{form.website.trim()}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="demo-modal__error-wrap">
            <p className="demo-modal__error-title">That didn’t work</p>
            <p className="demo-modal__error-msg">{scrapeError}</p>
            <button type="button" className="btn btn--primary btn--block" onClick={() => setPhase('form')}>
              Try again
            </button>
          </div>
        )}

        {phase === 'result' && (
          <div className="demo-modal__result">
            <div className="demo-modal__result-head">
              <div className="demo-modal__success-icon demo-modal__success-icon--sm" aria-hidden>
                ✓
              </div>
              <div>
                <h3 className="demo-modal__result-title">You’re all set</h3>
                <p className="demo-modal__result-meta">
                  <strong>{pageTitle || 'Your site'}</strong>
                  <span className="demo-modal__result-sep">·</span>
                  <span>{scrapedUrl}</span>
                  {typeof crawlMeta?.pagesVisited === 'number' && crawlMeta.pagesVisited > 0 ? (
                    <>
                      <span className="demo-modal__result-sep">·</span>
                      <span>
                        {crawlMeta.pagesVisited} page{crawlMeta.pagesVisited === 1 ? '' : 's'} read
                      </span>
                    </>
                  ) : null}
                  {structuredJson ? (
                    <>
                      <span className="demo-modal__result-sep">·</span>
                      <span>Smart summary ready</span>
                    </>
                  ) : structuredMeta?.attempted && structuredMeta?.error ? (
                    <>
                      <span className="demo-modal__result-sep">·</span>
                      <span className="demo-modal__result-warn">Summary unavailable — website text below</span>
                    </>
                  ) : !structuredMeta?.attempted ? (
                    <>
                      <span className="demo-modal__result-sep">·</span>
                      <span className="demo-modal__result-warn">Text-only mode</span>
                    </>
                  ) : null}
                </p>
                <p className="demo-modal__result-contact">
                  {form.name.trim()} · {form.email.trim()} · {form.phone.trim()}
                </p>
              </div>
            </div>
            {structuredMeta?.attempted && structuredMeta?.error && (
              <p className="demo-modal__structure-err" role="alert">
                We couldn’t build the short summary. Your website text is still here — you can edit it below.
              </p>
            )}

            <div className="demo-modal__toolbar">
              <button
                type="button"
                className="btn btn--outline demo-modal__toolbar-btn"
                onClick={() => {
                  setSecureError('')
                  setEditingScrape((v) => !v)
                }}
                disabled={secureSaved || secureSubmitting}
              >
                {editingScrape ? 'Stop editing' : 'Edit'}
              </button>
              <button
                type="button"
                className="btn btn--outline demo-modal__toolbar-btn"
                onClick={handleDownloadPlainDraft}
                disabled={secureSubmitting}
              >
                Download copy
              </button>
            </div>

            <label className="demo-modal__output-label" htmlFor="scrape-output">
              Extracted website text (editable)
            </label>
            <textarea
              id="scrape-output"
              className="demo-modal__output"
              readOnly={!editingScrape || secureSaved}
              rows={20}
              value={scrapeText}
              spellCheck={false}
              onChange={(e) => {
                if (!editingScrape || secureSaved) return
                setScrapeText(e.target.value)
              }}
            />
            <div className="demo-field" style={{ marginTop: '10px' }}>
              <label className="demo-field__label" htmlFor="extra-knowledge">
                Additional knowledge base text (optional)
              </label>
              <textarea
                id="extra-knowledge"
                className="demo-modal__prompts"
                rows={4}
                placeholder="Add FAQs, policy details, pricing notes, custom facts..."
                value={extraKnowledge}
                onChange={(e) => setExtraKnowledge(e.target.value)}
                disabled={secureSaved || secureSubmitting}
                spellCheck
              />
            </div>

            <div className="demo-modal__secure-card">
              <h4 className="demo-modal__secure-title">Save your chatbot</h4>
              <p className="demo-modal__secure-lead">
                No password needed. After save, your chatbot preview auto-opens in the bottom-right.
              </p>

              {secureSaved && (
                <p className="demo-modal__secure-success" role="status">
                  Saved. Your chatbot preview is ready in the bottom-right.
                </p>
              )}
              {secureSaved && securedExport?.trialEndsAt ? (
                <p className="demo-modal__trial-note" role="status">
                  Free trial until{' '}
                  {new Date(securedExport.trialEndsAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  . Chat starts automatically after save.
                </p>
              ) : null}

              <div className="demo-modal__id-row">
                <label className="demo-field__label" htmlFor="chatbot-context-id">
                  Your ID
                </label>
                <div className="demo-modal__id-controls">
                  <input
                    id="chatbot-context-id"
                    className="demo-modal__id-input"
                    readOnly
                    value={chatbotId || '…'}
                    aria-label="Your chatbot ID"
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={fetchNewChatbotId}
                    disabled={secureSaved || secureSubmitting}
                  >
                    New ID
                  </button>
                </div>
              </div>


              <div className="demo-field">
                <label className="demo-field__label sr-only" htmlFor="confidential-prompts">
                  Optional notes
                </label>
                <textarea
                  id="confidential-prompts"
                  className="demo-modal__prompts"
                  rows={3}
                  placeholder="Optional: tone, specials, or rules for your bot…"
                  value={confidentialPrompts}
                  onChange={(e) => setConfidentialPrompts(e.target.value)}
                  disabled={secureSaved || secureSubmitting}
                  spellCheck
                  aria-label="Optional notes for your chatbot"
                />
              </div>

              {secureError ? (
                <p className="demo-modal__secure-err" role="alert">
                  {secureError}
                </p>
              ) : null}

              <div className="demo-modal__secure-actions">
                <button
                  type="button"
                  className="btn btn--primary demo-modal__secure-submit"
                  onClick={handleSecureSubmit}
                  disabled={secureSaved || secureSubmitting}
                >
                  {secureSubmitting ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn btn--outline demo-modal__secure-submit"
                  onClick={handleDownloadSecuredBackup}
                  disabled={!securedExport || secureSubmitting}
                >
                  Download backup
                </button>
              </div>
            </div>

            <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {phase === 'form' && (
          <form className="demo-modal__form" onSubmit={handleSubmit} noValidate>
            <p className="demo-modal__owner-hint">
              Your name, email, and phone are the <strong>website owner</strong> contact we store with this chatbot. If a
              visitor asks who runs the business or how to reach the owner, the assistant will share these details
              professionally.
            </p>
            <div className="demo-field">
              <label className="demo-field__label" htmlFor="demo-name">
                Name
              </label>
              <input
                id="demo-name"
                className={`demo-field__input ${errors.name ? 'demo-field__input--error' : ''}`}
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Jordan Ellis"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
              />
              {errors.name && <p className="demo-field__error">{errors.name}</p>}
            </div>

            <div className="demo-modal__form-row">
              <div className="demo-field">
                <label className="demo-field__label" htmlFor="demo-email">
                  Email
                </label>
                <input
                  id="demo-email"
                  className={`demo-field__input ${errors.email ? 'demo-field__input--error' : ''}`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@yourbusiness.com"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
                {errors.email && <p className="demo-field__error">{errors.email}</p>}
              </div>
              <div className="demo-field">
                <label className="demo-field__label" htmlFor="demo-phone">
                  Phone
                </label>
                <input
                  id="demo-phone"
                  className={`demo-field__input ${errors.phone ? 'demo-field__input--error' : ''}`}
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="(555) 000-0000"
                  value={form.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                />
                {errors.phone && <p className="demo-field__error">{errors.phone}</p>}
              </div>
            </div>

            <div className="demo-field">
              <label className="demo-field__label" htmlFor="demo-website">
                Business website URL
              </label>
              <input
                id="demo-website"
                className={`demo-field__input ${errors.website ? 'demo-field__input--error' : ''}`}
                name="website"
                type="text"
                inputMode="url"
                autoComplete="url"
                placeholder="https://yoursite.com"
                value={form.website}
                onChange={(e) => setField('website', e.target.value)}
              />
              {errors.website && <p className="demo-field__error">{errors.website}</p>}
            </div>

            <button type="submit" className="btn btn--primary btn--lg btn--block demo-modal__submit">
              Build my chatbot
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

/**
 * Bottom-right floating preview: animated launcher + expandable panel (trial expiry in header).
 */
function TestChatFloatingDock({ session, panelOpen, onPanelOpenChange, onEndSession }) {
  const [sessionId, setSessionId] = useState('')
  const [theme, setTheme] = useState(null)
  const [allHistory, setAllHistory] = useState([])
  const [threadId, setThreadId] = useState('')
  const [dockView, setDockView] = useState('chat')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [chatErr, setChatErr] = useState('')
  const [trialEndsAtIso, setTrialEndsAtIso] = useState('')
  const [trialExpiredAtOpen, setTrialExpiredAtOpen] = useState(false)
  const [trialRanOut, setTrialRanOut] = useState(false)
  const [companyContact, setCompanyContact] = useState(null)
  const [chatbotId, setChatbotId] = useState('')
  const [, setTick] = useState(0)
  const skewRef = useRef(0)
  const listRef = useRef(null)

  const [iqName, setIqName] = useState('')
  const [iqEmail, setIqEmail] = useState('')
  const [iqPhone, setIqPhone] = useState('')
  const [iqMessage, setIqMessage] = useState('')
  const [iqSubmitting, setIqSubmitting] = useState(false)
  const [iqDone, setIqDone] = useState(false)
  const [iqErr, setIqErr] = useState('')
  const [colorPresetId, setColorPresetId] = useState(() => readDockColorPresetId())
  const [toneId, setToneId] = useState(() => readDockToneId())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const trialEnded = trialExpiredAtOpen || trialRanOut

  const chatMessages = useMemo(() => {
    const tid = threadId
    return allHistory
      .filter((m) => m.threadId === tid)
      .slice()
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  }, [allHistory, threadId])

  const historyMessages = useMemo(() => {
    return allHistory.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  }, [allHistory])

  const listToShow = useMemo(
    () => (dockView === 'history' ? historyMessages : chatMessages),
    [dockView, historyMessages, chatMessages],
  )

  useEffect(() => {
    if (!session) {
      setSessionId('')
      setTheme(null)
      setAllHistory([])
      setThreadId('')
      setDockView('chat')
      setDraft('')
      setSending(false)
      setChatErr('')
      setTrialEndsAtIso('')
      setTrialExpiredAtOpen(false)
      setTrialRanOut(false)
      setCompanyContact(null)
      setChatbotId('')
      setTick(0)
      skewRef.current = 0
      setIqName('')
      setIqEmail('')
      setIqPhone('')
      setIqMessage('')
      setIqSubmitting(false)
      setIqDone(false)
      setIqErr('')
      return
    }
    skewRef.current = session.serverTime ? Date.parse(session.serverTime) - Date.now() : 0
    setSessionId(session.sessionId)
    setTheme(session.theme)
    setTrialEndsAtIso(session.trialEndsAt || '')
    setTrialExpiredAtOpen(!!session.trialExpired)
    setTrialRanOut(false)
    setCompanyContact(session.companyContact || null)
    setChatbotId(session.chatbotId || '')
    setThreadId(session.threadId || '')
    setAllHistory(Array.isArray(session.chatHistory) ? session.chatHistory : [])
    setDockView('chat')
    setDraft('')
    setChatErr('')
    setIqDone(false)
    setIqErr('')
    setTick(0)
  }, [session])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [listToShow, sending, trialEnded, panelOpen, dockView])

  useEffect(() => {
    if (!panelOpen || dockView !== 'history' || !sessionId || trialEnded) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${CHAT_TEST_BASE}/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && data.ok && Array.isArray(data.messages)) {
          setAllHistory(data.messages)
          if (typeof data.threadId === 'string' && data.threadId) setThreadId(data.threadId)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [panelOpen, dockView, sessionId, trialEnded])

  useEffect(() => {
    if (!session || trialEnded || !trialEndsAtIso) return
    const id = setInterval(() => {
      setTick((t) => t + 1)
      const end = Date.parse(trialEndsAtIso)
      if (!Number.isNaN(end) && end - Date.now() - skewRef.current <= 0) setTrialRanOut(true)
    }, 1000)
    return () => clearInterval(id)
  }, [session, trialEndsAtIso, trialEnded])

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !sending && !iqSubmitting) {
        if (settingsOpen) setSettingsOpen(false)
        else onPanelOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, onPanelOpenChange, sending, iqSubmitting, settingsOpen])

  useEffect(() => {
    if (!panelOpen) setSettingsOpen(false)
  }, [panelOpen])

  useEffect(() => {
    if (!settingsOpen || !panelOpen) return
    const close = (e) => {
      const t = e.target
      if (t instanceof Node && t.closest?.('.chat-widget-dock__settings')) return
      if (t instanceof Node && t.closest?.('.chat-widget-dock__settings-trigger')) return
      setSettingsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [settingsOpen, panelOpen])

  const handleSend = async (ev) => {
    ev.preventDefault()
    const text = draft.trim()
    if (!text || sending || !sessionId || trialEnded) return
    setChatErr('')
    setDraft('')
    const optimisticThreadId = threadId || `session-${sessionId}`
    const tempId = `temp-${Date.now()}`
    const nowIso = new Date().toISOString()
    setAllHistory((prev) => [
      ...prev,
      { id: tempId, threadId: optimisticThreadId, role: 'user', content: text, createdAt: nowIso },
    ])
    setSending(true)
    try {
      const res = await fetch(`${CHAT_TEST_BASE}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text, tone: toneId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403 && data.trialExpired) {
        setTrialRanOut(true)
        setAllHistory((prev) => prev.filter((m) => m.id !== tempId))
        setDraft(text)
        return
      }
      if (!res.ok || !data.ok) {
        const apiErr = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : ''
        throw new Error(apiErr || '__CHAT_GENERIC__')
      }
      const tid = typeof data.threadId === 'string' && data.threadId ? data.threadId : optimisticThreadId
      if (tid !== threadId) setThreadId(tid)
      const reply = typeof data.reply === 'string' ? data.reply : ''
      if (data.saved && data.saved.user && data.saved.assistant) {
        setAllHistory((prev) => {
          const rest = prev.filter((m) => m.id !== tempId)
          return [
            ...rest,
            {
              id: String(data.saved.user.id),
              threadId: tid,
              role: 'user',
              content: text,
              createdAt: data.saved.user.createdAt,
            },
            {
              id: String(data.saved.assistant.id),
              threadId: tid,
              role: 'assistant',
              content: reply,
              createdAt: data.saved.assistant.createdAt,
            },
          ]
        })
      } else {
        setAllHistory((prev) => {
          const rest = prev.filter((m) => m.id !== tempId)
          const t = new Date().toISOString()
          return [
            ...rest,
            { id: `local-u-${tempId}`, threadId: tid, role: 'user', content: text, createdAt: nowIso },
            { id: `local-a-${tempId}`, threadId: tid, role: 'assistant', content: reply, createdAt: t },
          ]
        })
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      const fallback = 'Message didn’t go through. Try again.'
      setChatErr(m === '__CHAT_GENERIC__' ? fallback : publicErrorMessage(m, fallback))
      setAllHistory((prev) => prev.filter((x) => x.id !== tempId))
      setDraft(text)
    } finally {
      setSending(false)
    }
  }

  const handleClearChat = async () => {
    if (!sessionId || trialEnded) return
    if (
      !window.confirm(
        'Start a fresh conversation in this window? Saved messages stay under “Full history” and download.',
      )
    ) {
      return
    }
    try {
      const res = await fetch(`${CHAT_TEST_BASE}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok && data.threadId) {
        setThreadId(data.threadId)
        setDockView('chat')
      }
    } catch {
      /* ignore */
    }
  }

  const handleDownloadChat = useCallback(() => {
    const rows = historyMessages
    if (!rows.length) return
    const lines = rows.map(
      (m) => `${chatTimeLabel(m.createdAt)} [${m.role}] ${String(m.content).replace(/\r?\n/g, ' ')}`,
    )
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    const url = URL.createObjectURL(blob)
    a.href = url
    a.download = `chatbot-history-${chatbotId || 'export'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [historyMessages, chatbotId])

  const handleInquiry = async (ev) => {
    ev.preventDefault()
    setIqErr('')
    if (!iqEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(iqEmail.trim())) {
      setIqErr('Enter a valid email.')
      return
    }
    setIqSubmitting(true)
    try {
      const res = await fetch(TRIAL_INQUIRY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: iqName.trim(),
          email: iqEmail.trim(),
          phone: iqPhone.trim(),
          message: iqMessage.trim(),
          chatbotId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        const apiErr = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : ''
        throw new Error(apiErr || '__INQ_GENERIC__')
      }
      setIqDone(true)
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      const fallback = 'Could not send. Try again.'
      setIqErr(m === '__INQ_GENERIC__' ? fallback : publicErrorMessage(m, fallback))
    } finally {
      setIqSubmitting(false)
    }
  }

  const lockToPassword = () => {
    onEndSession()
    onPanelOpenChange(false)
  }

  const baseColors = theme?.colors || {}
  const col = useMemo(() => {
    const serverMerged = withFullPersonalChatColors(resolvePersonalChatColors(baseColors, 'server'))
    if (!colorPresetId) return serverMerged
    const preset = CHAT_DOCK_COLOR_PRESETS.find((p) => p.id === colorPresetId)
    if (!preset) return serverMerged
    return withFullPersonalChatColors({
      ...resolvePersonalChatColors(baseColors, 'server'),
      ...preset.colors,
    })
  }, [baseColors, colorPresetId])

  const setDockColorPreset = useCallback((id) => {
    setColorPresetId(id)
    try {
      if (!id) localStorage.removeItem(CHAT_DOCK_COLOR_STORAGE_KEY)
      else localStorage.setItem(CHAT_DOCK_COLOR_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const setDockTone = useCallback((id) => {
    setToneId(id)
    try {
      localStorage.setItem(CHAT_DOCK_TONE_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  if (!session || !theme) return null

  const siteLabel =
    (theme.displayHost && String(theme.displayHost).trim()) ||
    (theme.chatbotName && String(theme.chatbotName).trim()) ||
    'Chat'
  const endMs = trialEndsAtIso ? Date.parse(trialEndsAtIso) : NaN
  const remMs =
    trialEndsAtIso && !trialExpiredAtOpen && !Number.isNaN(endMs)
      ? Math.max(0, endMs - Date.now() - skewRef.current)
      : 0
  const totalSec = Math.floor(remMs / 1000)
  const cdDays = Math.floor(totalSec / 86400)
  const cdHours = Math.floor((totalSec % 86400) / 3600)
  const cdMins = Math.floor((totalSec % 3600) / 60)
  const cdSecs = totalSec % 60

  const brandHeroBg =
    col.headerBg && col.accent
      ? `linear-gradient(135deg, ${col.headerBg} 0%, color-mix(in srgb, ${col.accent} 58%, ${col.headerBg}) 52%, color-mix(in srgb, ${col.accent} 42%, ${col.headerBg}) 100%)`
      : undefined

  const expiryDateStr =
    trialEndsAtIso && !Number.isNaN(Date.parse(trialEndsAtIso))
      ? new Date(trialEndsAtIso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : '—'

  const fabStyle = {
    background: col.sendBg || col.headerBg || '#dc2626',
    color: col.sendText || col.headerText || '#fff',
  }

  return (
    <div className="chat-widget-dock" aria-live="polite">
      {panelOpen ? (
        <div
          className="chat-widget-dock__panel"
          role="dialog"
          aria-modal="true"
          aria-label={`Chat with ${theme.chatbotName || 'assistant'}`}
          style={personalChatThemeStyle(col)}
        >
        <div className="chat-personal chat-personal--dock">
          <header
            className="chat-widget-dock__bar"
            style={{
              background: brandHeroBg || col.headerBg,
              color: col.headerText,
              ['--brand-hero-fg']: col.headerText,
              borderBottom: `1px solid color-mix(in srgb, ${col.headerText} 16%, transparent)`,
            }}
          >
            <div className="chat-widget-dock__bar-main">
              <button
                type="button"
                className="chat-widget-dock__icon-btn"
                onClick={() => onPanelOpenChange(false)}
                aria-label="Minimize chat"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="chat-widget-dock__icon-btn chat-widget-dock__settings-trigger"
                onClick={() => setSettingsOpen((o) => !o)}
                aria-expanded={settingsOpen}
                aria-label="Chat appearance and reply tone"
                title="Appearance & tone"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.06 7.06 0 0 1-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.42h-3.84a.48.48 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22l-1.92 3.32c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.39.3.61.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.48 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
                  />
                </svg>
              </button>
              <div className="chat-widget-dock__site" title={siteLabel}>
                <ChatBrandAvatar
                  logoUrl={theme.logoUrl}
                  chatbotName={theme.chatbotName}
                  variant={chatHeaderIsLight(col.headerBg) ? 'light' : 'onDark'}
                />
                <span className="chat-widget-dock__site-name">{siteLabel}</span>
              </div>
            </div>
            <div className="chat-widget-dock__bar-meta">
              <div className="chat-widget-dock__trial" aria-live="polite">
                {trialEnded ? (
                  <span className="chat-widget-dock__trial-line chat-widget-dock__trial-line--ended">Trial ended</span>
                ) : (
                  <>
                    <span className="chat-widget-dock__trial-line chat-widget-dock__trial-line--muted">
                      Until {expiryDateStr}
                    </span>
                    <span className="chat-widget-dock__trial-line chat-widget-dock__trial-line--strong">
                      {cdDays}d {cdHours}h {cdMins}m {cdSecs}s left
                    </span>
                  </>
                )}
              </div>
              <button type="button" className="chat-widget-dock__signout" onClick={lockToPassword}>
                Sign out
              </button>
            </div>
          </header>

          {!trialEnded && settingsOpen ? (
            <div className="chat-widget-dock__settings" role="region" aria-label="Chat appearance and reply tone">
              <div className="chat-widget-dock__settings-block">
                <div className="chat-widget-dock__settings-head">
                  <span className="chat-widget-dock__settings-title">Colors</span>
                  <span className="chat-widget-dock__settings-hint">Saved on this device</span>
                </div>
                <div className="chat-widget-dock__settings-swatches" role="list">
                  <button
                    type="button"
                    className={`chat-widget-dock__swatch chat-widget-dock__swatch--auto${colorPresetId === '' ? ' is-on' : ''}`}
                    onClick={() => setDockColorPreset('')}
                    aria-pressed={colorPresetId === ''}
                    aria-label="Default — use your chatbot’s colors"
                    title="Default — use your chatbot’s colors"
                  >
                    <span className="chat-widget-dock__swatch-auto-label" aria-hidden="true">
                      A
                    </span>
                  </button>
                  {CHAT_DOCK_COLOR_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`chat-widget-dock__swatch${colorPresetId === p.id ? ' is-on' : ''}`}
                      style={{ background: p.swatch }}
                      onClick={() => setDockColorPreset(p.id)}
                      aria-pressed={colorPresetId === p.id}
                      aria-label={p.label}
                      title={p.label}
                    />
                  ))}
                </div>
              </div>
              <div className="chat-widget-dock__settings-block">
                <div className="chat-widget-dock__settings-head">
                  <span className="chat-widget-dock__settings-title">Reply tone</span>
                  <span className="chat-widget-dock__settings-hint">How the bot writes</span>
                </div>
                <ul className="chat-widget-dock__tone-list">
                  {CHAT_DOCK_TONE_OPTIONS.map((t) => (
                    <li key={t.id}>
                      <label className="chat-widget-dock__tone-option">
                        <input
                          type="radio"
                          name="sitemind-dock-tone"
                          value={t.id}
                          checked={toneId === t.id}
                          onChange={() => setDockTone(t.id)}
                        />
                        <span className="chat-widget-dock__tone-text">
                          <span className="chat-widget-dock__tone-label">{t.label}</span>
                          <span className="chat-widget-dock__tone-desc">{t.hint}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {trialEnded ? (
            <div className="chat-personal__expired-wrap">
              <div
                className="chat-personal__expired-card"
                style={{
                  borderColor: col.surfaceBorder,
                  background: `color-mix(in srgb, ${col.botBubble} 82%, ${col.surface})`,
                  boxShadow: `0 12px 40px color-mix(in srgb, ${col.text} 9%, transparent)`,
                }}
              >
                <h2 className="chat-personal__expired-title">
                  Continue with {companyContact?.name || 'SiteMind AI'}
                </h2>
                <p className="chat-personal__expired-lead">
                  Your trial is over. Leave your details and we’ll follow up with next steps.
                </p>
                {/* Direct admin email/phone is intentionally hidden in chatbot UI. */}
                {iqDone ? (
                  <p
                    className="chat-personal__iq-success"
                    role="status"
                    style={{
                      background: `color-mix(in srgb, ${col.accentSoft} 92%, ${col.surface})`,
                      borderColor: col.surfaceBorder,
                      color: col.text,
                    }}
                  >
                    Thanks — we received your message and will be in touch.
                  </p>
                ) : (
                  <form className="chat-personal__iq-form" onSubmit={handleInquiry}>
                    <div className="chat-personal__iq-row">
                      <label className="chat-personal__iq-label" htmlFor="iq-name">
                        Name
                      </label>
                      <input
                        id="iq-name"
                        className="chat-personal__iq-input"
                        value={iqName}
                        onChange={(e) => setIqName(e.target.value)}
                        autoComplete="name"
                        style={{
                          borderColor: col.inputBorder,
                          color: col.text,
                          backgroundColor: col.botBubble,
                        }}
                      />
                    </div>
                    <div className="chat-personal__iq-row">
                      <label className="chat-personal__iq-label" htmlFor="iq-email">
                        Email <span className="chat-personal__req">*</span>
                      </label>
                      <input
                        id="iq-email"
                        className="chat-personal__iq-input"
                        type="email"
                        value={iqEmail}
                        onChange={(e) => setIqEmail(e.target.value)}
                        required
                        autoComplete="email"
                        style={{
                          borderColor: col.inputBorder,
                          color: col.text,
                          backgroundColor: col.botBubble,
                        }}
                      />
                    </div>
                    <div className="chat-personal__iq-row">
                      <label className="chat-personal__iq-label" htmlFor="iq-phone">
                        Phone
                      </label>
                      <input
                        id="iq-phone"
                        className="chat-personal__iq-input"
                        type="tel"
                        value={iqPhone}
                        onChange={(e) => setIqPhone(e.target.value)}
                        autoComplete="tel"
                        style={{
                          borderColor: col.inputBorder,
                          color: col.text,
                          backgroundColor: col.botBubble,
                        }}
                      />
                    </div>
                    <div className="chat-personal__iq-row">
                      <label className="chat-personal__iq-label" htmlFor="iq-msg">
                        Message
                      </label>
                      <textarea
                        id="iq-msg"
                        className="chat-personal__iq-textarea"
                        rows={3}
                        value={iqMessage}
                        onChange={(e) => setIqMessage(e.target.value)}
                        placeholder="Tell us about your business and how you’d like to use the chatbot…"
                        style={{
                          borderColor: col.inputBorder,
                          color: col.text,
                          backgroundColor: col.botBubble,
                        }}
                      />
                    </div>
                    {iqErr ? (
                      <p className="chat-personal__iq-err" role="alert">
                        {iqErr}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      className="btn btn--primary btn--block chat-personal__iq-submit"
                      disabled={iqSubmitting}
                      style={{ background: col.sendBg, color: col.sendText, borderColor: 'transparent' }}
                    >
                      {iqSubmitting ? 'Sending…' : 'Send inquiry'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <>
              <div
                className="chat-widget-dock__subbar"
                role="toolbar"
                aria-label="Chat navigation and export"
                style={{
                  borderColor: col.surfaceBorder,
                  color: col.text,
                  background: `color-mix(in srgb, ${col.surface || '#fff'} 94%, transparent)`,
                }}
              >
                <div className="chat-widget-dock__tabs">
                  <button
                    type="button"
                    className={`chat-widget-dock__tab${dockView === 'chat' ? ' is-on' : ''}`}
                    onClick={() => setDockView('chat')}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    className={`chat-widget-dock__tab${dockView === 'history' ? ' is-on' : ''}`}
                    onClick={() => setDockView('history')}
                  >
                    Full history
                  </button>
                </div>
                <div className="chat-widget-dock__tool-btns">
                  <button
                    type="button"
                    className="chat-widget-dock__tool-btn"
                    onClick={handleDownloadChat}
                    disabled={!historyMessages.length}
                    title="Download full history (.txt)"
                    aria-label="Download full chat history"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="chat-widget-dock__tool-btn"
                    onClick={handleClearChat}
                    title="Clear current chat (saved in Full history)"
                    aria-label="Clear current chat"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div
                ref={listRef}
                className={`chat-personal__messages${dockView === 'history' ? ' chat-personal__messages--history' : ''}`}
              >
                <div className="chat-personal__messages-col">
                  {listToShow.length === 0 && !sending ? (
                    <p
                      className="chat-personal__empty-hint"
                      style={{ color: col.textMuted || col.text, opacity: 0.85 }}
                    >
                      {dockView === 'history'
                        ? 'No messages yet. They appear here as you chat.'
                        : 'Say hello to start.'}
                    </p>
                  ) : null}
                  {(() => {
                    let lastDay = ''
                    const out = []
                    for (const m of listToShow) {
                      const day = chatDayLabel(m.createdAt)
                      if (day && day !== lastDay) {
                        lastDay = day
                        out.push(
                          <div
                            key={`day-${day}-${m.id}`}
                            className="chat-personal__day-label"
                            role="separator"
                            style={{
                              color: col.textMuted || col.text,
                              borderColor: col.surfaceBorder,
                            }}
                          >
                            {day}
                          </div>,
                        )
                      }
                      out.push(
                        <div key={m.id} className={`chat-personal__row chat-personal__row--${m.role}`}>
                          {m.role === 'assistant' ? <div className="chat-personal__rail" aria-hidden="true" /> : null}
                          <div className={`chat-personal__bubble-wrap chat-personal__bubble-wrap--${m.role}`}>
                            <div
                              className={`chat-personal__bubble ${m.role === 'assistant' ? 'chat-personal__bubble--assistant' : 'chat-personal__bubble--user'}`}
                              style={
                                m.role === 'user'
                                  ? {
                                      background: 'var(--cp-send-bg)',
                                      color: 'var(--cp-send-text)',
                                      borderColor: 'transparent',
                                    }
                                  : {
                                      background: 'var(--cp-bot-bubble)',
                                      color: 'var(--cp-text)',
                                      borderColor: 'var(--cp-border)',
                                    }
                              }
                            >
                              {m.role === 'assistant' ? (
                                <ChatAssistantMarkdown text={m.content} />
                              ) : (
                                m.content
                              )}
                            </div>
                            <time
                              className="chat-personal__msg-time"
                              dateTime={m.createdAt}
                              style={{ color: col.textMuted || col.text }}
                            >
                              {chatTimeLabel(m.createdAt)}
                            </time>
                          </div>
                        </div>,
                      )
                    }
                    return out
                  })()}
                  {sending && dockView === 'chat' ? (
                    <div className="chat-personal__row chat-personal__row--assistant">
                      <div className="chat-personal__rail" aria-hidden="true" />
                      <div className="chat-personal__bubble-wrap chat-personal__bubble-wrap--assistant">
                        <div
                          className="chat-personal__bubble chat-personal__bubble--typing chat-personal__bubble--assistant"
                          style={{
                            background: 'var(--cp-bot-bubble)',
                            borderColor: 'var(--cp-border)',
                            color: 'var(--cp-text-muted)',
                          }}
                          aria-busy="true"
                          aria-label="Assistant is typing"
                        >
                          <span className="chat-personal__typing-dots" aria-hidden="true">
                            <span className="chat-personal__typing-dot" />
                            <span className="chat-personal__typing-dot" />
                            <span className="chat-personal__typing-dot" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              {chatErr ? (
                <p className="chat-personal__chat-err" role="alert">
                  {chatErr}
                </p>
              ) : null}
              {dockView === 'chat' ? (
                <form
                  className="chat-personal__composer"
                  onSubmit={handleSend}
                  style={{
                    borderTopColor: 'transparent',
                    background: 'transparent',
                  }}
                >
                  <div className="chat-personal__composer-inner">
                    <input
                      className="chat-personal__input"
                      placeholder="Message…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={sending}
                      aria-label="Message"
                      style={{
                        color: col.text,
                        backgroundColor: 'transparent',
                      }}
                    />
                    <button
                      type="submit"
                      className="chat-personal__send"
                      disabled={sending || !draft.trim()}
                      aria-label="Send message"
                      title="Send"
                      style={{ backgroundColor: col.sendBg, color: col.sendText }}
                    >
                      <svg className="chat-personal__send-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.98.98 0 00-1.39 1.15L4.98 12 2 18.25a.98.98 0 001.39 1.15z"
                        />
                      </svg>
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>
        </div>
      ) : null}

      <button
        type="button"
        className={`chat-widget-dock__fab ${panelOpen ? 'chat-widget-dock__fab--open' : ''}`}
        style={fabStyle}
        onClick={() => onPanelOpenChange(!panelOpen)}
        aria-expanded={panelOpen}
        aria-label={panelOpen ? 'Close chat panel' : `Open ${theme.chatbotName || 'chat'} preview`}
        title={panelOpen ? 'Close' : 'Open chat'}
      >
        {panelOpen ? (
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              fill="currentColor"
              d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"
            />
            <path fill="currentColor" d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z" opacity="0.9" />
          </svg>
        )}
      </button>
    </div>
  )
}

function FAQItem({ item, open, onToggle }) {
  const id = `faq-${item.q.slice(0, 12).replace(/\s/g, '-')}`
  return (
    <div className={`faq__item ${open ? 'faq__item--open' : ''}`}>
      <button
        type="button"
        className="faq__trigger"
        aria-expanded={open}
        aria-controls={id}
        id={`${id}-btn`}
        onClick={onToggle}
      >
        <span>{item.q}</span>
        <span className="faq__chev" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-btn`}
        aria-hidden={!open}
        className="faq__panel"
        data-open={open}
      >
        <div className="faq__panel-inner">
          <p>{item.a}</p>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)
  const [demoModalOpen, setDemoModalOpen] = useState(false)
  const [testChatSession, setTestChatSession] = useState(null)
  const [testChatPanelOpen, setTestChatPanelOpen] = useState(false)
  const [contactSending, setContactSending] = useState(false)
  const [contactFeedback, setContactFeedback] = useState(null)
  const [adminTheme, setAdminTheme] = useState({ red: '#dc2626', black: '#000000', white: '#ffffff' })
  const [adminPricing, setAdminPricing] = useState({ starter: 299, growth: 499, pro: 799 })

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const openDemoModal = useCallback(() => {
    setMenuOpen(false)
    setDemoModalOpen(true)
  }, [])
  const closeDemoModal = useCallback(() => setDemoModalOpen(false), [])
  const openSessionWithWidgetCredentials = useCallback(async ({ chatbotId, integrationSecret }) => {
    const cid = String(chatbotId || '').trim()
    const sec = String(integrationSecret || '').trim()
    if (!cid || !sec) return
    const res = await fetch(`${CHAT_TEST_BASE.replace(/\/chatbot-test$/, '')}/widget/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatbotId: cid, integrationSecret: sec }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      const apiErr = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : 'Could not open chatbot'
      throw new Error(apiErr)
    }
    setTestChatSession({
      sessionId: data.sessionId,
      threadId: data.threadId || '',
      chatHistory: Array.isArray(data.chatHistory) ? data.chatHistory : [],
      theme: data.theme,
      trialEndsAt: data.trialEndsAt || '',
      trialExpired: !!data.trialExpired,
      companyContact: data.supportContact || null,
      chatbotId: data.chatbotId || cid,
      serverTime: data.serverTime,
    })
    setTestChatPanelOpen(true)
  }, [])
  const openTestChatbot = useCallback(() => {
    setMenuOpen(false)
    if (testChatSession) setTestChatPanelOpen(true)
    else setDemoModalOpen(true)
  }, [testChatSession])
  const endTestChatSession = useCallback(() => {
    setTestChatSession(null)
    setTestChatPanelOpen(false)
  }, [])

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await fetch(ADMIN_SETTINGS_API)
        const data = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok || !data.ok || !data.settings) return
        if (data.settings.theme) {
          setAdminTheme((t) => ({
            ...t,
            ...(data.settings.theme || {}),
          }))
        }
        if (data.settings.pricing) {
          const p = data.settings.pricing || {}
          setAdminPricing((prev) => ({
            starter: typeof p.starter === 'number' ? p.starter : prev.starter,
            growth: typeof p.growth === 'number' ? p.growth : prev.growth,
            pro: typeof p.pro === 'number' ? p.pro : prev.pro,
          }))
        }
      } catch {
        /* ignore */
      }
    }
    load()
    const id = setInterval(load, 8000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const landingStyle = useMemo(
    () => ({
      '--red': adminTheme.red,
      '--black': adminTheme.black,
      '--white': adminTheme.white,
    }),
    [adminTheme],
  )

  const plans = useMemo(() => {
    const toMoney = (v) => (typeof v === 'number' && Number.isFinite(v) ? `$${v}` : null)
    const p = adminPricing || {}
    return PLANS_BASE.map((pl) => {
      const v =
        pl.name === 'Starter' ? toMoney(p.starter) : pl.name === 'Growth' ? toMoney(p.growth) : pl.name === 'Pro' ? toMoney(p.pro) : null
      if (!v) return pl
      return { ...pl, price: v }
    })
  }, [adminPricing])

  const handleContactDemoSubmit = useCallback(async (e) => {
    e.preventDefault()
    setContactFeedback(null)
    const form = e.currentTarget
    const fd = new FormData(form)
    const payload = {
      businessName: String(fd.get('business') || '').trim(),
      yourName: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      websiteUrl: String(fd.get('url') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    }
    if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      setContactFeedback({ ok: false, text: 'Please enter a valid email address.' })
      return
    }
    setContactSending(true)
    try {
      const res = await fetch(CONTACT_DEMO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        const apiErr = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : ''
        throw new Error(apiErr || 'Could not send your request. Please try again.')
      }
      form.reset()
      setContactFeedback({
        ok: true,
        text: 'Thanks! We emailed you a copy of your request. Our team will get back to you within 24 hours.',
      })
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      setContactFeedback({ ok: false, text: m || 'Something went wrong. Please try again.' })
    } finally {
      setContactSending(false)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onDesktop = () => {
      if (desktop.matches) setMenuOpen(false)
    }
    desktop.addEventListener('change', onDesktop)
    let prevOverflow = ''
    if (!desktop.matches) {
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    return () => {
      desktop.removeEventListener('change', onDesktop)
      document.body.style.overflow = prevOverflow
    }
  }, [menuOpen])

  return (
    <div className="landing" style={landingStyle}>
      <div className="landing__bg" aria-hidden />

      {menuOpen ? (
        <button type="button" className="nav__scrim" aria-label="Close menu" onClick={closeMenu} />
      ) : null}

      <header className={`nav${menuOpen ? ' nav--open' : ''}`}>
        <div className="nav__inner">
          <a href="#" className="nav__brand" aria-label="SiteMind AI">
            <LandingMark />
            <span className="nav__wordmark">
              SiteMind <span className="nav__wordmark-ai">AI</span>
            </span>
          </a>
          <nav className="nav__links" aria-label="Page sections">
            {NAV_SECTION_LINKS.map(({ href, label }) => (
              <a key={href} href={href} className="nav__link">
                {label}
              </a>
            ))}
          </nav>
          <div className="nav__actions">
            <div className="nav__cta-group" role="group" aria-label="Book and chatbot actions">
              <a href="#contact" className="btn btn--ghost nav__cta-btn">
                Book a walkthrough
              </a>
              <button type="button" className="btn btn--outline nav__cta-btn" onClick={openTestChatbot}>
                Test chatbot
              </button>
              <button type="button" className="btn btn--primary nav__cta-btn" onClick={openDemoModal}>
                Create demo chatbot
              </button>
            </div>
            <button
              type="button"
              className="nav__burger"
              aria-expanded={menuOpen}
              aria-controls="nav-mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div className="nav__drawer" id="nav-mobile-menu">
            <nav className="nav__drawer-links" aria-label="Page sections">
              {NAV_SECTION_LINKS.map(({ href, label }) => (
                <a key={href} href={href} className="nav__drawer-link" onClick={closeMenu}>
                  {label}
                </a>
              ))}
            </nav>
            <p className="nav__drawer-label">Get started</p>
            <button type="button" className="btn btn--primary btn--block nav__drawer-cta" onClick={openDemoModal}>
              Create demo chatbot
            </button>
            <button type="button" className="btn btn--outline btn--block nav__drawer-cta" onClick={openTestChatbot}>
              Test chatbot
            </button>
            <a
              href="#contact"
              className="btn btn--ghost btn--block nav__drawer-cta nav__drawer-secondary"
              onClick={closeMenu}
            >
              Book a walkthrough
            </a>
          </div>
        ) : null}
      </header>

      <main>
        <section className="hero">
          <div className="hero__grid">
            <div className="hero__copy">
              <Reveal>
                <p className="eyebrow hero__eyebrow">
                  <span className="eyebrow__dot" /> AI chat for plumbers, HVAC & painters
                </p>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="hero__title">
                  Capture after-hours visitors before they{' '}
                  <span className="hero__title-accent">call someone else</span>
                </h1>
              </Reveal>
              <Reveal delay={140}>
                <p className="hero__lead">
                  <strong className="hero__strong">Simple idea:</strong> Homeowners search at night. Your office is
                  closed. We build a chatbot from <em>your</em> website so they get real answers—and you get name, need,
                  and urgency in the morning.
                </p>
              </Reveal>
              <Reveal delay={200}>
                <div className="hero__ctas">
                  <button type="button" className="btn btn--primary btn--lg" onClick={openDemoModal}>
                    Create demo chatbot
                  </button>
                  <button type="button" className="btn btn--outline btn--lg" onClick={openTestChatbot}>
                    Test your chatbot
                  </button>
                  <a href="#how-it-works" className="btn btn--outline btn--lg">
                    How it works
                  </a>
                </div>
              </Reveal>
              <Reveal delay={260}>
                <ul className="hero__checks" aria-label="Highlights">
                  <li>Uses your real services, areas, and FAQs</li>
                  <li>Optional lead form when they are ready to talk</li>
                  <li>You edit—or we edit for you</li>
                </ul>
              </Reveal>
            </div>

            <Reveal className="hero__visual-wrap" delay={120}>
              <figure className="hero__figure">
                <LiveImage
                  className="hero__main-img"
                  src={unsplash('photo-1581094794329-c8112a89af12', 1200)}
                  alt="Technician working—home services teams use SiteMind to capture after-hours website visitors"
                  loading="eager"
                  sizes="(max-width: 999px) 100vw, 46vw"
                  width={800}
                  height={560}
                />
              </figure>
            </Reveal>
          </div>
        </section>

        <section className="strip">
          <div className="container strip__grid">
            {STATS.map((s, i) => (
              <Reveal key={s.value} delay={i * 70}>
                <article className="strip__card">
                  <h3 className="strip__value">{s.value}</h3>
                  <p className="strip__label">{s.label}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="problem" className="section section--alt">
          <div className="container split">
            <Reveal>
              <p className="eyebrow">
                <span className="eyebrow__dot" /> The problem (in one sentence)
              </p>
              <h2 className="section__title">They search at 10 PM. You see nothing.</h2>
              <p className="section__lead">
                A leaking pipe or dead AC does not wait for office hours. If your site is silent, they tap the next
                Google result. You never even knew they were interested.
              </p>
              <p className="section__lead">
                <strong>What we add:</strong> instant answers from your own content, plus optional contact capture—so your
                morning starts with context, not guesswork.
              </p>
              <ul className="list-check">
                <li>Explains areas, hours, and what counts as an emergency—in your words.</li>
                <li>Helps you filter “needs someone tonight” vs “can wait a few days.”</li>
                <li>Saves the story (and contact info) before you call back.</li>
              </ul>
            </Reveal>
            <Reveal delay={100}>
              <figure className="problem__figure">
                <LiveImage
                  className="problem__img"
                  src={unsplash('photo-1512941937669-90a1b58e7e9c', 960)}
                  alt="Homeowner on sofa using phone at night to search for local services"
                  sizes="(max-width: 899px) 100vw, 45vw"
                  width={640}
                  height={480}
                />
                <figcaption className="problem__caption">After-hours search is normal. An empty website is not.</figcaption>
              </figure>
            </Reveal>
          </div>
        </section>

        <section id="how-it-works" className="section">
          <div className="container">
            <Reveal>
              <p className="eyebrow eyebrow--center">
                <span className="eyebrow__dot" /> How it works
              </p>
              <h2 className="section__title section__title--center">Four steps—from your URL to a live chat</h2>
              <p className="section__subtitle">
                Same flow whether you run one van or twenty. We read what is already on your site, you approve tone and
                rules, then you paste one embed code.
              </p>
            </Reveal>
            <div className="steps">
              {STEPS.map((step, i) => (
                <Reveal key={step.n} delay={i * 90}>
                  <article className="step-card">
                    <div className="step-card__media">
                      <LiveImage
                        className="step-card__img"
                        src={step.image}
                        alt={step.imageAlt}
                        sizes="(max-width: 768px) 100vw, 25vw"
                        width={320}
                        height={200}
                      />
                    </div>
                    <span className="step-card__n">{step.n}</span>
                    <h3 className="step-card__title">{step.title}</h3>
                    <p className="step-card__body">{step.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="section section--deep">
          <div className="container">
            <Reveal>
              <p className="eyebrow">
                <span className="eyebrow__dot" /> What you get
              </p>
              <h2 className="section__title">Built for dispatch—not generic “support chat”</h2>
              <p className="section__lead section__lead--narrow">
                Your policies stay yours. The bot’s job is simple: answer clearly, steer emergencies safely, and hand you
                leads in a format your office can use.
              </p>
            </Reveal>
            <div className="feature-grid">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 80}>
                  <article className="feature-card">
                    <div className="feature-card__media">
                      <LiveImage
                        className="feature-card__img"
                        src={f.image}
                        alt={f.imageAlt}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        width={400}
                        height={240}
                      />
                    </div>
                    <span className="feature-card__icon" aria-hidden>
                      {f.icon}
                    </span>
                    <h3 className="feature-card__title">{f.title}</h3>
                    <p className="feature-card__body">{f.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="industries" className="section">
          <div className="container">
            <Reveal>
              <p className="eyebrow eyebrow--center">
                <span className="eyebrow__dot" /> Trades we speak
              </p>
              <h2 className="section__title section__title--center">Same engine—tuned per trade</h2>
              <p className="section__subtitle">
                Each vertical gets different prompts and safety rails. Your website still drives the facts; we shape how
                the bot asks and explains.
              </p>
            </Reveal>
            <div className="industry-grid">
              {INDUSTRIES.map((ind, i) => (
                <Reveal key={ind.name} delay={i * 60}>
                  <article className="industry-card">
                    <div className="industry-card__media">
                      <LiveImage
                        className="industry-card__img"
                        src={ind.image}
                        alt={ind.imageAlt}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        width={400}
                        height={260}
                      />
                    </div>
                    <h3 className="industry-card__name">{ind.name}</h3>
                    <p className="industry-card__blurb">{ind.blurb}</p>
                    <ul className="industry-card__tags">
                      {ind.tags.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--mosaic" aria-label="Project gallery">
          <div className="container">
            <Reveal>
              <p className="eyebrow eyebrow--center">
                <span className="eyebrow__dot" /> The world your customers live in
              </p>
              <h2 className="section__title section__title--center">Homes, jobsites, and urgent fixes</h2>
              <p className="section__subtitle">
                Your visitors are picturing <em>their</em> leak, <em>their</em> heat, <em>their</em> paint job. Your chat
                should feel as real as the work you do—grounded, calm, and local.
              </p>
            </Reveal>
            <div className="mosaic">
              {GALLERY_IMAGES.map((g, i) => (
                <Reveal key={g.alt} delay={i * 70} className={`mosaic__cell mosaic__cell--${i + 1}`}>
                  <LiveImage className="mosaic__img" src={g.src} alt={g.alt} sizes="(max-width: 768px) 100vw, 20vw" />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="leads" className="section section--alt">
          <div className="container split split--reverse">
            <Reveal>
              <p className="eyebrow">
                <span className="eyebrow__dot" /> Lead capture
              </p>
              <h2 className="section__title">Better than “call me back”</h2>
              <p className="section__lead">
                Voicemail with no detail wastes your morning. A short transcript—with address, problem, and best time to
                call—lets you prioritize trucks and callbacks in seconds.
              </p>
              <p className="section__lead">
                When someone asks price, timing, or “can you come out,” the bot can ask for contact info in your voice—so
                you are not spamming people who were only browsing.
              </p>
              <div className="callout">
                <strong>For agencies.</strong> Use the same intake fields across every client (job type, rental vs owner,
                etc.) while each bot still reads that client’s own site.
              </div>
            </Reveal>
            <Reveal delay={100}>
              <figure className="leads__figure">
                <LiveImage
                  className="leads__side-img"
                  src={unsplash('photo-1521737711867-e3b97375f902', 900)}
                  alt="Team at desk reviewing work in the morning"
                  sizes="(max-width: 899px) 100vw, 42vw"
                  width={540}
                  height={360}
                />
              </figure>
            </Reveal>
          </div>
        </section>

        <section className="section section--deep">
          <div className="container">
            <Reveal>
              <p className="eyebrow eyebrow--center">
                <span className="eyebrow__dot" /> Social proof
              </p>
              <h2 className="section__title section__title--center">What operators say (sample quotes)</h2>
              <p className="section__subtitle">
                Illustrative stories for your landing page—not real contracts. Swap in your own clients when you have them.
              </p>
            </Reveal>
            <div className="testimonial-grid">
              {TESTIMONIALS.map((t, i) => (
                <Reveal key={t.name} delay={i * 100}>
                  <blockquote className="quote-card">
                    <div className="quote-card__row">
                      <LiveImage
                        className="quote-card__avatar"
                        src={t.photo}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                      />
                      <div className="quote-card__who">
                        <cite className="quote-card__name">{t.name}</cite>
                        <p className="quote-card__role">
                          {t.role} · {t.locale}
                        </p>
                      </div>
                    </div>
                    <p className="quote-card__text">“{t.quote}”</p>
                    <footer className="quote-card__foot">
                      <p className="quote-card__metric">{t.metric}</p>
                    </footer>
                  </blockquote>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="section">
          <div className="container">
            <Reveal>
              <p className="eyebrow eyebrow--center">
                <span className="eyebrow__dot" /> Plans
              </p>
              <h2 className="section__title section__title--center">Illustrative plans—adjust to your market</h2>
              <p className="section__subtitle">
                Real quotes depend on your site size, locations, and how much you want us to maintain. Start small;
                upgrade when traffic grows.
              </p>
            </Reveal>
            <div className="pricing-grid">
              {plans.map((p, i) => (
                <Reveal key={p.name} delay={i * 90}>
                  <article className={`price-card ${p.highlighted ? 'price-card--featured' : ''}`}>
                    {p.highlighted && <span className="price-card__badge">Most popular</span>}
                    <h3 className="price-card__name">{p.name}</h3>
                    <p className="price-card__price">
                      {p.price}
                      <span className="price-card__period">{p.period}</span>
                    </p>
                    <p className="price-card__desc">{p.desc}</p>
                    <ul className="price-card__list">
                      {p.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <a href="#contact" className={`btn ${p.highlighted ? 'btn--primary' : 'btn--outline'} btn--block`}>
                      Talk to us
                    </a>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="section section--alt">
          <div className="container faq-layout">
            <Reveal>
              <p className="eyebrow">
                <span className="eyebrow__dot" /> FAQ
              </p>
              <h2 className="section__title">Short answers to common questions</h2>
              <p className="section__lead">
                Need embed code, CRM handoff, or data details? We walk through that on a quick call.
              </p>
              <a href="#contact" className="btn btn--primary">
                Book 20 minutes
              </a>
            </Reveal>
            <div className="faq__list">
              {FAQS.map((item, idx) => (
                <FAQItem
                  key={item.q}
                  item={item}
                  open={openFaq === idx}
                  onToggle={() => setOpenFaq((v) => (v === idx ? -1 : idx))}
                />
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="cta-band">
          <div className="cta-band__bg" aria-hidden="true">
            <LiveImage
              className="cta-band__bg-img"
              src={unsplash('photo-1486406146926-c627a92ad1ab', 1600)}
              alt=""
              width={1600}
              height={900}
              loading="lazy"
            />
          </div>
          <div className="container cta-band__inner">
            <Reveal>
              <h2 className="cta-band__title">Stop losing the 10 PM searchers</h2>
              <p className="cta-band__text">
                Tell us your trade, area, and website URL. We will show a tailored demo and explain DIY vs done-for-you.
                No minimum traffic required.
              </p>
            </Reveal>
            <Reveal delay={100}>
              <form className="cta-form" onSubmit={handleContactDemoSubmit} noValidate>
                <div className="cta-form__row">
                  <label className="field">
                    <span className="field__label">Business name</span>
                    <input
                      className="field__input"
                      name="business"
                      placeholder="Ridgeline HVAC LLC"
                      autoComplete="organization"
                      disabled={contactSending}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Your name</span>
                    <input
                      className="field__input"
                      name="name"
                      placeholder="Jordan Ellis"
                      autoComplete="name"
                      disabled={contactSending}
                    />
                  </label>
                </div>
                <div className="cta-form__row">
                  <label className="field">
                    <span className="field__label">Email</span>
                    <input
                      className="field__input"
                      type="email"
                      name="email"
                      placeholder="you@yourbusiness.com"
                      autoComplete="email"
                      required
                      disabled={contactSending}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Phone</span>
                    <input
                      className="field__input"
                      type="tel"
                      name="phone"
                      placeholder="(555) 000-0000"
                      autoComplete="tel"
                      disabled={contactSending}
                    />
                  </label>
                </div>
                <label className="field">
                  <span className="field__label">Website URL</span>
                  <input
                    className="field__input"
                    name="url"
                    placeholder="https://yoursite.com"
                    inputMode="url"
                    autoComplete="url"
                    disabled={contactSending}
                  />
                </label>
                <label className="field">
                  <span className="field__label">What should we know?</span>
                  <textarea
                    className="field__input field__textarea"
                    name="notes"
                    rows={4}
                    placeholder="e.g. Two locations, emergency fees after 8 PM, seasonal tune-up promo…"
                    disabled={contactSending}
                  />
                </label>
                {contactFeedback ? (
                  <p
                    className={`cta-form__feedback ${contactFeedback.ok ? 'cta-form__feedback--ok' : 'cta-form__feedback--err'}`}
                    role="status"
                  >
                    {contactFeedback.text}
                  </p>
                ) : null}
                <button type="submit" className="btn btn--light btn--lg btn--block" disabled={contactSending}>
                  {contactSending ? 'Sending…' : 'Request a demo'}
                </button>
              </form>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer__grid">
          <div>
            <div className="footer__brand">
              <LandingMark variant="footer" />
              <span>SiteMind AI</span>
            </div>
            <p className="footer__tag">
              White-label AI chatbots grounded in your website—built for home services and the agencies that serve them.
            </p>
          </div>
          <div>
            <h4 className="footer__h">Explore</h4>
            <ul className="footer__links">
              <li>
                <a href="#how-it-works">How it works</a>
              </li>
              <li>
                <a href="#features">Features</a>
              </li>
              <li>
                <a href="#pricing">Plans</a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="footer__h">Contact</h4>
            <ul className="footer__links">
              <li>
                <a href="mailto:hello@sitemind.example">hello@sitemind.example</a>
              </li>
              <li>
                <a href="tel:+15555550199">(555) 555-0199</a>
              </li>
              <li>Mon–Fri · 9–5 local time</li>
            </ul>
          </div>
        </div>
        <div className="footer__bar">
          <div className="container footer__bar-inner">
            <small>
              © {new Date().getFullYear()} SiteMind AI · Photos{' '}
              <a href="https://unsplash.com" target="_blank" rel="noreferrer">
                Unsplash
              </a>
            </small>
            <small className="footer__fine">
              Testimonials and stats are illustrative. Update before launch.
            </small>
          </div>
        </div>
      </footer>

      <DemoChatbotModal open={demoModalOpen} onClose={closeDemoModal} onAutoSessionReady={openSessionWithWidgetCredentials} />
      <TestChatFloatingDock
        session={testChatSession}
        panelOpen={testChatPanelOpen}
        onPanelOpenChange={setTestChatPanelOpen}
        onEndSession={endTestChatSession}
      />
    </div>
  )
}
