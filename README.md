# LOOSE AGENT

A token launchpad frontend built on **Pons V2** (Robinhood Chain, chain id 4663). Tokens launch onto a Pons ETH bonding curve. When the curve sells out, the token automatically graduates to a Uniswap v4 pool with permanently locked liquidity.

## Features

- **Explore** – newest launches (`TokenLaunched` events from the Pons factory), graduation progress, filters, and search.
- **Launch** – create a token (name, symbol, logo, description, socials, creator tax, buyback) with an atomic initial dev buy via `PonsV2LaunchAndBuy`.
- **Token page** – price, market cap, progress, recent trades, and buy/sell on the bonding curve with local quotes and slippage protection.
- **Profile** – tokens you launched and creator fee claims from the fee escrow.

## Running

```bash
npm install
cp .env.example .env   # optional: set your own RPC
npm run dev            # http://localhost:5173
npm run build          # static output in dist/
```

### RPC

The browser reads chain data through `/api/rpc`, a Vercel serverless proxy (`api/rpc.js`) that forwards to the first Robinhood Chain RPC that answers. This avoids browser CORS blocks and the rate limits of the public endpoint. For the best reliability, set `RPC_URL` in Vercel (*Settings → Environment Variables*) to a private endpoint from Alchemy, QuickNode, etc. It stays server-side and is tried first.

### Wallets

The connect dialog lists every installed browser wallet (MetaMask, Rabby, OKX, … via EIP-6963) and links to install the others. To also offer **WalletConnect** (QR code for mobile wallets), create a free project id at [dashboard.reown.com](https://dashboard.reown.com) and set `VITE_WALLETCONNECT_PROJECT_ID` (locally in `.env`, on Vercel under *Settings → Environment Variables*, then redeploy). Add your site domain to the project's allowed domains in Reown.

The build is a static site. Deploy it to Vercel (`vercel.json` included), Netlify (`public/_redirects`), or any static host.

## Contracts (Robinhood Chain 4663)

| Contract | Address |
|---|---|
| PonsV2LaunchFactory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| PonsV2LaunchAndBuy | `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948` |
| PonsV2MemeHook | `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` |
| Fee Escrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` |

Addresses and ABIs come from the public `pons-client` package and Bitquery's Pons docs. Verify them against the [Pons docs](https://docs.ponsfamily.com/v2) or [Blockscout](https://robinhoodchain.blockscout.com) before moving real funds.

## Layout

```
src/lib/pons.ts      addresses, ABIs, curve math (buy/sell quotes)
src/lib/launches.ts  launch indexing from on-chain logs
src/lib/chain.ts     Robinhood Chain definition
src/pages/           Home, Create, Token, Profile
```

To rename the brand, change `BRAND` in `src/App.tsx` and the `<title>` in `index.html`.
