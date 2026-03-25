import { useEffect, useRef, useState, type RefObject } from 'react'
import { Play, RefreshCw, ChevronDown, BookOpen, Terminal, Settings, ChevronUp } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import CodeEditor from '../components/editor/CodeEditor'
import FlashUsb from '../components/editor/FlashUsb'
import FlashOta from '../components/editor/FlashOta'
import api from '../api/client'
import type { BuildResult, Device, Template } from '../types'

const DEFAULT_CODE = `/**
 * ESP Platform Firmware — main.cpp
 * All WiFi/MQTT/OTA/BLE/offline-buffer code is in the platform library.
 * Edit only this file.
 */

#include <ESPPlatform.h>

#define LED_PIN 2  // GPIO 2 = built-in LED on most ESP32 dev boards

void setup() {
    Platform.addSwitch("LED",         "set_led");
    Platform.addButton("Blink 3x",    "blink");
    Platform.addSensor("Temperature", "temperature", "\\u00b0C");
    Platform.addSensor("Humidity",    "humidity",    "%");
    Platform.addButton("Restart",     "restart");

    Platform.begin();
    pinMode(LED_PIN, OUTPUT);
}

void loop() {
    Platform.loop();

    static unsigned long t = 0;
    if (millis() - t >= 5000) {
        Platform.publish("temperature", 22.5f);
        Platform.publish("humidity",    65.0f);
        t = millis();
    }
}

void onCommand(const String& action, JsonObject params) {
    if (action == "set_led")  digitalWrite(LED_PIN, (bool)params["value"]);
    if (action == "blink") {
        for (int i = 0; i < 3; i++) {
            digitalWrite(LED_PIN, HIGH); delay(200);
            digitalWrite(LED_PIN, LOW);  delay(200);
        }
    }
    if (action == "restart") ESP.restart();
}
`

const LS_BUILD_KEY = 'esp_last_build'

