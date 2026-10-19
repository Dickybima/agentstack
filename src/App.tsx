import { NavLink, Route, Routes, Link } from 'react-router-dom'
import ConnectButton from './components/ConnectButton'
import Home from './pages/Home'
import Create from './pages/Create'
import TokenPage from './pages/Token'
import Profile from './pages/Profile'
import { BRAND, LOOSE_TOKEN } from './lib/brand'


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
        <ConnectButton />
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
