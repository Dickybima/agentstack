import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useConnection, usePublicClient } from 'wagmi'
import { formatUnits, getAddress, isAddress, type Address } from 'viem'
import { robinhoodChain } from '../lib/chain'
import { LOOSE_TOKEN } from '../lib/brand'
import { tokenAbi } from '../lib/pons'
import { REWARDS, stockFor, type Stock } from '../lib/rewards'
import { errMsg, shortAddr } from '../lib/format'

function StockBadge({ stock, size = 'md' }: { stock: Stock; size?: 'md' | 'lg' }) {
  return (
    <div className={`stock stock-${size}`} style={{ ['--c' as string]: stock.color }}>
      <span className="stock-ticker">{stock.ticker}</span>
      <span className="stock-name">{stock.name}</span>
    </div>
  )
}

// Cycles through the stocks before settling on the holder's assigned one.
function Reveal({ stock }: { stock: Stock }) {
  const [i, setI] = useState(0)
  const [done, setDone] = useState(false)
  useEffect(() => {
    const target = REWARDS.stocks.findIndex((s) => s.ticker === stock.ticker)
    const total = REWARDS.stocks.length * 4 + target
    let n = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setI(n % REWARDS.stocks.length)
      if (n >= total) return setDone(true)
      n++
      timer = setTimeout(tick, 60 + n * 9)
    }
    setDone(false)
    tick()
    return () => clearTimeout(timer)
  }, [stock])
  return (
    <div className={`reveal ${done ? 'done' : ''}`}>
      <StockBadge stock={REWARDS.stocks[i]} size="lg" />
    </div>
  )
}

export default function Rewards() {
  const client = usePublicClient({ chainId: robinhoodChain.id })
  const { address: connected } = useConnection()
  const [input, setInput] = useState('')
  const [target, setTarget] = useState<Address>()

  useEffect(() => {
    if (connected && !input) setInput(connected)
  }, [connected, input])

  const check = useQuery({
    queryKey: ['loose-eligibility', target],
    enabled: !!client && !!target,
    queryFn: async () => {
      const [balance, decimals, code] = await Promise.all([
        client!.readContract({ address: LOOSE_TOKEN, abi: tokenAbi, functionName: 'balanceOf', args: [target!] }),
        client!.readContract({ address: LOOSE_TOKEN, abi: tokenAbi, functionName: 'decimals' }),
        client!.getCode({ address: target! }),
      ])
      const amount = Number(formatUnits(balance, decimals))
      const isContract = !!code && code !== '0x'
      return { amount, isContract, eligible: !isContract && amount >= REWARDS.minHolding }
    },
  })

  // Accept any casing: people paste lowercase or mis-checksummed addresses.
  const valid = isAddress(input.trim(), { strict: false })
  const r = check.data

  return (
    <div className="rewards">
      <section className="hero">
        <div className="pill-accent">$LOOSE Holder Rewards</div>
        <h1>
          Hold <span className="accent">$LOOSE</span>, get a stock.
        </h1>
        <p className="muted">
          Every eligible $LOOSE holder receives one random tokenized stock on Robinhood Chain.
        </p>
        <div className="stock-row">
          {REWARDS.stocks.map((s) => (
            <StockBadge key={s.ticker} stock={s} />
          ))}
        </div>
      </section>

      <section className="card checker">
        <h2>Check your eligibility</h2>
        <form
          className="check-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) setTarget(getAddress(input.trim().toLowerCase()))
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a wallet address (0x…)" spellCheck={false} />
          <button className="btn primary lg" disabled={!valid || check.isFetching}>
            {check.isFetching ? 'Checking…' : 'Check'}
          </button>
        </form>
        {!connected && <p className="muted small">Tip: connect your wallet to fill in your address automatically.</p>}
        {input && !valid && <p className="error small">That doesn't look like a wallet address.</p>}

        {check.isError && <p className="error">Couldn't read balances: {errMsg(check.error)}</p>}

        {r && target && (
          <div className={`result ${r.eligible ? 'yes' : 'no'}`}>
            <div className="result-head">
              <span className="result-icon">{r.eligible ? '✓' : '✕'}</span>
              <div>
                <strong>{r.eligible ? 'You are eligible!' : 'Not eligible yet'}</strong>
                <span className="muted small">{shortAddr(target)}</span>
              </div>
            </div>
            <dl className="facts">
              <dt>Your $LOOSE</dt>
              <dd>{r.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
              <dt>Minimum to qualify</dt>
              <dd>{REWARDS.minHolding.toLocaleString('en-US')}</dd>
            </dl>
            {r.eligible ? (
              <>
                <p className="muted small">Your random stock:</p>
                <Reveal stock={stockFor(target)} />
              </>
            ) : r.isContract ? (
              <p className="muted">Contract addresses (pools, curves, vaults) are excluded from rewards.</p>
            ) : (
              <p className="muted">
                Hold at least {REWARDS.minHolding.toLocaleString('en-US')} $LOOSE at the snapshot to qualify.{' '}
                <Link to={`/token/${LOOSE_TOKEN}`}>Buy $LOOSE →</Link>
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card rules">
        <h3>How it works</h3>
        <ol>
          <li>Hold at least {REWARDS.minHolding.toLocaleString('en-US')} $LOOSE in your own wallet.</li>
          <li>Each eligible wallet is assigned one stock: {REWARDS.stocks.map((s) => s.ticker).join(', ')}. The pick is random but fixed per wallet.</li>
          <li>Snapshot: {REWARDS.snapshot}. Balances are counted at the snapshot, not today.</li>
          <li>Rewards are sent as tokenized stocks on Robinhood Chain by the LOOSE AGENT team after the snapshot.</li>
        </ol>
        <p className="muted small">
          Checking is free and read-only — this page never asks you to sign or send anything. Tokenized stocks are subject to
          availability and local rules. Not financial advice.
        </p>
      </section>
    </div>
  )
}
