import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isAddress } from 'viem'
import { useLaunches } from '../lib/launches'
import TokenCard from '../components/TokenCard'
import { errMsg } from '../lib/format'

type Filter = 'all' | 'curve' | 'graduated'

export default function Home() {
  const q = useLaunches()
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const all = q.data?.pages.flatMap((p) => p.launches) ?? []
  const term = search.trim().toLowerCase()
  const launches = all.filter((l) => {
    if (filter === 'curve' && l.graduated) return false
    if (filter === 'graduated' && !l.graduated) return false
    if (!term) return true
    return l.name.toLowerCase().includes(term) || l.symbol.toLowerCase().includes(term) || l.token.toLowerCase() === term
  })

  return (
    <>
      <section className="hero">
        <h1>
          Launch a token in <span className="accent">one click</span>.
        </h1>
        <p className="muted">
          ETH bonding curves on Pons V2 that auto-graduate to Uniswap v4 pools with permanently locked liquidity. On
          Robinhood Chain.
        </p>
        <div className="hero-actions">
          <Link to="/create" className="btn primary lg">
            Launch token
          </Link>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (isAddress(search.trim())) nav(`/token/${search.trim()}`)
            }}
          >
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, symbol, or paste a token address" />
          </form>
        </div>
      </section>

      <div className="tabs">
        {(['all', 'curve', 'graduated'] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Newest' : f === 'curve' ? 'On bonding curve' : 'Graduated'}
          </button>
        ))}
      </div>

      {q.isPending && <div className="grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card skeleton" />)}</div>}
      {q.isError && <p className="error">Failed to load launches: {errMsg(q.error)}</p>}
      {q.isSuccess && launches.length === 0 && <p className="muted">No matching tokens yet.</p>}

      <div className="grid">
        {launches.map((l) => (
          <TokenCard key={l.token} launch={l} />
        ))}
      </div>

      {q.hasNextPage && (
        <div className="center">
          <button className="btn ghost" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  )
}
