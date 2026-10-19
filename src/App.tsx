import { NavLink, Route, Routes, Link } from 'react-router-dom'
import ConnectButton from './components/ConnectButton'
import Home from './pages/Home'
import Create from './pages/Create'
import TokenPage from './pages/Token'
import Profile from './pages/Profile'

export const BRAND = 'LooseAgent'

export default function App() {
  return (
    <>
      <header className="nav">
        <Link to="/" className="brand">
          <span className="brand-mark">▲</span> {BRAND}
        </Link>
        <nav>
          <NavLink to="/" end>Explore</NavLink>
          <NavLink to="/create">Launch</NavLink>
          <NavLink to="/profile">Profile</NavLink>
        </nav>
        <ConnectButton />
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/token/:address" element={<TokenPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<p className="muted">Halaman tidak ditemukan.</p>} />
        </Routes>
      </main>
      <footer className="footer">
        Powered by <a href="https://docs.ponsfamily.com/v2" target="_blank" rel="noreferrer">Pons V2</a> on Robinhood Chain.
        Token meme sangat spekulatif — DYOR.
      </footer>
    </>
  )
}
