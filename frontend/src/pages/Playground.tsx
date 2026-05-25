import { motion } from 'framer-motion'
import APIPlayground from '../components/APIPlayground'
import type { UseWebSocketReturn } from '../api/websocket'

interface PlaygroundProps {
  ws: UseWebSocketReturn
}

export default function Playground({ ws }: PlaygroundProps) {
  const runningInstances = ws.instances.filter((i) => i.state === 'running')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: -0.5 }}>
        Playground
      </h1>
      <p style={{ fontSize: 14, color: 'var(--mute)', marginTop: 4, marginBottom: 24 }}>
        Test your models with chat completions
      </p>
      <APIPlayground instances={runningInstances} />
    </motion.div>
  )
}
