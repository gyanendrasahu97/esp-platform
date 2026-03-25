import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import api from '../../api/client'
import type { Device } from '../../types'

interface Props {
  firmwareId: string | null   // DB UUID from build result - required for OTA push
}

export default function FlashOta({ firmwareId }: Props) {
  const [devices, setDevices]     = useState<Device[]>([])
  const [selected, setSelected]   = useState('')
  const [pushing, setPushing]     = useState(false)
  const [status, setStatus]       = useState('')

  useEffect(() => {
    api.get<Device[]>('/devices').then(r => {
      const online = r.data.filter(d => d.is_online)
      setDevices(online)
      if (online.length === 1) setSelected(online[0].id)
    })
  }, [])

  const push = async () => {
    if (!selected || !firmwareId) return
    setPushing(true)
    setStatus('')
    try {
      await api.post(`/ota/${selected}/push`, { firmware_id: firmwareId })
      setStatus('OTA push sent! Device will update shortly.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatus(`Error: ${msg || 'Push failed'}`)
    } finally {
      setPushing(false)
    }
  }

  if (!firmwareId) {
    return (
      <button disabled className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-slate-500 text-sm cursor-not-allowed">
        <Upload size={14} /> Flash OTA
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
      >
        <option value="">Select online device...</option>
        {devices.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>

      <button
        onClick={push}
        disabled={!selected || pushing}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
      >
        <Upload size={14} />
        {pushing ? 'Pushing...' : 'Flash OTA'}
      </button>

      {status && (
        <span className={`text-sm ${status.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
          {status}
        </span>
      )}
    </div>
  )
}
