import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Wifi, WifiOff, Activity, Copy, Check, Layers, Terminal, Trash2 } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState<'telemetry' | 'logs'>('telemetry')
  const logsEndRef = useRef<HTMLDivElement>(null)

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

  const { latestData, uiDescriptor: mqttUiDescriptor, connected, publish, logs, clearLogs, deviceOnline } = useMqtt(device?.device_token ?? null)

  const enrichedDescriptor = (mqttUiDescriptor ?? device?.ui_descriptor) as UiDescriptor | null

  useEffect(() => {
    if (activeTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, activeTab])

  const units = useMemo(() => {
    const map: Record<string, string> = {}
    if (enrichedDescriptor?.controls) {
      enrichedDescriptor.controls.forEach((ctrl) => {
        if (ctrl.key && ctrl.unit) {
          map[ctrl.key] = ctrl.unit
        }
      })
    }
    return map
  }, [enrichedDescriptor])

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

  const isOnline = connected ? deviceOnline : device.is_online

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-y-auto p-6">
        <div className="mb-6 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <Link to="/" className="flex items-center gap-1 text-slate-400 hover:text-white text-sm">
              <ArrowLeft size={16} /> Back
            </Link>
            <Link
              to={`/devices/${device?.id}/builder`}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
            >
              <Layers size={14} /> Builder
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{device.name}</h1>
            <span className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded-full ${
              isOnline ? 'bg-green-900/40 text-green-400' : 'bg-slate-800 text-slate-500'
            }`}>
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isOnline ? 'Online' : 'Offline'}
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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* Main Dashboard Area */}
          <div className="xl:col-span-2 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-0">
            {/* Tabs */}
            <div className="flex border-b border-slate-800 px-4 pt-4 gap-4 shrink-0">
              <button
                className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'telemetry' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'
                }`}
                onClick={() => setActiveTab('telemetry')}
              >
                <Activity size={16} />
                Telemetry
              </button>
              <button
                className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'logs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'
                }`}
                onClick={() => setActiveTab('logs')}
              >
                <Terminal size={16} />
                Logs ({logs.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {activeTab === 'telemetry' && (
                <div className="space-y-6">
                  {/* Live Chart */}
                  <div>
                    <LiveChart latestData={latestData} />
                  </div>

                  {/* Latest values */}
                  {Object.keys(latestData).length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(latestData)
                        .filter(([k]) => !['ts', 'uptime_s', 'fw_version'].includes(k))
                        .map(([k, v]) => (
                          <div key={k} className="bg-slate-800 rounded-lg p-3 flex flex-col justify-center border border-slate-700">
                            <div className="text-xs text-slate-400 mb-1 leading-none">{k}</div>
                            <div className="text-lg font-bold text-white font-mono flex items-baseline gap-1">
                              {typeof v === 'boolean' ? (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${v ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                                  {v ? 'ON' : 'OFF'}
                                </span>
                              ) : (
                                <>
                                  {String(v)}
                                  {units[k] && <span className="text-xs text-slate-500 font-sans">{units[k]}</span>}
                                </>
                              )}
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="flex flex-col h-full h-96">
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={clearLogs}
                      className="text-slate-400 hover:text-red-400 text-xs flex items-center gap-1 transition-colors"
                    >
                      <Trash2 size={12} /> Clear
                    </button>
                  </div>
                  <div className="flex-1 bg-slate-950 rounded border border-slate-800 p-2 font-mono text-xs overflow-y-auto space-y-1">
                    {logs.length === 0 ? (
                      <div className="text-slate-600 italic">No logs received yet...</div>
                    ) : (
                      logs.map((log, i) => (
                        <div key={i} className="flex gap-2 hover:bg-slate-900 px-1 rounded">
                          <span className="text-slate-500 shrink-0">[{log.ts}]</span>
                          <span className={`${log.message.includes('error') || log.message.includes('fail') ? 'text-red-400' : 'text-slate-300'} break-all`}>
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col min-h-0">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide shrink-0">Controls</h2>
            <div className="flex-1 overflow-y-auto">
              <ControlPanel
                deviceToken={device.device_token}
                publish={publish}
                descriptor={enrichedDescriptor}
                latestData={latestData}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
