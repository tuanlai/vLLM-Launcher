import { useMemo } from 'react'
import { motion } from 'framer-motion'
import APIPlayground from '../components/APIPlayground'
import { useI18n } from '../i18n'
import type { UseWebSocketReturn } from '../api/websocket'

interface PlaygroundProps {
  ws: UseWebSocketReturn
}

export default function Playground({ ws }: PlaygroundProps) {
  const { t } = useI18n()
  const runningInstances = useMemo(
    () => ws.instances.filter((i) => i.state === 'running'),
    [ws.instances]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: -0.5 }}>
        {t('playground.title')}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--mute)', marginTop: 4, marginBottom: 24 }}>
        {t('playground.subtitle')}
      </p>
      <APIPlayground instances={runningInstances} />
    </motion.div>
  )
}
