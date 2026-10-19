import { NavLink, Route, Routes, Link } from 'react-router-dom'
import ConnectButton from './components/ConnectButton'
import Home from './pages/Home'
import Create from './pages/Create'
import TokenPage from './pages/Token'
import Profile from './pages/Profile'
import { BRAND, LOOSE_TOKEN, X_URL } from './lib/brand'

export default function App() {
  return (
    <>
      <header className="nav">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="" className="brand-mark" /> {BRAND}
        </Link>
        <nav>
          <NavLink to="/" end>Explore</NavLink>
          <NavLink to="/create">Launch</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          <NavLink to={`/token/${LOOSE_TOKEN}`} className="nav-token">
            $LOOSE
          </NavLink>
        </nav>
        <div className="nav-actions">
          <a className="icon-link" href={X_URL} target="_blank" rel="noreferrer noopener" aria-label="LOOSE AGENT on X" title="Follow us on X">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
              />
            </svg>
          </a>
          <ConnectButton />
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/token/:address" element={<TokenPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
      <footer className="footer">
        Powered by <a href="https://docs.ponsfamily.com/v2" target="_blank" rel="noreferrer">Pons V2</a> on Robinhood Chain.
        Meme tokens are highly speculative — DYOR.
      </footer>
    </>
  )
}
