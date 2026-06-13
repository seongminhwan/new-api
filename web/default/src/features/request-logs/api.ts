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
import { api } from '@/lib/api'
import type {
  ApiResponse,
  RequestLogEntry,
  RequestLogExportPayload,
  RequestLogListParams,
  RequestLogOptionsPayload,
  RequestLogPage,
  RequestLogSettings,
  RequestLogSettingsPayload,
  RequestLogStats,
} from './types'

export async function getRequestLogSettings(): Promise<
  ApiResponse<RequestLogSettingsPayload>
> {
  const res = await api.get('/api/request-logs/settings')
  return res.data
}

export async function getRequestLogOptions(): Promise<
  ApiResponse<RequestLogOptionsPayload>
> {
  const res = await api.get('/api/request-logs/options')
  return res.data
}

export async function updateRequestLogSettings(
  settings: RequestLogSettings
): Promise<ApiResponse<RequestLogSettingsPayload>> {
  const res = await api.put('/api/request-logs/settings', settings)
  return res.data
}

export async function getRequestLogs(
  params: RequestLogListParams
): Promise<ApiResponse<RequestLogPage>> {
  const res = await api.get('/api/request-logs/', { params })
  return res.data
}

export async function getRequestLog(
  id: string
): Promise<ApiResponse<RequestLogEntry>> {
  const res = await api.get(`/api/request-logs/${id}`)
  return res.data
}

export async function exportRequestLogs(
  ids: string[]
): Promise<ApiResponse<RequestLogExportPayload>> {
  const res = await api.post('/api/request-logs/export', { ids })
  return res.data
}

export async function clearRequestLogs(): Promise<
  ApiResponse<RequestLogStats>
> {
  const res = await api.delete('/api/request-logs/')
  return res.data
}

export async function clearPersistedRequestLogs(): Promise<
  ApiResponse<RequestLogStats>
> {
  const res = await api.delete('/api/request-logs/history')
  return res.data
}
