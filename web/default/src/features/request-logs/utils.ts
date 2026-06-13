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
import type { TFunction } from 'i18next'
import type { RequestLogHTTPMessage } from './types'

export const DEFAULT_REQUEST_LOG_MAX_ENTRY_MB = 4
export const DEFAULT_REQUEST_LOG_MAX_TOTAL_MB = 64

export function parseCsvStrings(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseCsvNumbers(value: string): number[] {
  return parseCsvStrings(value)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0)
}

export function joinCsv(values?: Array<string | number>): string {
  return (values ?? []).join(', ')
}

export function bytesToMb(bytes?: number): number {
  if (!bytes) return 0
  return Number((bytes / 1024 / 1024).toFixed(2))
}

export function mbToBytes(mb: number): number {
  return Math.max(0, Math.round(mb * 1024 * 1024))
}

export function formatBytes(bytes?: number): string {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatDuration(ms?: number): string {
  const value = Number(ms || 0)
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(2)} s`
}

export function formatTimestamp(seconds?: number): string {
  if (!seconds) return '-'
  return new Date(seconds * 1000).toLocaleString()
}

export function statusVariant(
  status?: number
): 'outline' | 'destructive' | 'secondary' {
  if (!status) return 'outline'
  if (status >= 500) return 'destructive'
  if (status >= 400) return 'secondary'
  return 'outline'
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value ?? '')
  }
}

export function headersToText(headers?: Record<string, string[]>): string {
  if (!headers || Object.keys(headers).length === 0) return '{}'
  return prettyJson(headers)
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function requestMessageToCurl(message?: RequestLogHTTPMessage): string {
  if (!message?.url) return ''
  const method = (message.method || 'POST').toUpperCase()
  const lines = [
    `curl ${shellQuote(message.url)}`,
    `  -X ${shellQuote(method)}`,
  ]

  Object.entries(message.headers || {}).forEach(([name, values]) => {
    values.forEach((value) => {
      lines.push(`  -H ${shellQuote(`${name}: ${value}`)}`)
    })
  })

  if (message.body) {
    lines.push(`  --data-raw ${shellQuote(message.body)}`)
  }

  return lines.join(' \\\n')
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([prettyJson(value)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function sampleRateLabel(
  rate: number | undefined,
  t: TFunction
): string {
  if (rate == null) return t('Use global sample rate')
  return `${Math.round(rate * 10000) / 100}%`
}

export function rateToPercent(rate: number | undefined): number | '' {
  if (rate == null) return ''
  return Math.round(rate * 10000) / 100
}

export function percentToRate(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  if (percent < 0) return 0
  if (percent > 100) return 1
  return percent / 100
}
