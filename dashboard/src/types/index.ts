export interface User {
  id: string
  email: string
  role: string
  created_at: string
}

export interface Device {
  id: string
  name: string
  device_token: string
  firmware_version: string | null
  target_firmware_version: string | null
  is_online: boolean
  last_seen: string | null
  ip_address: string | null
  ui_descriptor: UiDescriptor | null
  created_at: string
}

export interface UiDescriptor {
  device_name: string
  firmware_version?: string
  controls: UiControl[]
}

export type UiControlType = 'switch' | 'slider' | 'button' | 'sensor' | 'gauge'

export interface UiControl {
  type: UiControlType
  label: string
  action?: string   // For switch/slider/button: MQTT command action name
  key?: string      // For sensor/gauge: telemetry payload key to display
  unit?: string
  min?: number
  max?: number
  step?: number
}

export interface TelemetryRecord {
  id: number
  device_id: string
  payload: Record<string, unknown>
  recorded_at: string
}

export interface Firmware {
  id: string
  filename: string
  version: string
  file_size: number | null
  checksum: string | null
  created_at: string
}

export interface BuildResult {
  build_id: string
  success: boolean
  bin_url: string | null
  firmware_id: string | null   // DB UUID — pass this to OTA push
  output: string
}

export interface Template {
  id: string
  name: string
  description: string
}
