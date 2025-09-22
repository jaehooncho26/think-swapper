# the think swapper


A trading bot on Galaswap. The web page shows wallet balances, prices, and recent swaps and has a bot that follows certain algorithms to make trades every hour. Backed by a Netlify Function that talks to GalaChain / GalaSwap.

Live site: https://itsgoodtothink.com

API base: https://itsgoodtothink.com/.netlify/functions/sidecar

# 1) What’s in here
/
├─ index.html                 # UI (static page)
├─ images & fonts             # background.jpg, logos, Qahiri-Regular.ttf, etc.
└─ netlify/
   └─ functions/
      └─ sidecar.js          # Serverless Express API (serverless-http)


# 2) Environment variables

Set these in Netlify → Site configuration → Environment variables:


# 3) Run locally
npm i -g netlify-cli
netlify dev

