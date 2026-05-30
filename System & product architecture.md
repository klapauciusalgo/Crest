You are a senior full-stack architect and product designer specializing in real-time financial data platforms. Design and build a cryptocurrency analytics web application named "Crest" with the following precise specifications:

CORE DATA SYSTEM
- Track top 300 cryptocurrencies by market cap, refreshed every 60 seconds via Supabase Realtime
- Data source: CoinGecko Pro API or CCXT aggregator
- Compute server-side: RSI(14), MA111, volume delta 24h, price delta 24h
- Store computed indicators in Supabase Postgres market snapshot rows, refreshed every 60s per asset per timeframe
- Support two timeframes: 30 minutes (30m) and 4 hours (4h), switchable without page reload

DATA COLUMNS PER ASSET
1. Price (USD, real-time)
2. Price change % in 24h (colored: green positive, red negative)
3. RSI(14) — with visual gauge: oversold <30, neutral 30–70, overbought >70
4. Volume change % in 24h
5. Chain label (ETH, BSC, SOL, BASE, ARB, AVAX, MATIC, TON, etc.)
6. MA111 value
7. Distance from MA111 in % = ((Price - MA111) / MA111) × 100

CHAIN PERFORMANCE GROUPING
- Group all 300 assets by their native chain
- Compute per-chain metrics: avg price change %, avg volume change %, count of gainers/losers
- Display as interactive heatmap: X-axis = avg price change, Y-axis = avg volume change, bubble size = asset count
- Click chain bubble → drill down to filtered asset list for that chain
- Update chain metrics every 5 minutes

FILTER & SORT SYSTEM
- Multi-select chain filter with "all/none" shortcuts
- RSI range slider (0–100), with presets: Oversold / Neutral / Overbought
- MA111 distance filter: show assets X% below or above MA111
- Timeframe toggle (30m / 4h) affecting all computed columns
- Save/load filter presets per authenticated user (stored in Supabase Postgres)
- Combined sort: primary column + secondary column

AUTHENTICATION — TWO METHODS
1. OAuth via X (Twitter): Supabase Auth, store X user ID + display name
2. Sign-In with Ethereum (SIWE, EIP-4361): wagmi + viem, challenge-response through server-side Vercel route handlers, support MetaMask / WalletConnect / Phantom where practical. No password stored.
Both methods produce a unified user session with role: "user" | "admin"

AI ASSISTANT SYSTEM
- Inject current visible data snapshot (filtered grid state as JSON) into every AI request as context
- Streaming responses via SSE from Vercel route handlers
- Session history per user (last 20 messages) stored in Supabase Postgres
- User can "pin" up to 5 assets — always injected into AI context
- Preset prompt templates selectable from dropdown
- AI response can reference asset tickers — highlight matching rows in main grid on response

ADMIN PANEL — AI PROVIDER CONFIGURATION
Route: /admin/ai-config (role: admin only)
- Support providers: Anthropic, OpenRouter, Ollama (self-hosted), OpenAI, Groq, DeepSeek, Custom HTTP endpoint
- Per-provider config: base URL, API key (AES-256 encrypted at rest), model name, max tokens, temperature
- Fallback provider chain if primary is unavailable
- Rate limit per user: configurable AI requests per day
- Custom system prompt for platform AI persona

TECH STACK
Hosting/backend: Vercel + Next.js App Router route handlers + Vercel Cron Jobs
Database/auth/realtime: Supabase Postgres + Supabase Auth + Supabase Realtime
Frontend: Next.js 14 App Router + TypeScript + TanStack Table + Zustand
Styling: Tailwind CSS v4 with custom design tokens
Auth: Supabase Auth (X) + wagmi/viem (wallet)

Deliver as a modular Vercel-ready codebase with clear separation: /app/api, /components, /store, /lib/indicators, /lib/ai-provider, /lib/supabase, /supabase/migrations
