import { Link } from 'react-router-dom'
import type { Launch } from '../lib/launches'
import { ZERO_ADDRESS, progressPct } from '../lib/pons'
import { fmt, logoUrl, shortAddr } from '../lib/format'
import Progress from './Progress'
import TokenLogo from './TokenLogo'

export default function TokenCard({ launch }: { launch: Launch }) {
  const pct = launch.graduated ? 100 : progressPct(launch.raised, launch.threshold)
  const isEth = launch.pairToken === ZERO_ADDRESS
  return (
    <Link to={`/token/${launch.token}`} className="card token-card">
      <div className="token-head">
        <TokenLogo src={logoUrl(launch.logo)} symbol={launch.symbol} />
        <div className="token-title">
          <strong>{launch.name}</strong>
          <span className="muted">${launch.symbol}</span>
        </div>
        {launch.graduated && <span className="badge">Graduated</span>}
      </div>
      {launch.description && <p className="desc">{launch.description}</p>}
      <Progress pct={pct} />
      <div className="row muted small">
        <span>{isEth ? `${fmt(launch.raised)} / ${fmt(launch.threshold)} ETH` : `${pct.toFixed(1)}%`}</span>
        <span>by {shortAddr(launch.deployer)}</span>
      </div>
    </Link>
  )
}
