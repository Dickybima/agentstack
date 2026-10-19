// Vercel serverless JSON-RPC proxy for Robinhood Chain.
// Browsers call /api/rpc (same origin, no CORS); this forwards to the first upstream that answers.
// GET /api/rpc probes every upstream and reports which ones work.
const UPSTREAMS = [
  // Optional private RPC (Alchemy, QuickNode, …) set in Vercel env.
  process.env.RPC_URL && { url: process.env.RPC_URL, batch: true },
  { url: 'https://rpc.mainnet.chain.robinhood.com', batch: true },
  { url: 'https://robinhoodchain.blockscout.com/api/eth-rpc', batch: false },
  { url: 'https://explorer.mainnet.chain.robinhood.com/api/eth-rpc', batch: false },
  { url: 'https://rpc.solidrpc.io/public/evm/4663', batch: true },
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
const TIMEOUT_MS = 7_000

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const host = (url) => new URL(url).host

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  // A whole-request JSON-RPC error (e.g. rate limit) means "try the next upstream".
  if (!Array.isArray(data) && data?.error && data.id == null) throw new Error(data.error.message || 'rpc error')
  return data
}

// Upstreams without batch support get the calls one by one, in parallel.
async function forward(upstream, payload) {
  if (!Array.isArray(payload) || upstream.batch) return post(upstream.url, payload)
  return Promise.all(payload.map((call) => post(upstream.url, call)))
}

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

  const errors = []
  for (const upstream of UPSTREAMS) {
    try {
      return json(await forward(upstream, payload))
    } catch (e) {
      errors.push(`${host(upstream.url)}: ${e?.name === 'TimeoutError' ? 'timeout' : e?.message || 'fetch failed'}`)
    }
  }
  return json(
    { jsonrpc: '2.0', id: null, error: { code: -32603, message: `All RPC upstreams failed — ${errors.join('; ')}` } },
    502,
  )
}

export async function GET() {
  const results = await Promise.all(
    UPSTREAMS.map(async (u) => {
      const t0 = Date.now()
      try {
        const r = await post(u.url, { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
        return { host: host(u.url), ok: !!r?.result, block: r?.result ? parseInt(r.result, 16) : null, ms: Date.now() - t0, error: r?.error?.message }
      } catch (e) {
        return { host: host(u.url), ok: false, ms: Date.now() - t0, error: e?.name === 'TimeoutError' ? 'timeout' : e?.message || 'fetch failed' }
      }
    }),
  )
  return json({ ok: results.some((r) => r.ok), upstreams: results })
}
