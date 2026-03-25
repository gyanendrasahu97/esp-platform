import { useEffect, useRef, useState } from 'react'
import mqtt, { type MqttClient } from 'mqtt'

const MQTT_URL = import.meta.env.VITE_MQTT_WS_URL || 'ws://localhost/mqtt'

export function useMqtt(deviceToken: string | null) {
  const clientRef = useRef<MqttClient | null>(null)
  const [latestData, setLatestData] = useState<Record<string, unknown>>({})
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!deviceToken) return

    const client = mqtt.connect(MQTT_URL, {
      clientId: `dashboard_${Math.random().toString(16).slice(2)}`,
      clean: true,
      reconnectPeriod: 3000,
    })

    clientRef.current = client

    client.on('connect', () => {
      setConnected(true)
      client.subscribe(`devices/${deviceToken}/telemetry`, { qos: 1 })
      client.subscribe(`devices/${deviceToken}/status`, { qos: 1 })
    })

    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString())
        if (topic.endsWith('/telemetry')) {
          setLatestData(data)
        }
      } catch {
        // ignore malformed messages
      }
    })

    client.on('disconnect', () => setConnected(false))
    client.on('error', (err) => console.warn('[MQTT]', err.message))

    return () => {
      client.end(true)
      setConnected(false)
    }
  }, [deviceToken])

  const publish = (topic: string, payload: object) => {
    clientRef.current?.publish(topic, JSON.stringify(payload), { qos: 1 })
  }

  return { latestData, connected, publish }
}
