import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Layers, Zap, Plus, Trash2, GripVertical, Save, Upload, Cpu, ChevronDown } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import api from '../api/client'
import type { Device, UiControl } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ControlType = UiControl['type']

interface RuleTrigger {
  type: 'command' | 'telemetry' | 'timer' | 'boot' | 'time'
  key?: string
  op?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between'
  threshold?: number
  threshold2?: number
  interval_ms?: number
  value?: boolean
  hour?: number
  minute?: number
}

interface RuleAction {
  type: 'gpio_write' | 'publish' | 'log' | 'restart' | 'delay_ms'
  key?: string
  value?: number | boolean | string
  msg?: string
  ms?: number
}

interface Rule {
  id: string
  trigger: RuleTrigger
  actions: RuleAction[]
}

// ─── Pin Registry ─────────────────────────────────────────────────────────────
// Derived from the device's live UI descriptor — no manual config needed.

interface PinEntry { key: string; label: string; type: string }

interface PinRegistry {
  outputs: PinEntry[]   // switch / button / slider → action key
  inputs:  PinEntry[]   // sensor / gauge → telemetry key
  all:     PinEntry[]
}

function buildPinRegistry(controls: UiControl[]): PinRegistry {
  const outputs = controls
    .filter(c => ['switch','button','slider'].includes(c.type) && c.action)
    .map(c => ({ key: c.action!, label: c.label, type: c.type }))
  const inputs = controls
    .filter(c => ['sensor','gauge'].includes(c.type) && c.key)
    .map(c => ({ key: c.key!, label: c.label, type: c.type }))
  return { outputs, inputs, all: [...outputs, ...inputs] }
}

// ─── KeySelect ────────────────────────────────────────────────────────────────
// Dropdown of known pin keys with "Other…" fallback to a text input.

