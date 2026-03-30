import { useEffect, useRef, useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format } from 'date-fns'

interface DataPoint {
  ts: string
  [key: string]: unknown
}

interface Props {
  latestData: Record<string, unknown>
}

const COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa']
const MAX_POINTS = 60

export default function LiveChart({ latestData }: Props) {
  const [history, setHistory] = useState<DataPoint[]>([])
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set())
  const lastRef = useRef<string>('')

  // Auto-detect numeric keys
  const availableKeys = useMemo(() => {
    return Object.keys(latestData).filter(
      k => typeof latestData[k] === 'number' && k !== 'ts' && k !== 'uptime_s'
    )
  }, [latestData])

  // Initially select all if activeKeys is empty
  useEffect(() => {
    if (activeKeys.size === 0 && availableKeys.length > 0) {
      setActiveKeys(new Set(availableKeys))
    }
  }, [availableKeys, activeKeys.size])

  useEffect(() => {
    const str = JSON.stringify(latestData)
    if (str === lastRef.current || Object.keys(latestData).length === 0) return
    lastRef.current = str

    const point: DataPoint = {
      ts: format(new Date(), 'HH:mm:ss'),
      ...latestData,
    }
    setHistory(h => [...h.slice(-(MAX_POINTS - 1)), point])
  }, [latestData])

  const toggleKey = (key: string) => {
    const next = new Set(activeKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setActiveKeys(next)
  }

  if (history.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
        Waiting for data...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {availableKeys.map((key, i) => {
          const isActive = activeKeys.has(key)
          return (
            <button
              key={key}
              onClick={() => toggleKey(key)}
              style={{
                borderColor: isActive ? COLORS[i % COLORS.length] : 'transparent',
                backgroundColor: isActive ? `${COLORS[i % COLORS.length]}20` : '#1e293b',
                color: isActive ? COLORS[i % COLORS.length] : '#94a3b8'
              }}
              className="px-3 py-1 rounded-full text-xs font-semibold border"
            >
              {key}
            </button>
          )
        })}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="ts" tick={{ fill: '#64748b', fontSize: 11 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          {availableKeys.filter(k => activeKeys.has(k)).map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
