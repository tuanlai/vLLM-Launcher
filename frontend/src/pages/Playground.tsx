import { motion } from 'framer-motion'
import type { UseWebSocketReturn } from '../api/websocket'

interface PlaygroundProps {
  ws: UseWebSocketReturn
}

export default function Playground({ ws }: PlaygroundProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: -0.5 }}>Playground</h1>
      <p style={{ fontSize: 14, color: 'var(--mute)', marginTop: 4 }}>Test your models with chat completions</p>
    </motion.div>
  )
}
