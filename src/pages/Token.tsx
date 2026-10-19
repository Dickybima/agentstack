import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useBalance, useBytecode, useConnection, usePublicClient, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { formatUnits, isAddress, maxUint256, parseUnits, type Address } from 'viem'
import {
  PHASE,
  PONS,
  ZERO_ADDRESS,
  curveAbi,
  factoryAbi,
  progressPct,
  quoteBuy,
  quoteSell,
  tokenAbi,
  withSlippage,
  type CurveState,
} from '../lib/pons'
import { explorerAddress, explorerTx, robinhoodChain } from '../lib/chain'
import { errMsg, fmt, safeUrl, shortAddr } from '../lib/format'
import Progress from '../components/Progress'
import PriceChart from '../components/PriceChart'
import { useEthUsd, fmtSmall, fmtUsd } from '../lib/price'
import { useCurveTrades, type Trade } from '../lib/trades'
import TokenLogo from '../components/TokenLogo'

export default function TokenPage() {
  const { address: param } = useParams()
  if (!param || !isAddress(param)) return <p className="error">Invalid token address.</p>
  return <TokenView token={param} />
}

function TokenView({ token }: { token: Address }) {
  const { address: user } = useConnection()

  const launch = useReadContract({
    chainId: robinhoodChain.id,
    address: PONS.factory,
    abi: factoryAbi,
    functionName: 'getLaunchedToken',
    args: [token],
  })
  const l = launch.data
  const curve = l?.curve

  const code = useBytecode({ chainId: robinhoodChain.id, address: token })

  const meta = useReadContracts({
    chainId: robinhoodChain.id,
    contracts: [
      { address: token, abi: tokenAbi, functionName: 'name' },
      { address: token, abi: tokenAbi, functionName: 'symbol' },
      { address: token, abi: tokenAbi, functionName: 'decimals' },
      { address: token, abi: tokenAbi, functionName: 'getTokenInfo' },
      { address: token, abi: tokenAbi, functionName: 'totalSupply' },
    ],
  })
  const m = meta.data
  const [name, symbol, decimals, info, supply] = [m?.[0].result, m?.[1].result, m?.[2].result, m?.[3].result, m?.[4].result]
  const tokenDecimals = decimals ?? 18

  const isNative = !l || l.pairToken === ZERO_ADDRESS
  const pair = useReadContracts({
    chainId: robinhoodChain.id,
    query: { enabled: !isNative },
    contracts: [
      { address: l?.pairToken, abi: tokenAbi, functionName: 'symbol' },
      { address: l?.pairToken, abi: tokenAbi, functionName: 'decimals' },
    ],
  })
  const quoteSymbol = isNative ? 'ETH' : (pair.data?.[0]?.result ?? '…')
  const quoteDecimals = isNative ? 18 : (pair.data?.[1]?.result ?? 18)

  const state = useReadContracts({
    chainId: robinhoodChain.id,
    query: { enabled: !!curve, refetchInterval: 5_000 },
    contracts: [
      { address: curve, abi: curveAbi, functionName: 'getReserves' },
      { address: curve, abi: curveAbi, functionName: 'realQuoteReserve' },
      { address: curve, abi: curveAbi, functionName: 'sellableTokens' },
      { address: curve, abi: curveAbi, functionName: 'feeBps' },
      { address: curve, abi: curveAbi, functionName: 'creatorTaxBps' },
      { address: curve, abi: curveAbi, functionName: 'graduated' },
      { address: curve, abi: curveAbi, functionName: 'currentSnipeTaxBps', args: [user ?? ZERO_ADDRESS] },
    ],
  })
  const c = state.data
  const [reserves, raised, sellable, feeBps, creatorTaxBps, graduated, snipeTaxBps] = [
    c?.[0].result,
    c?.[1].result,
    c?.[2].result,
    c?.[3].result,
    c?.[4].result,
    c?.[5].result,
    c?.[6].result,
  ]

  const ethUsd = useEthUsd().data
  const history = useCurveTrades(curve, tokenDecimals, quoteDecimals)

  const retry = () => {
    launch.refetch()
    meta.refetch()
    code.refetch()
  }

  if (launch.isError || meta.isError || code.isError) {
    return (
      <Notice title="Couldn't reach Robinhood Chain" onRetry={retry}>
        The RPC didn't respond: {errMsg(launch.error ?? meta.error ?? code.error)}
      </Notice>
    )
  }
  if (launch.isPending || meta.isPending || code.isPending) return <LoadingToken />
  if (!code.data || code.data === '0x') {
    return (
      <Notice title="Token not found on Robinhood Chain">
        There's no contract at <code>{token}</code> on Robinhood Chain (4663). If this token lives on another network,
        it can't be traded here. <a href={explorerAddress(token)} target="_blank" rel="noreferrer">Check on Blockscout ↗</a>
      </Notice>
    )
  }
  if (!l?.exists) {
    return (
      <Notice title={`${name ?? 'This token'}${symbol ? ` ($${symbol})` : ''} isn't a Pons V2 launch`}>
        This page can only trade tokens launched through Pons V2.{' '}
        <a href={explorerAddress(token)} target="_blank" rel="noreferrer">View on Blockscout ↗</a>
      </Notice>
    )
  }

  const curveState: CurveState | undefined =
    reserves && sellable !== undefined && feeBps !== undefined && creatorTaxBps !== undefined
      ? {
          quoteReserve: reserves[0],
          tokenReserve: reserves[1],
          sellable,
          feeBps,
          creatorTaxBps,
          snipeTaxBps: snipeTaxBps ?? 0n,
        }
      : undefined

  const isGraduated = graduated === true || l.phase >= 2
  const pct = isGraduated ? 100 : progressPct(raised ?? 0n, l.graduationThreshold)
  // Marginal price on virtual reserves, in quote per whole token.
  const price =
    curveState && curveState.tokenReserve > 0n
      ? Number(formatUnits(curveState.quoteReserve, quoteDecimals)) / Number(formatUnits(curveState.tokenReserve, tokenDecimals))
      : 0
  const supplyNum = supply ? Number(formatUnits(supply, tokenDecimals)) : 0
  const mcap = price * supplyNum
  const usdOk = isNative && !!ethUsd
  const socials = info?.[3]

  return (
    <div className="token-page">
      <section className="card">
        <div className="token-head">
          <TokenLogo logo={info?.[1]} token={token} symbol={symbol ?? '??'} size={72} />
          <div className="token-title">
            <h1>{name}</h1>
            <span className="muted">${symbol}</span>
          </div>
          <span className="badge">{PHASE[l.phase] ?? 'Unknown'}</span>
        </div>
        {info?.[2] && <p className="desc full">{info[2]}</p>}
        {socials && (
          <div className="links">
            {[
              ['X', socials.twitter],
              ['Telegram', socials.telegram],
              ['Website', socials.website],
              ['Discord', socials.discord],
              ['Farcaster', socials.farcaster],
            ].map(([label, url]) => {
              const href = safeUrl(url)
              return href ? (
                <a key={label} href={href} target="_blank" rel="noreferrer noopener">
                  {label}
                </a>
              ) : null
            })}
          </div>
        )}

        <div className="stats">
          <div>
            <span className="muted small">Price</span>
            <strong title={`${fmtSmall(price)} ${quoteSymbol}`}>{usdOk ? fmtSmall(price * ethUsd!, '$') : `${fmtSmall(price)} ${quoteSymbol}`}</strong>
          </div>
          <div>
            <span className="muted small">Market cap</span>
            <strong title={`${mcap.toFixed(4)} ${quoteSymbol}`}>{usdOk ? fmtUsd(mcap * ethUsd!) : `${mcap.toFixed(3)} ${quoteSymbol}`}</strong>
          </div>
          <div>
            <span className="muted small">Creator tax</span>
            <strong>{l.creatorTaxBps / 100}%</strong>
          </div>
          <div>
            <span className="muted small">Buyback</span>
            <strong>{l.buybackEnabled ? 'On' : 'Off'}</strong>
          </div>
        </div>

        <PriceChart
          trades={history.trades}
          supply={supplyNum}
          ethUsd={ethUsd}
          quoteSymbol={quoteSymbol}
          quoteDecimals={quoteDecimals}
          status={history.status}
          error={history.error}
        />

        <h3>Graduation progress</h3>
        <Progress pct={pct} />
        <p className="muted small">
          {isGraduated
            ? 'Curve complete — liquidity has moved to Uniswap v4 and is permanently locked.'
            : `${fmt(raised ?? 0n, quoteDecimals)} / ${fmt(l.graduationThreshold, quoteDecimals)} ${quoteSymbol} raised (${pct.toFixed(2)}%)`}
        </p>

        <dl className="facts">
          <dt>Token</dt>
          <dd><a href={explorerAddress(token)} target="_blank" rel="noreferrer">{shortAddr(token)}</a></dd>
          <dt>Curve</dt>
          <dd><a href={explorerAddress(l.curve)} target="_blank" rel="noreferrer">{shortAddr(l.curve)}</a></dd>
          <dt>Creator</dt>
          <dd><a href={explorerAddress(l.deployer)} target="_blank" rel="noreferrer">{shortAddr(l.deployer)}</a></dd>
        </dl>

        <TradesTable
          trades={history.trades}
          status={history.status}
          error={history.error}
          tokenDecimals={tokenDecimals}
          quoteDecimals={quoteDecimals}
          quoteSymbol={quoteSymbol}
          ethUsd={usdOk ? ethUsd : undefined}
        />
      </section>

      <aside>
        {isGraduated ? (
          <div className="card">
            <h3>Token has graduated</h3>
            <p className="muted">
              Trading now happens in the Uniswap v4 pool (Pons hook). Use an aggregator or DEX that supports Robinhood
              Chain to swap this token.
            </p>
          </div>
        ) : curveState ? (
          <TradePanel
            token={token}
            curve={l.curve}
            pairToken={l.pairToken}
            isNative={isNative}
            state={curveState}
            symbol={symbol ?? ''}
            tokenDecimals={tokenDecimals}
            quoteDecimals={quoteDecimals}
            quoteSymbol={quoteSymbol}
            onDone={() => state.refetch()}
          />
        ) : (
          <div className="card skeleton" />
        )}
      </aside>
    </div>
  )
}

