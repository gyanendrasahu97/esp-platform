import { useEffect, useRef, useState, type RefObject } from 'react'
import { Play, RefreshCw, ChevronDown, BookOpen, Terminal } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import CodeEditor from '../components/editor/CodeEditor'
import FlashUsb from '../components/editor/FlashUsb'
import FlashOta from '../components/editor/FlashOta'
import api from '../api/client'
import type { BuildResult, Template } from '../types'

const DEFAULT_CODE = `// ESP Platform - Full Platform Firmware (main.cpp)
// All other files (WiFi, MQTT, BLE, OTA, offline buffer) are included automatically.
// Edit this file to customize sensors, controls, or behavior.
// Build → Flash USB (browser) or Flash OTA (over WiFi).

#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>

#include "config.h"
#include "wifi_manager.h"
#include "mqtt_client.h"
#include "sensor_manager.h"
#include "control_handler.h"
#include "ota_manager.h"
#include "offline_buffer.h"
#include "ble_provisioning.h"
#include "ui_descriptor.h"

// ---- load full platform main from template ----
// (This file is replaced by the template's main.cpp on build)
`

const LS_BUILD_KEY = 'esp_last_build'

// ── Read-only API reference shown in the right panel ──────────────────────────
const API_REFERENCE = `// ══════════════════════════════════════════════════
//  ESP PLATFORM  —  API REFERENCE  (read-only)
// ══════════════════════════════════════════════════

// ── RUNTIME VARIABLES  (available in main.cpp) ──
//   String  g_deviceToken   Unique device token (UUID)
//   String  g_backendUrl    Backend URL e.g. "https://esp.cruzanet.cloud"
//   String  g_mqttHost      MQTT broker hostname
//   String  g_wifiSsid      Connected WiFi SSID

// ── MQTT ────────────────────────────────────────
//   mqttClient.publish(topic, payload)    Send a message
//   mqttClient.isConnected()              true if online
//
//   Topics:
//     "devices/" + g_deviceToken + "/telemetry"  → you publish here
//     "devices/" + g_deviceToken + "/commands"   → platform reads, calls controlHandler
//     "devices/" + g_deviceToken + "/ui"         → publish your UI descriptor (retained)

// ── SENSOR MANAGER ──────────────────────────────
//   sensorManager.readInto(JsonDocument& doc)
//   // Adds: temperature, humidity, uptime_s, rssi, fw_version
//   // Edit sensor_manager.cpp to add real sensors

// ── CONTROL HANDLER ─────────────────────────────
//   controlHandler.handle(topic, payload)
//   // Built-in actions: set_led, blink, restart
//   // Edit control_handler.cpp to add custom actions:
//   //   {"action":"set_relay","value":true}
//   //   {"action":"set_speed","value":75}

// ── OFFLINE BUFFER ──────────────────────────────
//   offlineBuffer.store(payload)             Buffer when offline
//   offlineBuffer.flush(publishFn)           Flush on reconnect
//   offlineBuffer.hasData()                  true if buffer not empty
//   offlineBuffer.clear()                    Wipe buffer

// ── OTA MANAGER ─────────────────────────────────
//   otaManager.checkAndApply()              Poll backend for update
//   otaManager.applyFromUrl(url, checksum)  Flash from URL directly

// ── UI DESCRIPTOR ───────────────────────────────
//   String buildUiDescriptor(g_deviceToken)
//   // Returns JSON for dashboard/mobile dynamic UI
//   // Edit ui_descriptor.cpp to add/remove controls

// ── WIFI MANAGER ────────────────────────────────
//   wifiManager.isConnected()    true if WiFi up
//   wifiManager.getIP()          Local IP as String
//   wifiManager.getState()       WiFiState enum

// ══════════════════════════════════════════════════
//  CONFIGURABLE CONSTANTS  (from config.h)
// ══════════════════════════════════════════════════
//
//  Pin assignments:
#define LED_PIN              2        // Built-in LED (active HIGH)
#define SENSOR_DHT_PIN       4        // DHT22 data pin
//
//  Timing:
#define TELEMETRY_INTERVAL_MS   5000  // Publish every 5 s
#define OTA_CHECK_INTERVAL_MS   300000// OTA check every 5 min
//
//  Offline buffer:
#define OFFLINE_BUFFER_MAX_BYTES  524288  // 512 KB
#define OFFLINE_FLUSH_BATCH       20      // Records per flush
//
//  Identity:
#define FIRMWARE_VERSION  "1.0.0"
#define DEVICE_NAME       "ESP Platform Device"
//
//  To override in main.cpp:
//    #undef  LED_PIN
//    #define LED_PIN 5
//
// ══════════════════════════════════════════════════
//  DYNAMIC UI JSON FORMAT
// ══════════════════════════════════════════════════
// {
//   "device_name": "Pump Controller",
//   "firmware_version": "1.0.0",
//   "controls": [
//     {"type":"switch",  "label":"Motor",    "action":"set_motor"},
//     {"type":"slider",  "label":"Speed",    "action":"set_speed", "min":0,"max":100},
//     {"type":"sensor",  "label":"Temp",     "key":"temperature",  "unit":"°C"},
//     {"type":"gauge",   "label":"Moisture", "key":"soil",         "min":0,"max":100},
//     {"type":"button",  "label":"Reset",    "action":"restart"}
//   ]
// }
// ══════════════════════════════════════════════════
`

interface RightPanelProps {
  output: string
  buildResult: BuildResult | null
  outputRef: RefObject<HTMLDivElement | null>
}

