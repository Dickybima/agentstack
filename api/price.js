// ETH/USD spot price for converting on-chain ETH values to dollars. Tries several sources.
const SOURCES = [
  ['coinbase', 'https://api.coinbase.com/v2/prices/ETH-USD/spot', (d) => Number(d?.data?.amount)],
  ['binance', 'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', (d) => Number(d?.price)],
  ['coingecko', 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', (d) => Number(d?.ethereum?.usd)],
  ['kraken', 'https://api.kraken.com/0/public/Ticker?pair=ETHUSD', (d) => Number(Object.values(d?.result ?? {})[0]?.c?.[0])],
]

export async function GET() {
  const errors = []
  for (const [name, url, pick] of SOURCES) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4_000), headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const usd = pick(await res.json())
      if (!(usd > 0)) throw new Error('bad payload')
      return new Response(JSON.stringify({ usd, source: name }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=30, stale-while-revalidate=120' },
      })
    } catch (e) {
      errors.push(`${name}: ${e?.message || 'failed'}`)
    }
  }
  return new Response(JSON.stringify({ error: errors.join('; ') }), { status: 502, headers: { 'content-type': 'application/json' } })
}
