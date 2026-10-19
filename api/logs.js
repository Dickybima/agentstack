// Proxy for Blockscout's etherscan-style logs API (includes timestamps), used for trade history.
// GET /api/logs?address=0x…&fromBlock=123
const HOSTS = ['https://robinhoodchain.blockscout.com', 'https://explorer.mainnet.chain.robinhood.com']

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address') ?? ''
  const fromBlock = searchParams.get('fromBlock') ?? '0'
  const toBlock = searchParams.get('toBlock') ?? 'latest'
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^\d+$/.test(fromBlock) || !/^(\d+|latest)$/.test(toBlock)) {
    return json({ error: 'bad params' }, 400)
  }

  const errors = []
  for (const host of HOSTS) {
    const url = `${host}/api?module=logs&action=getLogs&address=${address}&fromBlock=${fromBlock}&toBlock=${toBlock}`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // status "0" with "No logs found" is a valid empty answer.
      if (Array.isArray(data?.result)) return json({ source: new URL(host).host, result: data.result })
      throw new Error(data?.message || 'unexpected response')
    } catch (e) {
      errors.push(`${new URL(host).host}: ${e?.name === 'TimeoutError' ? 'timeout' : e?.message || 'failed'}`)
    }
  }
  return json({ error: errors.join('; ') }, 502)
}
