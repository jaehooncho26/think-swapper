the think swapper

A tiny single-page app (SPA) that shows wallet balances, prices, and recent swaps, backed by a Netlify Function that talks to GalaChain / GalaSwap.

Live site: https://itsgoodtothink.com

API base: https://itsgoodtothink.com/.netlify/functions/sidecar

1) What’s in here
/
├─ index.html                 # UI (static page)
├─ images & fonts             # background.jpg, logos, Qahiri-Regular.ttf, etc.
└─ netlify/
   └─ functions/
      └─ sidecar.js          # Serverless Express API (serverless-http)


The page calls the API at /.netlify/functions/sidecar.

The function strips that prefix so Express routes like /prices work:

app.use((req, _res, next) => {
  const prefix = '/.netlify/functions/sidecar';
  if (req.url.startsWith(prefix)) req.url = req.url.slice(prefix.length) || '/';
  next();
});

2) Environment variables

Set these in Netlify → Site configuration → Environment variables:

Minimum

WALLET_ADDRESS=eth|<40-hex>        # no 0x after the pipe (e.g., eth|a3091d6...)


Optional (defaults exist)

GATEWAY_BASE_URL=https://gateway-mainnet.galachain.com
DEX_BACKEND_BASE_URL=https://dex-backend-prod1.defi.gala.com
BUNDLER_BASE_URL=https://bundle-backend-prod1.defi.gala.com
GALACONNECT_BASE_URL=https://api-galaswap.gala.com

# Used by /tx-time to resolve actual on-chain timestamps
EXPLORER_BASE_URL=https://explorer-api.galachain.com/v1/explorer
EXPLORER_CHANNELS=asset,dex
EXPLORER_LOOKBACK=1500


Only if you want to enable POST /swap

PRIVATE_KEY=0x...                 # keep secret; omit for read-only site


After changing env vars in Netlify, trigger a new deploy.

Local .env (for netlify dev)

Create a .env at the repo root (do not commit it):

WALLET_ADDRESS=eth|<40-hex>
# PRIVATE_KEY=0x...    # optional for swaps

3) Run locally
# one-time
npm i -g netlify-cli

# from repo root
netlify dev


Site: http://localhost:8888/

API: http://localhost:8888/.netlify/functions/sidecar

netlify dev automatically loads .env.

4) Deploy on Netlify

Using Git is simplest:

Build command: (leave empty)

Publish directory: /

Functions directory: netlify/functions

Set env vars → Redeploy.

5) API (provided by sidecar.js)

Base path: /.netlify/functions/sidecar

GET / — health + env preview

GET /whoami — wallet + “swap enabled” flag

GET /debug — debug info (no secrets)

GET /prices — { prices: { GALA, ETH, USDC } } (USDC=1)

GET /assets — normalized balances for the configured wallet

GET /txs — recent in-memory transaction log (newest first)

Query: limit (default 50), seed=0|1 (default 1)

GET /tx-time?txId=... — resolves a tx’s on-chain timestamp via explorer

POST /quote — quote exact input
