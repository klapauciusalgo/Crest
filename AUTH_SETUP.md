# Crest Auth Setup

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

Supabase cloud must have Web3/Ethereum auth enabled. The repo config has:

- `[auth.web3.ethereum] enabled = true`

The production Supabase project must match this provider setting before wallet login can verify signatures.
