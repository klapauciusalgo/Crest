# Crest Auth Setup

## Supabase X OAuth

The Crest app route is implemented at `/auth/sign-in/x`, and the callback route is `/auth/callback`.

Supabase cloud must still have the X provider enabled:

1. Open the Supabase project `szlsfmoacoafztgocimm`.
2. Go to Authentication -> Providers -> X.
3. Enable the provider.
4. Add the X OAuth 2.0 client ID and client secret.
5. In the X developer app, add the callback URL:
   - `https://szlsfmoacoafztgocimm.supabase.co/auth/v1/callback`
6. In Supabase Auth URL configuration, allow:
   - Site URL: `https://crest-inky.vercel.app`
   - Redirect URL: `https://crest-inky.vercel.app/auth/callback`

Local Supabase config uses env placeholders:

- `SUPABASE_AUTH_EXTERNAL_X_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_X_SECRET`

Never commit those values.

## Ethereum Wallet Auth

Crest signs an EIP-4361 SIWE message in the browser and sends the message/signature to `/api/auth/wallet/ethereum`.

Supabase cloud must have Web3/Ethereum auth enabled. The repo config has:

- `[auth.web3.ethereum] enabled = true`

The production Supabase project must match this provider setting before wallet login can verify signatures.
