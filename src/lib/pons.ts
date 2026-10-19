import { parseAbi, type Address } from 'viem'

// Pons V2 deployment on Robinhood Chain (4663).
// Addresses and ABIs follow the public pons-client package (MIT) and Bitquery's Pons docs.
export const PONS = {
  factory: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
  launchAndBuy: '0xe33E9E479dF8802cb0866d5d05258bEc4cF62948',
  memeHook: '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044',
  feeEscrow: '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e',
  buybackVault: '0x42df2a798f82289E177311362e8f5ccC45c1219c',
} as const satisfies Record<string, Address>

// Block the factory was deployed at; launch scans never go below this.
export const FACTORY_DEPLOY_BLOCK = 26_841_846n

export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'
export const BPS = 10_000n

export const PHASE = ['Bonding curve', 'Swept', 'Graduated', 'Rescued'] as const

export const factoryAbi = parseAbi([
  'struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }',
  'struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }',
  'function launchConfigCount() view returns (uint256)',
  'function getLaunchConfig(uint256 id) view returns (LaunchConfig)',
  'function getLaunchedToken(address token) view returns (LaunchedToken)',
  'function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)',
  'function launchFee() view returns (uint256)',
  'function canLaunch(address launcher) view returns (bool)',
  'function maxCreatorTaxBps() view returns (uint16)',
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)',
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)',
])

export const launchAndBuyAbi = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)',
])

export const curveAbi = parseAbi([
  'function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)',
  'function realQuoteReserve() view returns (uint256)',
  'function sellableTokens() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)',
  'function graduated() view returns (bool)',
  'function feeBps() view returns (uint256)',
  'function creatorTaxBps() view returns (uint256)',
  'function isNativeQuote() view returns (bool)',
  'function pairToken() view returns (address)',
  'function currentSnipeTaxBps(address recipient) view returns (uint256)',
  'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)',
  'function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)',
  'event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)',
  'event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)',
])

export const tokenAbi = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)',
])

export const escrowAbi = parseAbi([
  'function balanceOf(address recipient) view returns (uint256)',
  'function claim()',
])

// ── Curve math (constant product on virtual reserves, mirrors the on-chain curve) ──

function amountOut(inAmount: bigint, reserveIn: bigint, reserveOut: bigint) {
  if (inAmount === 0n || reserveIn === 0n || reserveOut === 0n) return 0n
  return (inAmount * reserveOut) / (reserveIn + inAmount)
}

function amountIn(outAmount: bigint, reserveIn: bigint, reserveOut: bigint) {
  if (outAmount === 0n || reserveOut === 0n) return 0n
  return (outAmount * reserveIn) / (reserveOut - outAmount) + 1n
}

export type CurveState = {
  quoteReserve: bigint
  tokenReserve: bigint
  sellable: bigint
  feeBps: bigint
  creatorTaxBps: bigint
  snipeTaxBps: bigint
}

export function quoteBuy(s: CurveState, quoteIn: bigint) {
  let snipe = s.snipeTaxBps
  const maxSnipe = BPS - s.feeBps - s.creatorTaxBps - 100n
  if (snipe > maxSnipe) snipe = maxSnipe
  const totalBps = s.feeBps + s.creatorTaxBps + snipe
  let spent = quoteIn
  let tokensOut = amountOut(quoteIn - (quoteIn * totalBps) / BPS, s.quoteReserve, s.tokenReserve)
  if (tokensOut > s.sellable) {
    // Buy clears the curve: only part of quoteIn is spent, the rest is refunded.
    tokensOut = s.sellable
    const net = amountIn(s.sellable, s.quoteReserve, s.tokenReserve)
    const gross = (net * BPS + (BPS - totalBps) - 1n) / (BPS - totalBps)
    spent = gross < quoteIn ? gross : quoteIn
  }
  return { tokensOut, spent, refund: quoteIn - spent }
}

export function quoteSell(s: CurveState, tokensIn: bigint) {
  const gross = amountOut(tokensIn, s.tokenReserve, s.quoteReserve)
  return gross - (gross * (s.feeBps + s.creatorTaxBps)) / BPS
}

export const withSlippage = (amount: bigint, slippageBps: bigint) =>
  amount - (amount * slippageBps) / BPS

export function progressPct(raised: bigint, threshold: bigint) {
  if (threshold === 0n) return 0
  const r = raised > threshold ? threshold : raised
  return Number((r * 10_000n) / threshold) / 100
}
