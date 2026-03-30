import { useEffect, useRef, useState } from 'react'
import mqtt, { type MqttClient } from 'mqtt'

const _rawMqttUrl = import.meta.env.VITE_MQTT_WS_URL ||
  `ws://${window.location.host}/mqtt`
const MQTT_URL = window.location.protocol === 'https:' && _rawMqttUrl.startsWith('ws://')
  ? 'wss://' + _rawMqttUrl.slice(5)
  : _rawMqttUrl

export interface LogEntry {
  ts: string
  message: string
  uptime_ms?: number
}

export function useMqtt(deviceToken: string | null) {
  const clientRef = useRef<MqttClient | null>(null)
  const [latestData, setLatestData] = useState<Record<string, unknown>>({})
  const [uiDescriptor, setUiDescriptor] = useState<Record<string, unknown> | null>(null)
  const [connected, setConnected] = useState(false)
  const [deviceOnline, setDeviceOnline] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    if (!deviceToken) return

    const client = mqtt.connect(MQTT_URL, {
      clientId: `dashboard_${Math.random().toString(16).slice(2)}`,
      clean: false,
      reconnectPeriod: 3000,
    })

    clientRef.current = client

    client.on('connect', () => {
      setConnected(true)
      client.subscribe(`devices/${deviceToken}/telemetry`, { qos: 1 })
      client.subscribe(`devices/${deviceToken}/status`,    { qos: 1 })
      client.subscribe(`devices/${deviceToken}/ui`,        { qos: 1 })
      client.subscribe(`devices/${deviceToken}/logs`,      { qos: 1 })
    })

    client.on('message', (topic, payload) => {
      const raw = payload.toString()

      if (topic.endsWith('/status')) {
        setDeviceOnline(raw === 'online')
        return
      }

      if (topic.endsWith('/logs')) {
        try {
          const d = JSON.parse(raw)
          setLogs(prev => [...prev.slice(-199), {
            ts: new Date().toLocaleTimeString(),
            message: String(d.message ?? raw),
            uptime_ms: d.uptime_ms,
          }])
        } catch {
          setLogs(prev => [...prev.slice(-199), {
            ts: new Date().toLocaleTimeString(),
            message: raw,
          }])
        }
        return
      }

      try {
        const data = JSON.parse(raw)
        if (topic.endsWith('/telemetry')) {
          setLatestData(data)
        } else if (topic.endsWith('/ui')) {
          setUiDescriptor(data)
        }
      } catch {
        // ignore malformed messages
      }
    })

    client.on('disconnect', () => { setConnected(false); setDeviceOnline(false) })
    client.on('error', (err) => console.warn('[MQTT]', err.message))

    return () => {
      client.end(true)
      setConnected(false)
    }
  }, [deviceToken])

  const publish = (topic: string, payload: object) => {
    clientRef.current?.publish(topic, JSON.stringify(payload), { qos: 1 })
  }

  const clearLogs = () => setLogs([])

  return { latestData, uiDescriptor, connected, publish, logs, clearLogs, deviceOnline }
}
