# Crest Auth Setup

## Supabase Google/Gmail OAuth

Crest supports Google OAuth at `/auth/sign-in/google`, using the shared callback route `/auth/callback`.
For v1, only Google accounts with an email ending in `@gmail.com` are allowed. Google Workspace/custom-domain accounts are signed out after callback and redirected with a clear error.

1. Open the Google Auth Platform in Google Cloud.
2. Configure the OAuth consent screen for Crest.
3. Create an OAuth Client ID with application type `Web application`.
4. Add authorized JavaScript origins:
   - `https://crest-inky.vercel.app`
   - `http://localhost:3000` for local testing, if needed.
5. Add the authorized redirect URI:
   - `https://szlsfmoacoafztgocimm.supabase.co/auth/v1/callback`
6. Open the Supabase project `szlsfmoacoafztgocimm`.
7. Go to Authentication -> Providers -> Google.
8. Enable the Google provider and paste the Google Client ID and Client Secret.
9. In Supabase Auth URL configuration, allow:
   - Site URL: `https://crest-inky.vercel.app`
   - Redirect URL: `https://crest-inky.vercel.app/auth/callback`
   - Optional local redirect: `http://localhost:3000/auth/callback`

Never commit the Google Client Secret.

## Supabase X/Twitter OAuth

The Crest app route is implemented at `/auth/sign-in/x`, and the callback route is `/auth/callback`.

Crest currently uses Supabase's legacy `twitter` provider because the available X credentials are OAuth 1.0a Consumer Key and Secret Key.

1. Open the Supabase project `szlsfmoacoafztgocimm`.
2. Go to Authentication -> Providers -> Twitter.
3. Enable the Twitter provider.
4. Add the X/Twitter Consumer Key and Secret Key.
5. In the X developer app, add the callback URL:
   - `https://szlsfmoacoafztgocimm.supabase.co/auth/v1/callback`
6. In Supabase Auth URL configuration, allow:
   - Site URL: `https://crest-inky.vercel.app`
   - Redirect URL: `https://crest-inky.vercel.app/auth/callback`

Local Supabase config uses env placeholders:

- `SUPABASE_AUTH_EXTERNAL_TWITTER_CONSUMER_KEY`
- `SUPABASE_AUTH_EXTERNAL_TWITTER_SECRET_KEY`

Never commit those values.

When OAuth 2.0 Client ID and Client Secret become available, Crest can switch back to Supabase provider `x`.

## Ethereum Wallet Auth

Crest signs an EIP-4361 SIWE message in the browser and sends the message/signature to `/api/auth/wallet/ethereum`.
The server verifies the signature with `viem`, creates or reuses a Supabase Auth user for that wallet, and writes a normal Supabase session cookie.

The entry screen detects Ethereum-compatible injected wallets using:

- EIP-6963 provider discovery for multi-wallet browsers.
- `window.ethereum.providers` fallback.
- Known injected globals for OKX and Bitget/BitKeep fallback.

Supported wallets include MetaMask, OKX Wallet, Bitget Wallet, Rabby, Coinbase Wallet, and other EIP-1193 compatible injected wallets.

Supabase cloud Web3/Ethereum auth is no longer required for the Crest wallet path, because verification happens in the Crest server route.
The repo still keeps local Web3 config enabled for future native Supabase Web3 support:

- `[auth.web3.ethereum] enabled = true`

The production wallet login only requires server-side Supabase credentials in Vercel.
