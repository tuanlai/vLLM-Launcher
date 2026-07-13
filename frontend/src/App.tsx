import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import Instances from './pages/Instances'
import Logs from './pages/Logs'
import Playground from './pages/Playground'
import Settings from './pages/Settings'
import UsageStats from './pages/UsageStats'
import { useWebSocket } from './api/websocket'

function App() {
  const ws = useWebSocket()

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <AnimatePresence mode="wait">
          <Routes>
              <Route path="/" element={<ErrorBoundary><Dashboard ws={ws} /></ErrorBoundary>} />
              <Route path="/instances" element={<ErrorBoundary><Instances ws={ws} /></ErrorBoundary>} />
              <Route path="/logs" element={<ErrorBoundary><Logs ws={ws} /></ErrorBoundary>} />
              <Route path="/playground" element={<ErrorBoundary><Playground ws={ws} /></ErrorBoundary>} />
              <Route path="/usage" element={<ErrorBoundary><UsageStats /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            </Routes>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