function RightPanel({ output, buildResult, outputRef }: RightPanelProps) {
  const [tab, setTab] = useState<'output' | 'api'>('output')

  // Switch to output tab automatically when a build starts/finishes
  useEffect(() => { if (output) setTab('output') }, [output])

  return (
    <div className="w-96 border-l border-slate-800 flex flex-col bg-slate-950">
      {/* Tab bar */}
      <div className="flex items-center border-b border-slate-800">
        <button
          onClick={() => setTab('output')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
            tab === 'output'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Terminal size={12} />
          Build Output
          {buildResult && (
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
              buildResult.success ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
            }`}>
              {buildResult.success ? 'OK' : 'ERR'}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('api')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
            tab === 'api'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <BookOpen size={12} />
          API Reference
        </button>
        <div className="flex-1" />
        {tab === 'api' && (
          <span className="text-[10px] text-slate-600 pr-2 italic">read-only</span>
        )}
      </div>

      {/* Tab content */}
      {tab === 'output' ? (
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs text-slate-400 whitespace-pre-wrap leading-relaxed"
        >
          {output || <span className="text-slate-600">Build output will appear here...</span>}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-slate-300 whitespace-pre leading-relaxed select-text">
          {API_REFERENCE.split('\n').map((line, i) => {
            // Colour code the reference lines
            if (line.startsWith('// ══') || line.startsWith('// ──')) {
              return <div key={i} className="text-slate-600">{line}</div>
            }
            if (line.startsWith('#define')) {
              return <div key={i} className="text-yellow-400">{line}</div>
            }
            if (line.startsWith('//   ') && !line.includes('//   //')) {
              const parts = line.match(/^(\/\/\s+)(\S+)(\s+.*)?$/)
              if (parts) {
                return (
                  <div key={i}>
                    <span className="text-slate-500">{parts[1]}</span>
                    <span className="text-blue-300">{parts[2]}</span>
                    <span className="text-slate-400">{parts[3] ?? ''}</span>
                  </div>
                )
              }
            }
            return <div key={i} className="text-slate-500">{line}</div>
          })}
        </div>
      )}
    </div>
  )
}

export default function EditorPage() {
  const [code, setCode]               = useState(DEFAULT_CODE)
  const [templates, setTemplates]     = useState<Template[]>([])
  const [board, setBoard]             = useState('esp32dev')
  const [building, setBuilding]       = useState(false)
  const [buildResult, setBuildResult] = useState<BuildResult | null>(() => {
    // Restore last successful build from localStorage so Flash buttons survive a refresh
    try {
      const saved = localStorage.getItem(LS_BUILD_KEY)
      return saved ? JSON.parse(saved) as BuildResult : null
    } catch { return null }
  })
  const [output, setOutput]           = useState('')
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load templates and auto-load full_platform main.cpp
    api.get<Template[]>('/compiler/templates').then(r => setTemplates(r.data))
    api.get<{ code: string }>('/compiler/templates/full_platform').then(r => setCode(r.data.code)).catch(() => {})
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const loadTemplate = async (templateId: string) => {
    // Fetch template code from backend
    const { data } = await api.get<{ code: string }>(`/compiler/templates/${templateId}`)
    setCode(data.code)
    setBuildResult(null)
    setOutput('')
  }

  const build = async () => {
    setBuilding(true)
    setBuildResult(null)
    setOutput('Starting build...\n')

    try {
      const { data } = await api.post<BuildResult>('/compiler/build', {
        source_code: code,
        board,
        template_id: 'full_platform',
      })
      setBuildResult(data)
      setOutput(data.output)
      // Persist last build so Flash buttons work after a page refresh
      if (data.success) {
        try { localStorage.setItem(LS_BUILD_KEY, JSON.stringify(data)) } catch { /* ignore */ }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setOutput(`Build request failed: ${msg || 'Unknown error'}`)
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900 flex-shrink-0">
          {/* Template selector */}
          <div className="relative">
            <select
              onChange={e => e.target.value && loadTemplate(e.target.value)}
              className="appearance-none bg-slate-800 border border-slate-700 text-sm text-white rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-blue-500"
              defaultValue=""
            >
              <option value="" disabled>Load template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Board selector */}
          <select
            value={board}
            onChange={e => setBoard(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="esp32dev">ESP32 Dev</option>
            <option value="esp32-s3-devkitc-1">ESP32-S3</option>
            <option value="nodemcu-32s">NodeMCU-32S</option>
          </select>

          <div className="flex-1" />

          {/* Restored build indicator */}
          {buildResult?.success && !output && (
            <span className="text-xs text-slate-500 italic">
              Last build: {buildResult.build_id.slice(0, 8)}
            </span>
          )}

          {/* Build button */}
          <button
            onClick={build}
            disabled={building}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {building ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {building ? 'Building...' : 'Build'}
          </button>

          {/* Flash buttons */}
          <FlashUsb binUrl={buildResult?.bin_url ?? null} buildId={buildResult?.build_id ?? null} />
          <FlashOta firmwareId={buildResult?.firmware_id ?? null} />
        </div>

        {/* Editor + Output split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Monaco Editor */}
          <div className="flex-1 overflow-hidden">
            <CodeEditor value={code} onChange={setCode} />
          </div>

          {/* Right panel: Build Output / API Reference tabs */}
          <RightPanel output={output} buildResult={buildResult} outputRef={outputRef} />
        </div>
      </div>
    </div>
  )
}
