import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Wifi, WifiOff, Cpu, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import api from '../api/client'
import type { Device } from '../types'

export default function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding]   = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const load = async () => {
    const { data } = await api.get<Device[]>('/devices')
    setDevices(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    await api.post('/devices', { name: newName.trim() })
    setNewName('')
    setShowAdd(false)
    await load()
    setAdding(false)
  }

  const deleteDevice = async (id: string) => {
    if (!confirm('Delete this device?')) return
    await api.delete(`/devices/${id}`)
    setDevices(d => d.filter(x => x.id !== id))
  }

  if (loading) return <div className="text-slate-400 p-6">Loading devices...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Devices</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <Plus size={16} /> Add Device
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addDevice} className="mb-6 flex gap-2">
          <input
            autoFocus value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Device name (e.g. Greenhouse Sensor)"
            className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit" disabled={adding}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {adding ? '...' : 'Create'}
          </button>
          <button
            type="button" onClick={() => setShowAdd(false)}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            Cancel
          </button>
        </form>
      )}

      {devices.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Cpu size={40} className="mx-auto mb-3 opacity-40" />
          <p>No devices yet. Add your first ESP32 device above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map(device => (
            <div key={device.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${device.is_online ? 'bg-green-400' : 'bg-slate-600'}`} />
                  <h3 className="font-semibold text-white">{device.name}</h3>
                </div>
                <button
                  onClick={() => deleteDevice(device.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="text-xs text-slate-500 space-y-1 mb-4">
                <div className="flex items-center gap-1">
                  {device.is_online ? <Wifi size={12} className="text-green-400" /> : <WifiOff size={12} />}
                  <span>{device.is_online ? 'Online' : 'Offline'}</span>
                  {device.last_seen && (
                    <span className="text-slate-600 ml-1">
                      · {formatDistanceToNow(new Date(device.last_seen), { addSuffix: true })}
                    </span>
                  )}
                </div>
                {device.firmware_version && (
                  <div className="text-slate-600">FW: {device.firmware_version}</div>
                )}
                {device.ip_address && (
                  <div className="text-slate-600">IP: {device.ip_address}</div>
                )}
              </div>

              <div className="flex gap-2">
                <Link
                  to={`/devices/${device.id}`}
                  className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-white text-sm py-1.5 rounded-lg transition-colors"
                >
                  View
                </Link>
                <Link
                  to={`/editor?device=${device.id}`}
                  className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-white text-sm py-1.5 rounded-lg transition-colors"
                >
                  Edit Code
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
