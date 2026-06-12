/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

export type ApiResponse<T = unknown> = {
  success: boolean
  message?: string
  data?: T
}

export type RequestLogOverflowStrategy = 'replace_oldest' | 'stop_sampling'

export type RequestLogRule = {
  enabled: boolean
  channel_ids?: number[]
  models?: string[]
  token_ids?: number[]
  token_names?: string[]
  token_keys?: string[]
  sample_rate?: number
}

export type RequestLogSettings = {
  enabled: boolean
  sample_rate: number
  max_entries: number
  overflow_strategy: RequestLogOverflowStrategy
  max_entry_bytes: number
  max_total_bytes: number
  rules: RequestLogRule[]
}

export type RequestLogStats = {
  total: number
  total_bytes: number
  stopped: boolean
  dropped: number
  truncated: number
  next_id: number
  max_entries: number
  max_entry_bytes: number
  max_total_bytes: number
  overflow_strategy: RequestLogOverflowStrategy
}

export type RequestLogSettingsPayload = {
  settings: RequestLogSettings
  stats: RequestLogStats
}

export type RequestLogChannelOption = {
  id: number
  name: string
  type: number
  status: number
  models: string[]
}

export type RequestLogTokenOption = {
  id: number
  name: string
  user_id: number
  username: string
  display_name: string
  group: string
  status: number
}

export type RequestLogOptionsPayload = {
  channels: RequestLogChannelOption[]
  models: string[]
  tokens: RequestLogTokenOption[]
}

export type RequestLogHTTPMessage = {
  status?: number
  headers?: Record<string, string[]>
  body?: string
  body_size: number
  body_truncated: boolean
}

export type RequestLogAttempt = {
  index: number
  started_at: number
  duration_ms: number
  channel_id: number
  channel_name: string
  channel_type: number
  error?: string
  request: RequestLogHTTPMessage
  response: RequestLogHTTPMessage
}

export type RequestLogSummary = {
  id: string
  created_at: number
  duration_ms: number
  method: string
  path: string
  request_id: string
  upstream_request_id: string
  stream: boolean
  model: string
  upstream_model: string
  user_id: number
  username: string
  token_id: number
  token_name: string
  channel_id: number
  channel_name: string
  channel_type: number
  status_code: number
  error?: string
  retry_index: number
  used_channels: string[]
  truncated: boolean
  approx_bytes: number
  request_body_size: number
  response_body_size: number
  upstream_body_size: number
}

export type RequestLogEntry = RequestLogSummary & {
  created_at_text: string
  query: string
  group: string
  token_key: string
  client_request: RequestLogHTTPMessage
  client_response: RequestLogHTTPMessage
  upstream_attempts: RequestLogAttempt[]
}

export type RequestLogPage = {
  page: number
  page_size: number
  total: number
  items: RequestLogSummary[]
}

export type RequestLogListParams = {
  p?: number
  page_size?: number
  model?: string
  request_id?: string
  token_name?: string
  channel_id?: number | string
  token_id?: number | string
  status_code?: number | string
}
