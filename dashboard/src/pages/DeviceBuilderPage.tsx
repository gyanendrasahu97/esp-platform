import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Layers, Zap, Plus, Trash2, GripVertical, Save, Upload } from 'lucide-react'
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
  hour?: number    // for time trigger (0-23)
  minute?: number  // for time trigger (0-59)
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
  if (type === 'switch') return { ...base, action: 'set_' + type }
  if (type === 'button') return { ...base, action: type + '_action' }
  if (type === 'slider') return { ...base, action: 'set_' + type, min: 0, max: 100 }
  if (type === 'sensor') return { ...base, key: type + '_value', unit: '' }
  if (type === 'gauge')  return { ...base, key: type + '_value', min: 0, max: 100 }
  return base
}

function ControlEditor({
  control, onChange, onRemove
}: {
  control: UiControl
  onChange: (c: UiControl) => void
  onRemove: () => void
}) {
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
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </select>
        </div>
        {(control.type === 'switch' || control.type === 'button' || control.type === 'slider') && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Action key</label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white font-mono"
              value={control.action ?? ''}
              onChange={e => onChange({ ...control, action: e.target.value })}
            />
          </div>
        )}
        {(control.type === 'sensor' || control.type === 'gauge') && (
          <>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Telemetry key</label>
              <input
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white font-mono"
                value={control.key ?? ''}
                onChange={e => onChange({ ...control, key: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Unit</label>
              <input
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={control.unit ?? ''}
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

function UiBuilderTab({ deviceId, initial }: { deviceId: string; initial: UiControl[] }) {
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
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

function TriggerEditor({ trigger, onChange }: { trigger: RuleTrigger; onChange: (t: RuleTrigger) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Trigger type</label>
          <select
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
            value={trigger.type}
            onChange={e => onChange({ type: e.target.value as RuleTrigger['type'] })}
          >
            <option value="telemetry">Telemetry value</option>
            <option value="command">Command received</option>
            <option value="timer">Timer (repeating)</option>
            <option value="time">Time of day (NTP)</option>
            <option value="boot">On boot</option>
          </select>
        </div>
        {(trigger.type === 'telemetry' || trigger.type === 'command') && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Key</label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white font-mono"
              value={trigger.key ?? ''}
              placeholder={trigger.type === 'telemetry' ? 'temperature' : 'set_relay'}
              onChange={e => onChange({ ...trigger, key: e.target.value })}
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
                <option value="between">between</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Threshold</label>
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
              <option value="true">true (ON)</option>
              <option value="false">false (OFF)</option>
            </select>
          </div>
        )}
        {trigger.type === 'timer' && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Interval (ms)</label>
            <input type="number"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
              value={trigger.interval_ms ?? 5000}
              min={100}
              onChange={e => onChange({ ...trigger, interval_ms: Number(e.target.value) })}
            />
          </div>
        )}
        {trigger.type === 'time' && (
          <div className="grid grid-cols-2 gap-2">
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
            <p className="col-span-2 text-xs text-slate-500">Fires once per day at this local time. Requires NTP sync.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ActionEditor({
  action, onChange, onRemove
}: {
  action: RuleAction
  onChange: (a: RuleAction) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-slate-900 rounded-lg p-2 flex gap-2 items-start group border border-slate-700">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Action</label>
          <select
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
            value={action.type}
            onChange={e => onChange({ type: e.target.value as RuleAction['type'] })}
          >
            <option value="gpio_write">Set GPIO output</option>
            <option value="publish">Publish telemetry</option>
            <option value="log">Serial log</option>
            <option value="delay_ms">Delay (ms)</option>
            <option value="restart">Restart ESP</option>
          </select>
        </div>
        {action.type === 'gpio_write' && (
          <>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Pin key</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white font-mono"
                value={action.key ?? ''}
                placeholder="led"
                onChange={e => onChange({ ...action, key: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Value</label>
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
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white font-mono"
                value={action.key ?? ''}
                placeholder="status"
                onChange={e => onChange({ ...action, key: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Value</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                value={String(action.value ?? '')}
                placeholder="1.0 or $value"
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
              onChange={e => onChange({ ...action, msg: e.target.value })}
            />
          </div>
        )}
        {action.type === 'delay_ms' && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Duration (ms)</label>
            <input type="number"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
              value={action.ms ?? 1000}
              min={1}
              onChange={e => onChange({ ...action, ms: Number(e.target.value) })}
            />
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
  rule, onChange, onRemove
}: {
  rule: Rule
  onChange: (r: Rule) => void
  onRemove: () => void
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

      {/* Trigger */}
      <div>
        <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">When</div>
        <TriggerEditor
          trigger={rule.trigger}
          onChange={t => onChange({ ...rule, trigger: t })}
        />
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-green-400 uppercase tracking-wide">Then</div>
          <button
            onClick={addAction}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
          >
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
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function LogicBuilderTab({ deviceId, initialRules }: { deviceId: string; initialRules: Rule[] }) {
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

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <Link to={`/devices/${device.id}`} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-3">
            <ArrowLeft size={16} /> {device.name}
          </Link>
          <h1 className="text-2xl font-bold">Device Builder</h1>
          <p className="text-slate-500 text-sm mt-1">Design the UI and automation rules for this device</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setTab('ui')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'ui'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers size={15} /> UI Builder
          </button>
          <button
            onClick={() => setTab('logic')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'logic'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap size={15} /> Logic Builder
          </button>
        </div>

        {/* Tab content */}
        {tab === 'ui' && (
          <UiBuilderTab deviceId={device.id} initial={initialControls} />
        )}
        {tab === 'logic' && (
          <LogicBuilderTab deviceId={device.id} initialRules={rules} />
        )}
      </main>
    </div>
  )
}
