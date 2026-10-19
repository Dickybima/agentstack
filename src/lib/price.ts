import { useQuery } from '@tanstack/react-query'

async function fetchJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ETH/USD from our /api/price function, falling back to Coinbase directly (it allows browser CORS).
export function useEthUsd() {
  return useQuery({
    queryKey: ['eth-usd'],
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<number> => {
      try {
        const d = await fetchJson('/api/price')
        if (d?.usd > 0) return d.usd
      } catch {
        // fall through
      }
      const d = await fetchJson('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      const usd = Number(d?.data?.amount)
      if (!(usd > 0)) throw new Error('No ETH price')
      return usd
    },
  })
}

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉'

// Small prices use the "0.0₅76" convention: subscript = number of zeros after the decimal point.
export function fmtSmall(n: number, prefix = '') {
  // Axis ticks near zero come through as float noise like 5e-21; show those as plain 0.
  if (!Number.isFinite(n) || Math.abs(n) < 1e-15) return `${prefix}0`
  if (n < 0) return `-${fmtSmall(-n, prefix)}`
  if (n >= 1) return prefix + n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  if (n >= 0.01) return prefix + n.toLocaleString('en-US', { maximumSignificantDigits: 4 })
  const zeros = Math.floor(-Math.log10(n)) // e.g. 7.6e-6 → 5 zeros after "0."
  const digits = Math.round(n * 10 ** (zeros + 4)).toString().replace(/0+$/, '') || '0'
  const sub = String(zeros)
    .split('')
    .map((d) => SUBSCRIPT[Number(d)])
    .join('')
  return `${prefix}0.0${sub}${digits}`
}

export function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return '–'
  if (n < 0) return `-${fmtUsd(-n)}`
  if (n < 1) return fmtSmall(n, '$')
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}
