import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConnection, usePublicClient, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { parseEther, parseEventLogs, toHex, type Address } from 'viem'
import { PONS, ZERO_ADDRESS, factoryAbi, launchAndBuyAbi, withSlippage } from '../lib/pons'
import { robinhoodChain } from '../lib/chain'
import { errMsg, fmt, logoUrl } from '../lib/format'
import TokenLogo from '../components/TokenLogo'

const factory = { address: PONS.factory, abi: factoryAbi } as const

export default function Create() {
  const nav = useNavigate()
  const client = usePublicClient()
  const { address, chainId } = useConnection()
  const write = useWriteContract()

  const [form, setForm] = useState({
    name: '',
    symbol: '',
    logo: '',
    description: '',
    twitter: '',
    telegram: '',
    website: '',
    discord: '',
    farcaster: '',
    taxPct: '0',
    buyback: false,
    initialBuy: '0.01',
    slippagePct: '5',
  })
  const [configId, setConfigId] = useState<bigint | undefined>()
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const base = useReadContracts({
    contracts: [
      { ...factory, functionName: 'launchConfigCount' },
      { ...factory, functionName: 'launchFee' },
      { ...factory, functionName: 'maxCreatorTaxBps' },
    ],
  })
  const [count, launchFee, maxTaxBps] = [base.data?.[0].result, base.data?.[1].result, base.data?.[2].result]

  const configs = useReadContracts({
    query: { enabled: count !== undefined },
    contracts: Array.from({ length: Number(count ?? 0n) }, (_, i) => ({
      ...factory,
      functionName: 'getLaunchConfig' as const,
      args: [BigInt(i)] as const,
    })),
  })
  const enabledConfigs = (configs.data ?? [])
    .map((r, i) => ({ id: BigInt(i), cfg: r.result }))
    .filter((c) => c.cfg?.enabled)
  const selectedId = configId ?? enabledConfigs[0]?.id
  const selected = enabledConfigs.find((c) => c.id === selectedId)?.cfg

  const canLaunch = useReadContract({
    ...factory,
    functionName: 'canLaunch',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const maxTaxPct = maxTaxBps !== undefined ? Number(maxTaxBps) / 100 : 0
  const busy = !!status

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!client || !address) return setError('Hubungkan wallet dulu.')
    if (chainId !== robinhoodChain.id) return setError('Pindah ke Robinhood Chain dulu.')
    if (selectedId === undefined || launchFee === undefined) return setError('Konfigurasi launch belum termuat.')
    if (!form.name.trim() || !form.symbol.trim()) return setError('Nama dan simbol wajib diisi.')

    try {
      const taxBps = Math.round(Number(form.taxPct) * 100)
      if (!(taxBps >= 0) || taxBps > Number(maxTaxBps ?? 0)) throw new Error(`Creator tax maksimal ${maxTaxPct}%`)
      const quoteIn = parseEther(form.initialBuy || '0')
      const slippageBps = BigInt(Math.round(Number(form.slippagePct) * 100))

      setStatus('Menyiapkan launch…')
      const expectedEconomics = await client.readContract({
        ...factory,
        functionName: 'previewLaunchEconomics',
        args: [selectedId, ZERO_ADDRESS],
      })
      const params = {
        name: form.name.trim(),
        symbol: form.symbol.trim().toUpperCase(),
        logo: form.logo.trim(),
        description: form.description.trim(),
        socials: {
          twitter: form.twitter.trim(),
          telegram: form.telegram.trim(),
          discord: form.discord.trim(),
          website: form.website.trim(),
          farcaster: form.farcaster.trim(),
        },
        creatorFeeRecipient: address,
        creatorTaxBps: taxBps,
        buybackEnabled: form.buyback,
        expectedEconomics,
        salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
      }

      let hash: `0x${string}`
      if (quoteIn > 0n) {
        // Simulate first to learn tokensOut, then protect the dev buy with slippage.
        const exemptions: Address[] = [address]
        const args = [params, selectedId, ZERO_ADDRESS, quoteIn, 0n, address, exemptions] as const
        const value = launchFee + quoteIn
        const sim = await client.simulateContract({
          address: PONS.launchAndBuy,
          abi: launchAndBuyAbi,
          functionName: 'launchAndBuy',
          args,
          value,
          account: address,
        })
        const minOut = withSlippage(sim.result[2], slippageBps)
        setStatus('Konfirmasi transaksi di wallet…')
        hash = await write.mutateAsync({
          address: PONS.launchAndBuy,
          abi: launchAndBuyAbi,
          functionName: 'launchAndBuy',
          args: [params, selectedId, ZERO_ADDRESS, quoteIn, minOut, address, exemptions],
          value,
        })
      } else {
        await client.simulateContract({
          ...factory,
          functionName: 'launchToken',
          args: [params, selectedId, ZERO_ADDRESS],
          value: launchFee,
          account: address,
        })
        setStatus('Konfirmasi transaksi di wallet…')
        hash = await write.mutateAsync({
          ...factory,
          functionName: 'launchToken',
          args: [params, selectedId, ZERO_ADDRESS],
          value: launchFee,
        })
      }

      setStatus('Menunggu konfirmasi on-chain…')
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaksi gagal (reverted).')
      const [launched] = parseEventLogs({ abi: factoryAbi, eventName: 'TokenLaunched', logs: receipt.logs })
      nav(launched ? `/token/${launched.args.token}` : '/')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setStatus('')
    }
  }

  return (
    <div className="create">
      <form className="card form" onSubmit={submit}>
        <h2>Launch token baru</h2>

        <div className="two">
          <label>
            Nama
            <input value={form.name} onChange={set('name')} maxLength={32} placeholder="Robin Agent" required />
          </label>
          <label>
            Simbol
            <input value={form.symbol} onChange={set('symbol')} maxLength={10} placeholder="RAGENT" required />
          </label>
        </div>

        <label>
          URL logo <span className="muted">(https:// atau ipfs://)</span>
          <input value={form.logo} onChange={set('logo')} placeholder="https://… /logo.png" />
        </label>

        <label>
          Deskripsi
          <textarea value={form.description} onChange={set('description')} rows={3} maxLength={500} />
        </label>

        <details>
          <summary>Sosial (opsional)</summary>
          <div className="two">
            <label>X / Twitter<input value={form.twitter} onChange={set('twitter')} placeholder="https://x.com/…" /></label>
            <label>Telegram<input value={form.telegram} onChange={set('telegram')} placeholder="https://t.me/…" /></label>
            <label>Website<input value={form.website} onChange={set('website')} placeholder="https://…" /></label>
            <label>Discord<input value={form.discord} onChange={set('discord')} /></label>
            <label>Farcaster<input value={form.farcaster} onChange={set('farcaster')} /></label>
          </div>
        </details>

        {enabledConfigs.length > 1 && (
          <label>
            Konfigurasi curve
            <select value={selectedId?.toString()} onChange={(e) => setConfigId(BigInt(e.target.value))}>
              {enabledConfigs.map((c) => (
                <option key={c.id.toString()} value={c.id.toString()}>
                  #{c.id.toString()} · graduate di {fmt(c.cfg!.graduationThreshold)} ETH · fee {Number(c.cfg!.curveFeeBps) / 100}%
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="two">
          <label>
            Creator tax (%) <span className="muted">maks {maxTaxPct}%</span>
            <input type="number" min={0} max={maxTaxPct} step={0.1} value={form.taxPct} onChange={set('taxPct')} />
          </label>
          <label>
            Dev buy awal (ETH)
            <input type="number" min={0} step="any" value={form.initialBuy} onChange={set('initialBuy')} />
          </label>
        </div>

        <div className="two">
          <label className="check">
            <input type="checkbox" checked={form.buyback} onChange={set('buyback')} />
            Aktifkan buyback (fee dipakai beli balik, vesting 5 tahun)
          </label>
          <label>
            Slippage dev buy (%)
            <input type="number" min={0} max={50} step={0.5} value={form.slippagePct} onChange={set('slippagePct')} />
          </label>
        </div>

        {canLaunch.data === false && <p className="error">Alamat ini belum bisa launch (canLaunch = false).</p>}
        {error && <p className="error">{error}</p>}

        <button className="btn primary lg" type="submit" disabled={busy || !address}>
          {status || (address ? 'Launch' : 'Hubungkan wallet untuk launch')}
        </button>
      </form>

      <aside className="card preview">
        <h3>Preview</h3>
        <div className="token-head">
          <TokenLogo src={logoUrl(form.logo)} symbol={form.symbol || '??'} size={56} />
          <div className="token-title">
            <strong>{form.name || 'Nama token'}</strong>
            <span className="muted">${form.symbol.toUpperCase() || 'SIMBOL'}</span>
          </div>
        </div>
        {form.description && <p className="desc">{form.description}</p>}
        <dl className="facts">
          <dt>Supply</dt>
          <dd>{selected ? fmt(selected.supply) : '1B'}</dd>
          <dt>Graduate di</dt>
          <dd>{selected ? `${fmt(selected.graduationThreshold)} ETH` : '…'}</dd>
          <dt>Fee curve</dt>
          <dd>{selected ? `${Number(selected.curveFeeBps) / 100}%` : '…'}</dd>
          <dt>Biaya launch</dt>
          <dd>{launchFee !== undefined ? `${fmt(launchFee, 18, 6)} ETH` : '…'}</dd>
          <dt>Anti-snipe</dt>
          <dd>Tax 99% → 0% dalam 5 detik</dd>
        </dl>
        <p className="muted small">
          Setelah curve habis terjual, token otomatis pindah ke pool Uniswap v4 dengan likuiditas terkunci permanen.
        </p>
      </aside>
    </div>
  )
}