// ── Read-only API reference shown in the right panel ──────────────────────────
const API_REFERENCE = `// ══════════════════════════════════════════════════
//  ESP PLATFORM  —  API REFERENCE  (read-only)
// ══════════════════════════════════════════════════
//  #include <ESPPlatform.h>
//  extern ESPPlatform Platform;
// ══════════════════════════════════════════════════

// ── LIFECYCLE ───────────────────────────────────
//   Platform.begin()    Call once in setup()
//                       Loads NVS → starts WiFi or BLE provisioning
//   Platform.loop()     Call every loop()
//                       Drives WiFi, MQTT, OTA, offline-buffer flush

// ── PUBLISH TELEMETRY ───────────────────────────
//   Platform.publish("key", float)    Send a float reading
//   Platform.publish("key", int)      Send an integer
//   Platform.publish("key", bool)     Send a boolean
//   Platform.publish("key", String)   Send a string
//   // Buffered automatically when MQTT is offline

// ── REGISTER UI CONTROLS ────────────────────────
//   Platform.addSwitch("Label", "action")
//   Platform.addButton("Label", "action")
//   Platform.addSlider("Label", "action", min, max)
//   Platform.addSensor("Label", "telemetry_key", "unit")
//   Platform.addGauge ("Label", "telemetry_key", min, max)
//   // Call before Platform.begin()

// ── STATUS ──────────────────────────────────────
//   Platform.isConnected()        true when WiFi + MQTT online
//   Platform._deviceToken         Device UUID (String)
//   Platform._backendUrl          Backend URL (String)

// ── COMMAND HOOK ────────────────────────────────
//   void onCommand(const String& action, JsonObject params)
//   // Define this in main.cpp — called on every incoming command
//   // params["value"] contains the control value

// ══════════════════════════════════════════════════
//  CONSTANTS  (lib/ESPPlatform/config.h)
// ══════════════════════════════════════════════════
#define LED_PIN              2        // Built-in LED (active HIGH)
#define SENSOR_DHT_PIN       4        // DHT22 data pin
#define TELEMETRY_INTERVAL_MS   5000  // ms between OTA checks
#define OTA_CHECK_INTERVAL_MS   300000
#define OFFLINE_BUFFER_MAX_BYTES  524288  // 512 KB
#define FIRMWARE_VERSION  "1.0.0"
#define DEVICE_NAME       "ESP Platform Device"
//
//  Override any constant in main.cpp before #include:
//    #undef  LED_PIN
//    #define LED_PIN  5

// ══════════════════════════════════════════════════
//  DYNAMIC UI JSON  (auto-built from addXxx calls)
// ══════════════════════════════════════════════════
// {
//   "device_name": "ESP Platform Device",
//   "controls": [
//     {"type":"switch",  "label":"Motor",   "action":"set_motor"},
//     {"type":"slider",  "label":"Speed",   "action":"set_speed","min":0,"max":100},
//     {"type":"sensor",  "label":"Temp",    "key":"temperature", "unit":"°C"},
//     {"type":"gauge",   "label":"Moisture","key":"soil",        "min":0,"max":100},
//     {"type":"button",  "label":"Reset",   "action":"restart"}
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

  // Pre-bake settings state
  const [prebakeOpen, setPrebakeOpen]           = useState(false)
  const [devices, setDevices]                   = useState<Device[]>([])
  const [prebakeDeviceId, setPrebakeDeviceId]   = useState('')
  const [prebakeWifiSsid, setPrebakeWifiSsid]   = useState('')
  const [prebakeWifiPass, setPrebakeWifiPass]   = useState('')

  useEffect(() => {
    // Load templates and auto-load full_platform main.cpp
    api.get<Template[]>('/compiler/templates').then(r => setTemplates(r.data))
    api.get<{ code: string }>('/compiler/templates/full_platform').then(r => setCode(r.data.code)).catch(() => {})
    // Load devices for pre-bake selector
    api.get<Device[]>('/devices').then(r => setDevices(r.data)).catch(() => {})
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
        ...(selectedDevice && prebakeWifiSsid ? {
          prebake_wifi_ssid: prebakeWifiSsid,
          prebake_wifi_pass: prebakeWifiPass,
          prebake_device_token: selectedDevice.device_token,
        } : {}),
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

  const selectedDevice = devices.find(d => d.id === prebakeDeviceId)

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
              Last build: {buildResult.build_id?.slice(0, 8)}
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

        {/* Pre-bake Settings — collapsible panel */}
        <div className="border-b border-slate-800 bg-slate-900/60 flex-shrink-0">
          <button
            onClick={() => setPrebakeOpen(o => !o)}
            className="flex items-center gap-2 w-full px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Settings size={12} />
            <span className="font-medium">Pre-bake Settings</span>
            <span className="text-slate-600 ml-1">
              {selectedDevice && prebakeWifiSsid
                ? `· ${selectedDevice.name} · ${prebakeWifiSsid}`
                : '· optional: embed WiFi + device token at build time (skip BLE)'}
            </span>
            <div className="flex-1" />
            {prebakeOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {prebakeOpen && (
            <div className="px-4 pb-3 grid grid-cols-3 gap-3">
              {/* Device selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-wide">Device</label>
                <div className="relative">
                  <select
                    value={prebakeDeviceId}
                    onChange={e => setPrebakeDeviceId(e.target.value)}
                    className="w-full appearance-none bg-slate-800 border border-slate-700 text-xs text-white rounded-lg pl-2 pr-6 py-1.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— none (use BLE) —</option>
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.device_token.slice(0, 8)}…)
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={10} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* WiFi SSID */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-wide">WiFi SSID</label>
                <input
                  type="text"
                  value={prebakeWifiSsid}
                  onChange={e => setPrebakeWifiSsid(e.target.value)}
                  placeholder="MyNetwork"
                  className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                />
              </div>

              {/* WiFi Password */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-wide">WiFi Password</label>
                <input
                  type="password"
                  value={prebakeWifiPass}
                  onChange={e => setPrebakeWifiPass(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                />
              </div>

              {prebakeDeviceId && prebakeWifiSsid && (
                <div className="col-span-3 flex items-center gap-1.5 text-[10px] text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  WiFi + device token will be embedded in the next build — BLE provisioning skipped on first boot
                </div>
              )}
            </div>
          )}
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
