import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from './wagmi'
import App from './App'
import './styles.css'

const queryClient = new QueryClient({
  // The RPC transport already retries once; retrying here too would multiply the wait on a dead RPC.
  defaultOptions: { queries: { staleTime: 10_000, retry: 0 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)

// Keep the splash up briefly so the loading animation is visible, then fade it out.
const SPLASH_MIN_MS = 1200
const splash = document.getElementById('splash')
if (splash) {
  setTimeout(() => {
    splash.classList.add('hide')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
  }, Math.max(0, SPLASH_MIN_MS - performance.now()))
}