function KeySelect({
  value, onChange, pins, placeholder = 'select or type key',
}: {
  value: string
  onChange: (v: string) => void
  pins: PinEntry[]
  placeholder?: string
}) {
  const knownKeys = pins.map(p => p.key)
  const isCustom = !!value && !knownKeys.includes(value)
  const [showCustom, setShowCustom] = useState(isCustom)

  if (pins.length === 0 || showCustom) {
    return (
      <div className="flex gap-1">
        <input
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white font-mono"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
        {pins.length > 0 && (
          <button
            title="Pick from device pins"
            onClick={() => { setShowCustom(false); onChange('') }}
            className="text-slate-500 hover:text-white px-1"
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
      value={value}
      onChange={e => {
        if (e.target.value === '__custom__') { setShowCustom(true); onChange('') }
        else onChange(e.target.value)
      }}
    >
      <option value="">— select pin —</option>
      {pins.map(p => (
        <option key={p.key} value={p.key}>
          {p.label}  ·  {p.key}
        </option>
      ))}
      <option value="__custom__">Other (type manually)…</option>
    </select>
  )
}

// ─── Registered Pins Banner ───────────────────────────────────────────────────

function PinsBanner({ pins }: { pins: PinRegistry }) {
  if (pins.all.length === 0) return (
    <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
      <Cpu size={14} />
      Device not connected — no registered pins available. Connect the device to auto-populate key dropdowns.
    </div>
  )

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Cpu size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Registered Device Pins
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {pins.outputs.map(p => (
          <span key={p.key} className="flex items-center gap-1.5 bg-blue-900/30 border border-blue-700/40 rounded-md px-2 py-1 text-xs text-blue-300">
            <span className="text-blue-500">OUT</span>
            <span className="font-medium">{p.label}</span>
            <span className="font-mono text-blue-400/70">→ key: {p.key}</span>
          </span>
        ))}
        {pins.inputs.map(p => (
          <span key={p.key} className="flex items-center gap-1.5 bg-green-900/30 border border-green-700/40 rounded-md px-2 py-1 text-xs text-green-300">
            <span className="text-green-500">IN</span>
            <span className="font-medium">{p.label}</span>
            <span className="font-mono text-green-400/70">→ key: {p.key}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── UI Builder ───────────────────────────────────────────────────────────────

const CONTROL_TYPES: { type: ControlType; label: string; icon: string }[] = [
  { type: 'switch',  label: 'Switch',  icon: '⚡' },
  { type: 'button',  label: 'Button',  icon: '🔘' },
  { type: 'slider',  label: 'Slider',  icon: '🎚️' },
  { type: 'sensor',  label: 'Sensor',  icon: '📡' },
  { type: 'gauge',   label: 'Gauge',   icon: '🎯' },
]

function defaultControl(type: ControlType): UiControl {
  const base = { type, label: type.charAt(0).toUpperCase() + type.slice(1) }
  if (type === 'switch') return { ...base, action: '' }
  if (type === 'button') return { ...base, action: '' }
  if (type === 'slider') return { ...base, action: '', min: 0, max: 100 }
  if (type === 'sensor') return { ...base, key: '', unit: '' }
  if (type === 'gauge')  return { ...base, key: '', min: 0, max: 100 }
  return base
}

function ControlEditor({
  control, onChange, onRemove, pins,
}: {
  control: UiControl
  onChange: (c: UiControl) => void
  onRemove: () => void
  pins: PinRegistry
}) {
  const isOutput = ['switch','button','slider'].includes(control.type)
  const isInput  = ['sensor','gauge'].includes(control.type)

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex gap-3 items-start group">
      <GripVertical size={16} className="text-slate-600 mt-1 cursor-grab flex-shrink-0" />
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Label</label>
          <input
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
            value={control.label}
            onChange={e => onChange({ ...control, label: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Type</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
            value={control.type}
            onChange={e => onChange(defaultControl(e.target.value as ControlType))}
          >
            {CONTROL_TYPES.map(t => (
              <option key={t.type} value={t.type}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>

        {isOutput && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              Pin / Action key
              <span className="ml-1 text-slate-600">(must match firmware registration)</span>
            </label>
            <KeySelect
              value={control.action ?? ''}
              onChange={v => onChange({ ...control, action: v })}
              pins={pins.outputs}
              placeholder="e.g. led"
            />
          </div>
        )}

        {isInput && (
          <>
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                Telemetry key
                <span className="ml-1 text-slate-600">(matches published sensor key)</span>
              </label>
              <KeySelect
                value={control.key ?? ''}
                onChange={v => onChange({ ...control, key: v })}
                pins={pins.inputs}
                placeholder="e.g. temperature"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Unit</label>
              <input
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={control.unit ?? ''}
                placeholder="°C, %, V…"
                onChange={e => onChange({ ...control, unit: e.target.value })}
              />
            </div>
          </>
        )}

        {(control.type === 'slider' || control.type === 'gauge') && (
          <>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Min</label>
              <input type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={control.min ?? 0}
                onChange={e => onChange({ ...control, min: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Max</label>
              <input type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={control.max ?? 100}
                onChange={e => onChange({ ...control, max: Number(e.target.value) })}
              />
            </div>
          </>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function UiBuilderTab({ deviceId, initial, pins }: { deviceId: string; initial: UiControl[]; pins: PinRegistry }) {
  const [controls, setControls] = useState<UiControl[]>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const add = (type: ControlType) => setControls(c => [...c, defaultControl(type)])
  const remove = (i: number) => setControls(c => c.filter((_, j) => j !== i))
  const update = (i: number, c: UiControl) => setControls(prev => prev.map((x, j) => j === i ? c : x))

  const deploy = async () => {
    setSaving(true)
    try {
      await api.put(`/devices/${deviceId}/ui`, { controls })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PinsBanner pins={pins} />

      {/* Widget palette */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Add Widget</h3>
        <div className="flex gap-2 flex-wrap">
          {CONTROL_TYPES.map(t => (
            <button
              key={t.type}
              onClick={() => add(t.type)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white transition-colors"
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Control list */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Controls ({controls.length})
          </h3>
          <button
            onClick={deploy}
            disabled={saving}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <Upload size={14} />
            {saving ? 'Deploying…' : saved ? 'Deployed!' : 'Deploy to Device'}
          </button>
        </div>

        {controls.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">
            Add widgets above — they'll appear in the dashboard and mobile app
          </div>
        ) : (
          <div className="space-y-2">
            {controls.map((c, i) => (
              <ControlEditor
                key={i}
                control={c}
                onChange={updated => update(i, updated)}
                onRemove={() => remove(i)}
                pins={pins}
              />
            ))}
          </div>
        )}
      </div>

      {controls.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">JSON Preview</h3>
          <pre className="text-xs text-slate-400 font-mono overflow-x-auto bg-slate-950 rounded-lg p-3">
            {JSON.stringify({ controls }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Logic Builder ────────────────────────────────────────────────────────────

function newRule(): Rule {
  return {
    id: Math.random().toString(36).slice(2, 8),
    trigger: { type: 'telemetry', key: '', op: 'gt', threshold: 0 },
    actions: [{ type: 'gpio_write', key: '', value: true }],
  }
}

function TriggerEditor({
  trigger, onChange, pins,
}: {
  trigger: RuleTrigger
  onChange: (t: RuleTrigger) => void
  pins: PinRegistry
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-500 block mb-1">When this happens</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
            value={trigger.type}
            onChange={e => onChange({ type: e.target.value as RuleTrigger['type'] })}
          >
            <option value="telemetry">📡 Sensor / telemetry value</option>
            <option value="command">⚡ Command received</option>
            <option value="timer">⏱ Timer (repeating)</option>
            <option value="time">🕐 Time of day (NTP)</option>
            <option value="boot">🔌 On device boot</option>
          </select>
        </div>

        {(trigger.type === 'telemetry' || trigger.type === 'command') && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              {trigger.type === 'telemetry' ? 'Sensor key' : 'Command key (action)'}
            </label>
            <KeySelect
              value={trigger.key ?? ''}
              onChange={v => onChange({ ...trigger, key: v })}
              pins={trigger.type === 'telemetry' ? pins.inputs : pins.outputs}
              placeholder={trigger.type === 'telemetry' ? 'temperature' : 'led'}
            />
          </div>
        )}

        {trigger.type === 'telemetry' && (
          <>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Condition</label>
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={trigger.op ?? 'gt'}
                onChange={e => onChange({ ...trigger, op: e.target.value as RuleTrigger['op'] })}
              >
                <option value="gt">&gt; greater than</option>
                <option value="lt">&lt; less than</option>
                <option value="gte">≥ at least</option>
                <option value="lte">≤ at most</option>
                <option value="eq">= equals</option>
                <option value="between">↔ between</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                {trigger.op === 'between' ? 'Lower bound' : 'Threshold'}
              </label>
              <input type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={trigger.threshold ?? 0}
                onChange={e => onChange({ ...trigger, threshold: Number(e.target.value) })}
              />
            </div>
            {trigger.op === 'between' && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">Upper bound</label>
                <input type="number"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                  value={trigger.threshold2 ?? 0}
                  onChange={e => onChange({ ...trigger, threshold2: Number(e.target.value) })}
                />
              </div>
            )}
          </>
        )}

        {trigger.type === 'command' && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Value (optional)</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
              value={trigger.value === undefined ? '' : String(trigger.value)}
              onChange={e => onChange({ ...trigger, value: e.target.value === '' ? undefined : e.target.value === 'true' })}
            >
              <option value="">Any value</option>
              <option value="true">ON (true)</option>
              <option value="false">OFF (false)</option>
            </select>
          </div>
        )}

        {trigger.type === 'timer' && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Interval</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
              value={trigger.interval_ms ?? 5000}
              onChange={e => onChange({ ...trigger, interval_ms: Number(e.target.value) })}
            >
              <option value={1000}>Every 1 second</option>
              <option value={5000}>Every 5 seconds</option>
              <option value={30000}>Every 30 seconds</option>
              <option value={60000}>Every 1 minute</option>
              <option value={300000}>Every 5 minutes</option>
              <option value={3600000}>Every 1 hour</option>
            </select>
          </div>
        )}

        {trigger.type === 'time' && (
          <>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Hour (0–23)</label>
              <input type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={trigger.hour ?? 8}
                min={0} max={23}
                onChange={e => onChange({ ...trigger, hour: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Minute (0–59)</label>
              <input type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={trigger.minute ?? 0}
                min={0} max={59}
                onChange={e => onChange({ ...trigger, minute: Number(e.target.value) })}
              />
            </div>
            <p className="col-span-2 text-xs text-slate-500">
              Fires once per day at this local time (set timezone in firmware config.h). Requires NTP sync.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function ActionEditor({
  action, onChange, onRemove, pins,
}: {
  action: RuleAction
  onChange: (a: RuleAction) => void
  onRemove: () => void
  pins: PinRegistry
}) {
  return (
    <div className="bg-slate-900 rounded-lg p-2 flex gap-2 items-start group border border-slate-700">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Do this</label>
          <select
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
            value={action.type}
            onChange={e => onChange({ type: e.target.value as RuleAction['type'] })}
          >
            <option value="gpio_write">⚡ Set GPIO output (ON/OFF)</option>
            <option value="publish">📤 Publish telemetry value</option>
            <option value="log">📋 Log message</option>
            <option value="delay_ms">⏱ Wait / delay</option>
            <option value="restart">🔄 Restart device</option>
          </select>
        </div>

        {action.type === 'gpio_write' && (
          <>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Output pin</label>
              <KeySelect
                value={action.key ?? ''}
                onChange={v => onChange({ ...action, key: v })}
                pins={pins.outputs}
                placeholder="e.g. led"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Set to</label>
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={action.value === '$value' ? '$value' : String(action.value ?? true)}
                onChange={e => {
                  const v = e.target.value
                  onChange({ ...action, value: v === '$value' ? '$value' : v === 'true' })
                }}
              >
                <option value="true">ON (true)</option>
                <option value="false">OFF (false)</option>
                <option value="$value">Mirror trigger value</option>
              </select>
            </div>
          </>
        )}

        {action.type === 'publish' && (
          <>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Telemetry key</label>
              <KeySelect
                value={action.key ?? ''}
                onChange={v => onChange({ ...action, key: v })}
                pins={pins.all}
                placeholder="e.g. status"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Value</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={String(action.value ?? '')}
                placeholder="1.0 or $value or $millis"
                onChange={e => {
                  const v = e.target.value
                  const num = Number(v)
                  onChange({ ...action, value: v === '$value' || v === '$millis' ? v : isNaN(num) ? v : num })
                }}
              />
            </div>
          </>
        )}

        {action.type === 'log' && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Message</label>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
              value={action.msg ?? ''}
              placeholder="e.g. Temperature too high!"
              onChange={e => onChange({ ...action, msg: e.target.value })}
            />
          </div>
        )}

        {action.type === 'delay_ms' && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Duration</label>
            <select
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
              value={action.ms ?? 1000}
              onChange={e => onChange({ ...action, ms: Number(e.target.value) })}
            >
              <option value={500}>0.5 seconds</option>
              <option value={1000}>1 second</option>
              <option value={5000}>5 seconds</option>
              <option value={10000}>10 seconds</option>
              <option value={30000}>30 seconds</option>
              <option value={60000}>1 minute</option>
              <option value={1800000}>30 minutes</option>
              <option value={3600000}>1 hour</option>
            </select>
          </div>
        )}
      </div>
      <button onClick={onRemove} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 mt-5">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function RuleCard({
  rule, onChange, onRemove, pins,
}: {
  rule: Rule
  onChange: (r: Rule) => void
  onRemove: () => void
  pins: PinRegistry
}) {
  const addAction = () => onChange({ ...rule, actions: [...rule.actions, { type: 'gpio_write', key: '', value: true }] })
  const removeAction = (i: number) => onChange({ ...rule, actions: rule.actions.filter((_, j) => j !== i) })
  const updateAction = (i: number, a: RuleAction) => onChange({ ...rule, actions: rule.actions.map((x, j) => j === i ? a : x) })

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-slate-500">#{rule.id}</span>
        <button onClick={onRemove} className="text-slate-600 hover:text-red-400">
          <Trash2 size={14} />
        </button>
      </div>

      <div>
        <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">🔵 When</div>
        <TriggerEditor trigger={rule.trigger} onChange={t => onChange({ ...rule, trigger: t })} pins={pins} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-green-400 uppercase tracking-wide">🟢 Then</div>
          <button onClick={addAction} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
            <Plus size={12} /> Add action
          </button>
        </div>
        <div className="space-y-2">
          {rule.actions.map((a, i) => (
            <ActionEditor
              key={i}
              action={a}
              onChange={updated => updateAction(i, updated)}
              onRemove={() => removeAction(i)}
              pins={pins}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function LogicBuilderTab({ deviceId, initialRules, pins }: { deviceId: string; initialRules: Rule[]; pins: PinRegistry }) {
  const [rules, setRules] = useState<Rule[]>(initialRules)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const addRule = () => setRules(r => [...r, newRule()])
  const removeRule = (i: number) => setRules(r => r.filter((_, j) => j !== i))
  const updateRule = (i: number, r: Rule) => setRules(prev => prev.map((x, j) => j === i ? r : x))

  const deploy = async () => {
    setSaving(true)
    try {
      await api.put(`/devices/${deviceId}/rules`, { rules })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PinsBanner pins={pins} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Rules run on-device — deployed via MQTT, no reflash needed.
        </p>
        <div className="flex gap-2">
          <button
            onClick={addRule}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-sm transition-colors"
          >
            <Plus size={14} /> Add Rule
          </button>
          <button
            onClick={deploy}
            disabled={saving}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {saving ? 'Deploying…' : saved ? 'Deployed!' : 'Deploy Rules'}
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-600 text-sm">
          No rules yet — click "Add Rule" to create automation logic
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r, i) => (
            <RuleCard
              key={r.id}
              rule={r}
              onChange={updated => updateRule(i, updated)}
              onRemove={() => removeRule(i)}
              pins={pins}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'ui' | 'logic'

export default function DeviceBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const [device, setDevice] = useState<Device | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('ui')

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get<Device>(`/devices/${id}`),
      api.get<{ rules: Rule[] }>(`/devices/${id}/rules`),
    ]).then(([deviceRes, rulesRes]) => {
      setDevice(deviceRes.data)
      setRules(rulesRes.data.rules ?? [])
    }).finally(() => setLoading(false))
  }, [id])

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

  const initialControls = (device.ui_descriptor?.controls ?? []) as UiControl[]
  const pins = buildPinRegistry(initialControls)

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <Link to={`/devices/${device.id}`} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-3">
            <ArrowLeft size={16} /> {device.name}
          </Link>
          <h1 className="text-2xl font-bold">Device Builder</h1>
          <p className="text-slate-500 text-sm mt-1">Design the UI and automation rules for this device</p>
        </div>

        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setTab('ui')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'ui' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers size={15} /> UI Builder
          </button>
          <button
            onClick={() => setTab('logic')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'logic' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap size={15} /> Logic Builder
          </button>
        </div>

        {tab === 'ui'    && <UiBuilderTab    deviceId={device.id} initial={initialControls} pins={pins} />}
        {tab === 'logic' && <LogicBuilderTab deviceId={device.id} initialRules={rules}      pins={pins} />}
      </main>
    </div>
  )
}