type TradeProps = {
  token: Address
  curve: Address
  pairToken: Address
  isNative: boolean
  state: CurveState
  symbol: string
  tokenDecimals: number
  quoteDecimals: number
  quoteSymbol: string
  onDone: () => void
}

function TradePanel(p: TradeProps) {
  const client = usePublicClient({ chainId: robinhoodChain.id })
  const qc = useQueryClient()
  const { address: user, chainId } = useConnection()
  const write = useWriteContract()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('5')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [lastTx, setLastTx] = useState<string>()

  const eth = useBalance({ chainId: robinhoodChain.id, address: user, query: { enabled: !!user && p.isNative } })
  const balances = useReadContracts({
    chainId: robinhoodChain.id,
    query: { enabled: !!user },
    contracts: [
      { address: p.token, abi: tokenAbi, functionName: 'balanceOf', args: [user ?? ZERO_ADDRESS] },
      { address: p.pairToken, abi: tokenAbi, functionName: 'balanceOf', args: [user ?? ZERO_ADDRESS] },
    ],
  })
  const tokenBal = balances.data?.[0]?.result ?? 0n
  const quoteBal = p.isNative ? (eth.data?.value ?? 0n) : (balances.data?.[1]?.result ?? 0n)

  const inDecimals = side === 'buy' ? p.quoteDecimals : p.tokenDecimals
  let parsed = 0n
  try {
    parsed = amount ? parseUnits(amount, inDecimals) : 0n
  } catch {
    parsed = 0n
  }
  const slippageBps = BigInt(Math.max(0, Math.round(Number(slippage || '0') * 100)))
  const buyQuote = side === 'buy' && parsed > 0n ? quoteBuy(p.state, parsed) : undefined
  const sellOut = side === 'sell' && parsed > 0n ? quoteSell(p.state, parsed) : undefined

  async function ensureAllowance(asset: Address, spender: Address, needed: bigint) {
    const allowance = await client!.readContract({ address: asset, abi: tokenAbi, functionName: 'allowance', args: [user!, spender] })
    if (allowance >= needed) return
    setStatus('Approve in your wallet…')
    const hash = await write.mutateAsync({ address: asset, abi: tokenAbi, functionName: 'approve', args: [spender, maxUint256] })
    setStatus('Waiting for approval…')
    await client!.waitForTransactionReceipt({ hash })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!client || !user) return setError('Connect your wallet first.')
    if (chainId !== robinhoodChain.id) return setError('Switch to Robinhood Chain first.')
    if (parsed <= 0n) return setError('Enter an amount.')
    try {
      let hash: `0x${string}`
      if (side === 'buy') {
        if (parsed > quoteBal) throw new Error(`Insufficient ${p.quoteSymbol} balance.`)
        if (!p.isNative) await ensureAllowance(p.pairToken, p.curve, parsed)
        const minOut = withSlippage(buyQuote!.tokensOut, slippageBps)
        const req = {
          address: p.curve,
          abi: curveAbi,
          functionName: 'buy',
          args: [parsed, minOut, user],
          value: p.isNative ? parsed : 0n,
        } as const
        await client.simulateContract({ ...req, account: user })
        setStatus('Confirm in your wallet…')
        hash = await write.mutateAsync(req)
      } else {
        if (parsed > tokenBal) throw new Error(`Insufficient ${p.symbol} balance.`)
        await ensureAllowance(p.token, p.curve, parsed)
        const minOut = withSlippage(sellOut!, slippageBps)
        const req = { address: p.curve, abi: curveAbi, functionName: 'sell', args: [parsed, minOut, user] } as const
        await client.simulateContract({ ...req, account: user })
        setStatus('Confirm in your wallet…')
        hash = await write.mutateAsync(req)
      }
      setStatus('Waiting for confirmation…')
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaction failed (reverted).')
      setLastTx(hash)
      setAmount('')
      p.onDone()
      balances.refetch()
      eth.refetch()
      qc.invalidateQueries({ queryKey: ['trades', p.curve] })
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setStatus('')
    }
  }

  const maxIn = side === 'buy' ? quoteBal : tokenBal
  const snipePct = Number(p.state.snipeTaxBps) / 100

  return (
    <form className="card trade" onSubmit={submit}>
      <div className="seg">
        <button type="button" className={side === 'buy' ? 'active buy' : ''} onClick={() => { setSide('buy'); setAmount('') }}>
          Buy
        </button>
        <button type="button" className={side === 'sell' ? 'active sell' : ''} onClick={() => { setSide('sell'); setAmount('') }}>
          Sell
        </button>
      </div>

      <label>
        <span className="row">
          <span>Amount ({side === 'buy' ? p.quoteSymbol : p.symbol})</span>
          {user && (
            <button type="button" className="link" onClick={() => setAmount(formatUnits(maxIn, inDecimals))}>
              Balance: {fmt(maxIn, inDecimals)}
            </button>
          )}
        </span>
        <input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
      </label>

      {side === 'buy' && (
        <div className="quick">
          {['0.001', '0.01', '0.05', '0.1'].map((v) => (
            <button type="button" key={v} onClick={() => setAmount(v)}>{v}</button>
          ))}
        </div>
      )}
      {side === 'sell' && (
        <div className="quick">
          {[25, 50, 75, 100].map((pc) => (
            <button type="button" key={pc} onClick={() => setAmount(formatUnits((tokenBal * BigInt(pc)) / 100n, p.tokenDecimals))}>
              {pc}%
            </button>
          ))}
        </div>
      )}

      <div className="quote">
        {buyQuote && (
          <>
            <div className="row"><span className="muted">You receive ≈</span><strong>{fmt(buyQuote.tokensOut, p.tokenDecimals)} {p.symbol}</strong></div>
            {buyQuote.refund > 0n && (
              <div className="row"><span className="muted">Refund (curve sold out)</span><span>{fmt(buyQuote.refund, p.quoteDecimals)} {p.quoteSymbol}</span></div>
            )}
          </>
        )}
        {sellOut !== undefined && (
          <div className="row"><span className="muted">You receive ≈</span><strong>{fmt(sellOut, p.quoteDecimals, 6)} {p.quoteSymbol}</strong></div>
        )}
        <div className="row small muted">
          <span>Fee {Number(p.state.feeBps) / 100}% · Creator tax {Number(p.state.creatorTaxBps) / 100}%</span>
        </div>
        {side === 'buy' && snipePct > 0 && <p className="warn-text small">Anti-snipe tax active: {snipePct}% (drops to 0 within seconds).</p>}
      </div>

      <label className="inline">
        Slippage %
        <input type="number" min={0} max={50} step={0.5} value={slippage} onChange={(e) => setSlippage(e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}
      {lastTx && !error && (
        <p className="ok small">
          Success! <a href={explorerTx(lastTx)} target="_blank" rel="noreferrer">View transaction</a>
        </p>
      )}

      <button className={`btn lg ${side === 'buy' ? 'primary' : 'danger'}`} disabled={!!status || !user}>
        {status || (!user ? 'Connect wallet' : side === 'buy' ? `Buy ${p.symbol}` : `Sell ${p.symbol}`)}
      </button>
    </form>
  )
}

