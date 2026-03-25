import { useEffect, useRef, useState } from 'react'
import { Play, RefreshCw, ChevronDown } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import CodeEditor from '../components/editor/CodeEditor'
import FlashUsb from '../components/editor/FlashUsb'
import FlashOta from '../components/editor/FlashOta'
import api from '../api/client'
import type { BuildResult, Template } from '../types'

const DEFAULT_CODE = `// ESP Platform - New Sketch
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
}

void loop() {
  digitalWrite(2, HIGH);
  delay(1000);
  digitalWrite(2, LOW);
  delay(1000);
}
`

export default function EditorPage() {
  const [code, setCode]               = useState(DEFAULT_CODE)
  const [templates, setTemplates]     = useState<Template[]>([])
  const [board, setBoard]             = useState('esp32dev')
  const [building, setBuilding]       = useState(false)
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null)
  const [output, setOutput]           = useState('')
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<Template[]>('/compiler/templates').then(r => setTemplates(r.data))
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
      })
      setBuildResult(data)
      setOutput(data.output)
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

          {/* Build output panel */}
          <div className="w-96 border-l border-slate-800 flex flex-col bg-slate-950">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Build Output</span>
              {buildResult && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  buildResult.success ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                }`}>
                  {buildResult.success ? 'SUCCESS' : 'FAILED'}
                </span>
              )}
            </div>
            <div
              ref={outputRef}
              className="flex-1 overflow-y-auto p-3 font-mono text-xs text-slate-400 whitespace-pre-wrap leading-relaxed"
            >
              {output || <span className="text-slate-600">Build output will appear here...</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
