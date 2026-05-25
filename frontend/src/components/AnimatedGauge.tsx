import { useEffect } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

interface AnimatedGaugeProps {
  value: number
  max: number
  label: string
  unit: string
  color?: string
}

export default function AnimatedGauge({
  value,
  max,
  label,
  unit,
  color = '#10b981',
}: AnimatedGaugeProps) {
  const springValue = useSpring(0, {
    stiffness: 80,
    damping: 20,
    mass: 0.5,
  })

  useEffect(() => {
    springValue.set(Math.min(value, max))
  }, [value, max, springValue])

  const percentage = useTransform(springValue, (v) => (v / max) * 100)
  const displayValue = useTransform(springValue, (v) => v.toFixed(1))

  // SVG arc calculation
  const radius = 80
  const strokeWidth = 10
  const cx = 100
  const cy = 100
  const startAngle = 135
  const endAngle = 405

  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    }
  }

  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(endAngle)
    const end = polarToCartesian(startAngle)
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
  }

  const bgArc = describeArc(startAngle, endAngle)

  return (
    <div className="gauge-container">
      <svg viewBox="0 0 200 200" className="gauge-svg">
        {/* Background arc */}
        <path
          d={bgArc}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <motion.path
          d={bgArc}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${radius * Math.PI * 1.5}`}
          style={{
            strokeDashoffset: useTransform(percentage, (p) => {
              const totalLength = radius * Math.PI * 1.5
              return totalLength * (1 - p / 100)
            }),
          }}
        />
        {/* Glow effect */}
        <motion.path
          d={bgArc}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 8}
          strokeLinecap="round"
          strokeDasharray={`${radius * Math.PI * 1.5}`}
          opacity={0.15}
          style={{
            strokeDashoffset: useTransform(percentage, (p) => {
              const totalLength = radius * Math.PI * 1.5
              return totalLength * (1 - p / 100)
            }),
          }}
        />
      </svg>

      <div className="gauge-content">
        <motion.span className="gauge-value" style={{ color }}>
          {displayValue}
        </motion.span>
        <span className="gauge-unit">{unit}</span>
      </div>

      <span className="gauge-label">{label}</span>

      <style>{`
        .gauge-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
        }
        .gauge-svg {
          width: 180px;
          height: 180px;
        }
        .gauge-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -60%);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .gauge-value {
          font-family: var(--font-mono);
          font-size: 32px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: -1px;
        }
        .gauge-unit {
          font-size: 12px;
          color: var(--mute);
          margin-top: 4px;
          font-family: var(--font-mono);
        }
        .gauge-label {
          font-size: 13px;
          color: var(--body);
          margin-top: 8px;
          font-weight: 500;
        }
      `}</style>
    </div>
  )
}
