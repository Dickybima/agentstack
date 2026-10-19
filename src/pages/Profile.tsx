import { useState } from 'react'
import { useConnection, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { PONS, escrowAbi } from '../lib/pons'
import { useLaunchesBy } from '../lib/launches'
import { errMsg, fmt } from '../lib/format'
import { explorerTx } from '../lib/chain'
import TokenCard from '../components/TokenCard'

export default function Profile() {
  const { address } = useConnection()
  const client = usePublicClient()
  const write = useWriteContract()
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [tx, setTx] = useState<string>()

  const fees = useReadContract({
    address: PONS.feeEscrow,
    abi: escrowAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const mine = useLaunchesBy(address)

  if (!address) return <p className="muted">Connect your wallet to see your tokens and fees.</p>

  async function claim() {
    setError('')
    try {
      setStatus('Confirm in your wallet…')
      const hash = await write.mutateAsync({ address: PONS.feeEscrow, abi: escrowAbi, functionName: 'claim' })
      setStatus('Waiting for confirmation…')
      await client!.waitForTransactionReceipt({ hash })
      setTx(hash)
      fees.refetch()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setStatus('')
    }
  }

  return (
    <>
      <section className="card fees">
        <div>
          <span className="muted small">Claimable creator fees</span>
          <strong className="big">{fees.data !== undefined ? fmt(fees.data, 18, 6) : '…'} ETH</strong>
          <span className="muted small">Curve and pool fees land in escrow once swept.</span>
        </div>
        <button className="btn primary" disabled={!!status || !fees.data} onClick={claim}>
          {status || 'Claim'}
        </button>
      </section>
      {error && <p className="error">{error}</p>}
      {tx && <p className="ok small">Claimed successfully. <a href={explorerTx(tx)} target="_blank" rel="noreferrer">View transaction</a></p>}

      <h2>Tokens you launched</h2>
      {mine.isPending && <p className="muted">Loading…</p>}
      {mine.isError && <p className="error">{errMsg(mine.error)}</p>}
      {mine.data?.length === 0 && <p className="muted">None yet.</p>}
      <div className="grid">
        {mine.data?.map((l) => <TokenCard key={l.token} launch={l} />)}
      </div>
    </>
  )
}
