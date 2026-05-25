import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import { useWebSocket } from './api/websocket'

function App() {
  const ws = useWebSocket()

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Dashboard ws={ws} />} />
            <Route path="/logs" element={<Logs ws={ws} />} />
            <Route path="/settings" element={<Settings ws={ws} />} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
