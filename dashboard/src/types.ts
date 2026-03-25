export interface User {
  id: string
  email: string
  role: string
  created_at: string
}

export interface UiControl {
  type: 'switch' | 'button' | 'slider' | 'sensor' | 'gauge'
  label: string
  action?: string
  key?: string
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface UiDescriptor {
  device_name?: string
  firmware_version?: string
  controls: UiControl[]
}

export interface Device {
  id: string
  name: string
  device_token: string
  is_online: boolean
  last_seen: string | null
  firmware_version: string | null
  target_firmware_version: string | null
  ip_address: string | null
  ui_descriptor: UiDescriptor | null
  owner_id: string
  created_at: string
}

export interface BuildResult {
  success: boolean
  output: string
  bin_url: string | null
  build_id: string | null
  firmware_id: string | null
}

export interface Template {
  id: string
  name: string
  description?: string
}
