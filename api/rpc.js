// Vercel serverless JSON-RPC proxy for Robinhood Chain.
// Browsers call /api/rpc (same origin, no CORS); this forwards to the first upstream that answers.
const UPSTREAMS = [
  process.env.RPC_URL, // optional private RPC (Alchemy, QuickNode, …) set in Vercel env
  'https://rpc.mainnet.chain.robinhood.com',
  'https://rpc.solidrpc.io/public/evm/4663',
].filter(Boolean)

const ALLOWED = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_call',
  'eth_getLogs',
  'eth_getCode',
  'eth_getBalance',
  'eth_getBlockByNumber',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getTransactionCount',
  'net_version',
])

const MAX_BODY = 200_000
const TIMEOUT_MS = 8_000

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export async function POST(request) {
  const text = await request.text()
  if (text.length > MAX_BODY) return json({ error: 'payload too large' }, 413)

  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
  }
  const calls = Array.isArray(payload) ? payload : [payload]
  if (calls.length === 0 || calls.length > 100 || calls.some((c) => !ALLOWED.has(c?.method))) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32601, message: 'Method not allowed' } }, 400)
  }

  let lastError = 'no upstream configured'
  for (const url of UPSTREAMS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: text,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        lastError = `${new URL(url).host} returned ${res.status}`
        continue
      }
      return new Response(await res.text(), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    } catch (e) {
      lastError = `${new URL(url).host}: ${e?.name === 'TimeoutError' ? 'timeout' : e?.message || 'fetch failed'}`
    }
  }
  return json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: `All RPC upstreams failed (${lastError})` } }, 502)
}

export function GET() {
  return json({ ok: true, upstreams: UPSTREAMS.map((u) => new URL(u).host) })
}
