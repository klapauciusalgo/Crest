Design the UI/UX for Crest as a professional-grade trading terminal aesthetic — not a crypto retail app, not a SaaS dashboard template, and absolutely not AI-generated slop. The visual language must feel like a Bloomberg terminal meets a systems monitoring dashboard, but with intentional restraint and spatial intelligence.

VISUAL IDENTITY PRINCIPLES
- Typography-first: data communicates through type weight, size hierarchy, and monospace numerals — not through color alone
- Color is signal, not decoration: use color only to encode meaning (RSI zones, positive/negative, chain identity). Background stays near-black or deep neutral. No gradients, no glow, no glassmorphism.
- Density by default: show maximum information without clutter. Users are analysts, not beginners.
- Spatial rhythm: consistent 4px grid system. Rows are 36px in default density, 28px in compact mode.
- No cards for the main data grid — naked table with micro-borders. Cards only for AI panel and chain heatmap.

LAYOUT — THREE-ZONE ARCHITECTURE
┌──────────────────────────────────────────────┐
│  HEADER: Logo + timeframe toggle + auth      │
├──────────────┬───────────────────────────────┤
│  LEFT RAIL   │  MAIN GRID (virtualized)      │
│  (240px)     │  300 rows, sticky header      │
│  Chain heat- │  Multi-sort arrows, RSI gauge │
│  map + filter│  Inline sparkline (optional)  │
│  presets     ├───────────────────────────────┤
│              │  CHAIN HEATMAP VIEW (toggle)  │
└──────────────┴───────────────────────────────┘
│  BOTTOM DRAWER: AI Assistant (collapsible)   │
└──────────────────────────────────────────────┘

TYPOGRAPHY RULES
- Data numerals: font-variant-numeric: tabular-nums — critical for column alignment
- Price: 13px, weight 500, monospace
- Percentage change: 12px with directional arrow prefix (▲ / ▼), no parentheses
- Column headers: 11px, uppercase, letter-spacing 0.05em, muted color
- Chain labels: pill badges, 10px, background from chain color palette, max-width 48px

COLOR SYSTEM — DARK TERMINAL
- Background primary: #0D0E11 (not pure black)
- Background secondary: #141519
- Border: #1E2028 (hairline 0.5px)
- Text primary: #E8E9EC
- Text muted: #5A5C6A
- Positive: #1DB87E (green — gains)
- Negative: #E5484D (red — losses)
- RSI oversold: #4C9EFF (blue — opportunity)
- RSI overbought: #FF8C42 (amber — caution)
- MA below (bearish): #FF5C5C
- MA above (bullish): #3DD68C

CHAIN COLOR IDENTITY (pill backgrounds)
ETH: #627EEA / BSC: #F0B90B / SOL: #9945FF / BASE: #0052FF / ARB: #2D374B + border #4FC1FF / AVAX: #E84142

RSI COLUMN — MICRO GAUGE
Render RSI as: [████░░░] 68.4
- Filled blocks colored by zone: blue if <30, neutral if 30–70, amber if >70
- Number right-aligned in monospace
- Width: 80px total

MA111 DISTANCE COLUMN
Show as: ▲ +12.4% or ▼ −8.1%
Color-coded by direction. Positive = bullish, negative = bearish.

CHAIN HEATMAP VIEW
- SVG-based bubble chart. No chart library — custom D3 or raw SVG.
- Each bubble: chain icon + avg price Δ label inside
- Bubble color: green→red based on avg price change, opacity based on volume change
- Tooltip: chain name, asset count, avg price Δ%, avg vol Δ%

AI ASSISTANT — BOTTOM DRAWER
- Collapsed state: single bar at bottom — "Ask about current data ↑"
- Expanded: 320px height, chat interface with terminal aesthetic
- Input: bare text field, monospace font, placeholder "e.g. which BSC tokens are oversold?"
- Responses stream in — no loading spinner, use cursor blink
- Preset prompts shown as ghost pills above input
- When AI mentions a ticker, that row in the grid glows (brief highlight animation, no flash)

INTERACTIONS THAT MUST FEEL NATIVE
- Column sort: click header → arrow cycles (none → asc → desc). No modal, no dropdown.
- Timeframe switch: 30m | 4h segmented control in header — instant data swap, no skeleton loader
- Filter rail: sliders respond in 16ms — no debounce on visual, debounce API call at 300ms
- Row hover: subtle background shift #1A1C22 — no heavy highlight
- Transitions: 120ms ease-out max. Nothing that animates for more than 200ms.

WHAT TO AVOID (explicitly anti-pattern)
✗ No hero sections or landing page elements inside the app
✗ No rounded pill buttons with gradient backgrounds
✗ No "crypto bro" iconography (rockets, moons, diamonds)
✗ No dark-mode toggle — always dark, this is not configurable
✗ No skeleton loaders that pulse — use static placeholder dashes (—)
✗ No modal-heavy flows — everything inline or in-drawer
✗ No toast notifications for data updates — update in place silently
✗ No confetti, no animations on price changes (professionals ignore noise)
✗ No AI chat bubble interface — use flat terminal-style chat, not WhatsApp-style