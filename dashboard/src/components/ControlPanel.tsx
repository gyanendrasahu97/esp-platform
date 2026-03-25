import { useState } from 'react'
import { Power, Play, Sliders } from 'lucide-react'
import api from '../api/client'
import type { UiControl, UiDescriptor } from '../types'

interface Props {
  deviceId: string
  descriptor: UiDescriptor | null
}

export default function ControlPanel({ deviceId, descriptor }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [sending, setSending] = useState<string | null>(null)

  const sendCommand = async (action: string, value: unknown) => {
    setSending(action)
    try {
      await api.post(`/devices/${deviceId}/command`, { action, value })
    } catch (err) {
      console.error('Command failed', err)
    } finally {
      setSending(null)
    }
  }

  if (!descriptor?.controls?.length) {
    return (
      <div className="text-slate-500 text-sm p-4">
        No controls defined. The device will publish its UI descriptor on connect.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {descriptor.controls.map((ctrl, i) => (
        <ControlWidget
          key={i}
          ctrl={ctrl}
          value={values[ctrl.action || ctrl.key || i]}
          sending={sending === ctrl.action}
          onChange={(v) => {
            const k = ctrl.action || ctrl.key || String(i)
            setValues(prev => ({ ...prev, [k]: v }))
          }}
          onSend={(v) => ctrl.action && sendCommand(ctrl.action, v)}
        />
      ))}
    </div>
  )
}

function ControlWidget({
  ctrl, value, sending, onChange, onSend,
}: {
  ctrl: UiControl
  value: unknown
  sending: boolean
  onChange: (v: unknown) => void
  onSend: (v: unknown) => void
}) {
  switch (ctrl.type) {
    case 'switch': {
      const on = Boolean(value)
      return (
        <button
          onClick={() => { const next = !on; onChange(next); onSend(next) }}
          disabled={sending}
          className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors ${
            on
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
          } disabled:opacity-50`}
        >
          <Power size={16} />
          {ctrl.label}
          <span className="ml-auto text-xs opacity-70">{on ? 'ON' : 'OFF'}</span>
        </button>
      )
    }

    case 'button':
      return (
        <button
          onClick={() => onSend(true)}
          disabled={sending}
          className="flex items-center gap-2 p-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Play size={16} />
          {ctrl.label}
        </button>
      )

    case 'slider': {
      const min  = ctrl.min  ?? 0
      const max  = ctrl.max  ?? 100
      const step = ctrl.step ?? 1
      const val  = (value as number) ?? min
      return (
        <div className="p-3 rounded-lg border border-slate-700 bg-slate-800 col-span-2">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 text-sm text-slate-300"><Sliders size={14} />{ctrl.label}</span>
            <span className="text-sm text-blue-400 font-mono">{val}{ctrl.unit ?? ''}</span>
          </div>
          <input
            type="range" min={min} max={max} step={step} value={val}
            onChange={e => onChange(Number(e.target.value))}
            onMouseUp={() => onSend(val)}
            onTouchEnd={() => onSend(val)}
            className="w-full accent-blue-500"
          />
        </div>
      )
    }

    case 'sensor':
    case 'gauge':
      return (
        <div className="p-3 rounded-lg border border-slate-700 bg-slate-800">
          <div className="text-xs text-slate-500 mb-1">{ctrl.label}</div>
          <div className="text-2xl font-bold text-white font-mono">
            {value !== undefined ? String(value) : '--'}
            {ctrl.unit && <span className="text-sm text-slate-400 ml-1">{ctrl.unit}</span>}
          </div>
        </div>
      )

    default:
      return null
  }
}
