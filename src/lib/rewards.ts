import { encodePacked, keccak256, type Address } from 'viem'

// $LOOSE holder rewards. Edit these to change the program; the page reads everything from here.
export const REWARDS = {
  // Minimum $LOOSE (whole tokens) an address must hold to be eligible.
  minHolding: 1_000_000,
  // Changing the season re-rolls every holder's stock, so keep it fixed once announced.
  season: 'season-1',
  snapshot: 'To be announced on X',
  stocks: [
    { ticker: 'NVDA', name: 'NVIDIA', color: '#76b900' },
    { ticker: 'TSLA', name: 'Tesla', color: '#e82127' },
    { ticker: 'SPCX', name: 'SpaceX', color: '#9fb6cd' },
    { ticker: 'AAPL', name: 'Apple', color: '#a2aaad' },
  ],
} as const

export type Stock = (typeof REWARDS.stocks)[number]

// Random but fixed per address: keccak256(address, season) picks the stock. Anyone can
// recompute it (e.g. the team when distributing) and get the same answer.
export function stockFor(address: Address): Stock {
  const h = keccak256(encodePacked(['address', 'string'], [address, REWARDS.season]))
  return REWARDS.stocks[Number(BigInt(h) % BigInt(REWARDS.stocks.length))]
}