function timeAgo(t: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function TradesTable(p: {
  trades: Trade[]
  status: 'loading' | 'ready' | 'error'
  error?: string
  tokenDecimals: number
  quoteDecimals: number
  quoteSymbol: string
  ethUsd?: number
}) {
  const rows = p.trades.slice(-50).reverse()
  return (
    <>
      <h3>Recent trades</h3>
      {p.status === 'loading' && <p className="muted small">Loading…</p>}
      {p.status === 'error' && <p className="error small">Couldn't load trades, retrying… {p.error}</p>}
      {p.status === 'ready' && rows.length === 0 && <p className="muted small">No trades yet.</p>}
      {rows.length > 0 && (
        <table className="trades">
          <thead>
            <tr><th>Type</th><th>Account</th><th>{p.ethUsd ? 'USD' : p.quoteSymbol}</th><th>Token</th><th>Age</th><th>Tx</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const q = Number(formatUnits(t.quote, p.quoteDecimals))
              return (
                <tr key={`${t.hash}-${t.logIndex}`}>
                  <td className={t.type}>{t.type === 'buy' ? 'Buy' : 'Sell'}</td>
                  <td>{shortAddr(t.account)}</td>
                  <td>{p.ethUsd ? fmtUsd(q * p.ethUsd) : fmt(t.quote, p.quoteDecimals, 5)}</td>
                  <td>{fmt(t.tokens, p.tokenDecimals)}</td>
                  <td className="muted">{timeAgo(t.time)}</td>
                  <td><a href={explorerTx(t.hash)} target="_blank" rel="noreferrer">↗</a></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}

function LoadingToken() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5_000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="card notice">
      <div className="spinner" aria-hidden />
      <p className="muted">Loading token from Robinhood Chain…</p>
      {slow && <p className="muted small">This is taking longer than usual — the public RPC may be busy.</p>}
    </div>
  )
}

function Notice({ title, children, onRetry }: { title: string; children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="card notice">
      <h3>{title}</h3>
      <p className="muted">{children}</p>
      {onRetry && (
        <button className="btn primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
