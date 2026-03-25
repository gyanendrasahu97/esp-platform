import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format } from 'date-fns'

interface DataPoint {
  ts: string
  [key: string]: unknown
}

interface Props {
  latestData: Record<string, unknown>
  keys?: string[]   // Which keys to plot (defaults to numeric fields)
}

const COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa']
const MAX_POINTS = 60

export default function LiveChart({ latestData, keys }: Props) {
  const [history, setHistory] = useState<DataPoint[]>([])
  const lastRef = useRef<string>('')

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

  const plotKeys = keys ?? Object.keys(latestData).filter(
    k => typeof latestData[k] === 'number' && k !== 'ts' && k !== 'uptime_s'
  )

  if (history.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
        Waiting for data...
      </div>
    )
  }

  return (
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
        {plotKeys.map((key, i) => (
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
  )
}
