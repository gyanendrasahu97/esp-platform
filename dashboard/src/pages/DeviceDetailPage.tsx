import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Wifi, WifiOff, Activity, Copy, Check } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import LiveChart from '../components/LiveChart'
import ControlPanel from '../components/ControlPanel'
import { useMqtt } from '../hooks/useMqtt'
import api from '../api/client'
import type { Device, UiDescriptor } from '../types'

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [device, setDevice] = useState<Device | null>(null)
  const [loading, setLoading] = useState(true)
  const [tokenCopied, setTokenCopied] = useState(false)

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  useEffect(() => {
    if (!id) return
    api.get<Device>(`/devices/${id}`)
      .then(r => setDevice(r.data))
      .finally(() => setLoading(false))
  }, [id])

  const { latestData, uiDescriptor: mqttUiDescriptor, connected } = useMqtt(device?.device_token ?? null)

  // Prefer live MQTT descriptor (retain=true so it arrives immediately on subscribe),
  // fall back to DB-stored value from initial fetch
  const enrichedDescriptor = (mqttUiDescriptor ?? device?.ui_descriptor) as UiDescriptor | null

  if (loading) return (
    <div className="flex h-screen bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-slate-400">Loading...</div>
    </div>
  )

  if (!device) return (
    <div className="flex h-screen bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-slate-400">Device not found</div>
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <Link to="/" className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-3">
            <ArrowLeft size={16} /> Back
          </Link>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{device.name}</h1>
            <span className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded-full ${
              device.is_online ? 'bg-green-900/40 text-green-400' : 'bg-slate-800 text-slate-500'
            }`}>
              {device.is_online ? <Wifi size={12} /> : <WifiOff size={12} />}
              {device.is_online ? 'Online' : 'Offline'}
            </span>
            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
              connected ? 'bg-blue-900/40 text-blue-400' : 'bg-slate-800 text-slate-500'
            }`}>
              <Activity size={10} />
              {connected ? 'MQTT Live' : 'MQTT off'}
            </span>
          </div>

          <div className="mt-2 text-sm text-slate-500 flex gap-4">
            {device.firmware_version && <span>FW: {device.firmware_version}</span>}
            {device.ip_address && <span>IP: {device.ip_address}</span>}
            <button
              onClick={() => copyToken(device.device_token)}
              className="flex items-center gap-1.5 font-mono text-slate-500 hover:text-slate-300 transition-colors"
              title="Copy device token for BLE provisioning"
            >
              {tokenCopied
                ? <><Check size={11} className="text-green-400" /><span className="text-green-400">Copied!</span></>
                : <><Copy size={11} />{device.device_token}</>
              }
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Live Chart */}
          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">Live Telemetry</h2>
            <LiveChart latestData={latestData} />

            {/* Latest values */}
            {Object.keys(latestData).length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {Object.entries(latestData)
                  .filter(([k]) => !['ts', 'uptime_s', 'fw_version'].includes(k))
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <div key={k} className="bg-slate-800 rounded-lg p-3 text-center">
                      <div className="text-xs text-slate-500 mb-1">{k}</div>
                      <div className="text-lg font-bold text-white font-mono">{String(v)}</div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">Controls</h2>
            <ControlPanel
              deviceId={device.id}
              descriptor={enrichedDescriptor}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
