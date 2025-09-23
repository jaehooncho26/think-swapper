# the think swapper

A lightweight GalaSwap trading bot + dashboard.
Shows wallet balances, live prices, and recent swaps, and can run an hourly trading loop that executes small, controlled swaps based on simple signals.

# Live

Site: https://itsgoodtothink.com
API base: https://itsgoodtothink.com/.netlify/functions/sidecar

# What It Does

   Tracks GUSDC / GALA / GWETH balances.
   Quotes live prices via GalaSwap (GALA→USDC, WETH→USDC).
   Logs swaps and shows after-trade balances and a total value for each transaction.
   Resolves real on-chain timestamps for swaps when a txId is available.
   (Optional) Executes swaps with a private key (bot mode).

# Intended Use

   A transparent, low-maintenance bot to probe edges hourly (momentum, mean-reversion, small route arb) with    strict risk caps.
   A public dashboard for balance/price/tx visibility.
   A stepping stone: start read-only, later enable automated trades.

# Architecture
      /
      ├─ index.html                  # UI (static)
      └─ netlify/
         └─ functions/
            └─ sidecar.js           # Serverless Express API (serverless-http)


         Frontend polls /prices, /assets, and /txs.
         Sidecar API wraps @gala-chain/gswap-sdk, provides price/asset endpoints, swap, and a tx timestamp             helper.

   Core endpoints
            
      GET /prices → { prices: { GALA, ETH, USDC } }
      GET /assets → { tokens: [ {symbol, quantity}, ... ] }
      GET /txs → recent in-memory tx snapshots (after-balances, time, ids)
      GET /tx-time?txId=... → on-chain timestamp lookup
      POST /swap → executes a swap (requires PRIVATE_KEY)

# Bot Strategy (hourly)
Flip-Flop Micro-Trader on GalaSwap

This bot is designed to run continuously on GitHub Actions every 10 minutes. Its core strategy is simple but systematic:

Profit-taking sells

      At the start of each tick, the bot checks whether it holds GALA or GWETH (wrapped ETH on GalaChain).
      If it does, it requests a live swap quote from GalaSwap to convert the entire balance back into GUSDC            (GalaChain USDC).

      If the output would return more than the bot’s assumed cost basis (~$1 per previous buy) plus a profit           threshold (default 0.1%, configurable with MIN_PROFIT_BPS), it executes the swap and realizes the profit.

      If not profitable, the bot skips and holds the token for another round.

Alternating buys

      After checking for sells, the bot always spends a small, fixed amount of GUSDC (default $1, configurable          via BOT_USD_CENTS).

      It alternates what it buys each cycle:

      Even time slots → buy GALA

      Odd time slots → buy GWETH

      This creates a “flip-flop” rhythm, diversifying between the two assets and generating opportunities to           later sell them back if profitable.

Risk management & safety

      The bot never crashes if balances are missing — if the wallet has no USDC, no GALA, or no GWETH, the tick         just logs a [...-SKIP] message and exits successfully.

      Slippage is capped (default 0.5%, via SLIPPAGE_BPS) so swaps won’t execute at poor prices.

      A DRY_RUN mode lets you test the flow without sending real trades.

      The workflow is stateless — every 10-minute run is independent, so if GitHub skips a run or the VM resets,       the bot continues normally on the next tick.

# Environment Variables

Required
   WALLET_ADDRESS=eth|<40-hex> 


Optional (defaults are sane)
   
      PRIVATE_KEY=0x...        
      GATEWAY_BASE_URL=https://gateway-mainnet.galachain.com
      DEX_BACKEND_BASE_URL=https://dex-backend-prod1.defi.gala.com
      BUNDLER_BASE_URL=https://bundle-backend-prod1.defi.gala.com
      GALACONNECT_BASE_URL=https://api-galaswap.gala.com
   
      EXPLORER_BASE_URL=https://explorer-api.galachain.com/v1/explorer
      EXPLORER_CHANNELS=asset,dex
      EXPLORER_LOOKBACK=1500


      Bot tuning (for your scheduled runner)

      BOT_INTERVAL_MIN=60
      DRY_RUN=false
      SLIPPAGE_BPS=50
      BASE_TRADE_USD=2
      MAX_TRADE_USD=25

      EMA_ALPHA=0.2
      MOMENTUM_TH=0.004
      MEANREV_TH=0.006

      ARB_PATH=USDC-GALA-WETH-USDC
      ARB_START_USD=3
      ARB_MIN_PROFIT_BPS=30

# Local Dev
      npm i -g netlify-cli
      netlify dev

      UI: http://localhost:8888
      API: http://localhost:8888/.netlify/functions/sidecar

Quick tests
      
      curl -s localhost:8888/.netlify/functions/sidecar/prices | jq
      curl -s localhost:8888/.netlify/functions/sidecar/assets | jq
      curl -s "localhost:8888/.netlify/functions/sidecar/txs?limit=10&seed=0" | jq

# Deploy (Netlify)

      Publish directory: /
      Functions directory: netlify/functions
      Build command: (leave empty)

Set env vars in Site settings → Environment variables, then deploy.

