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
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { MultiSelect } from '@/components/multi-select'
import { SectionPageLayout } from '@/components/layout'
import {
  getRequestLogOptions,
  getRequestLogSettings,
  updateRequestLogSettings,
} from './api'
import type {
  RequestLogOptionsPayload,
  RequestLogRule,
  RequestLogSettings as RequestLogSettingsType,
  RequestLogStats,
} from './types'
import {
  DEFAULT_REQUEST_LOG_MAX_ENTRY_MB,
  DEFAULT_REQUEST_LOG_MAX_TOTAL_MB,
  bytesToMb,
  formatBytes,
  mbToBytes,
  percentToRate,
  rateToPercent,
  sampleRateLabel,
} from './utils'

const defaultSettings: RequestLogSettingsType = {
  enabled: false,
  sample_rate: 1,
  max_entries: 200,
  overflow_strategy: 'replace_oldest',
  max_entry_bytes: mbToBytes(DEFAULT_REQUEST_LOG_MAX_ENTRY_MB),
  max_total_bytes: mbToBytes(DEFAULT_REQUEST_LOG_MAX_TOTAL_MB),
  rules: [],
}

function newRule(): RequestLogRule {
  return {
    enabled: true,
    channel_ids: [],
    models: [],
    token_ids: [],
    token_names: [],
    token_keys: [],
  }
}

function numberFromInput(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clampRate(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function toNumberValues(values: string[]): number[] {
  return values
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function toStringValues(values?: number[]): string[] {
  return (values || []).map((value) => String(value))
}

function channelLabel(channel: RequestLogOptionsPayload['channels'][number]) {
  return `#${channel.id} ${channel.name || 'Unnamed'}`
}

function tokenLabel(token: RequestLogOptionsPayload['tokens'][number]) {
  const owner = token.username || token.display_name || `user ${token.user_id}`
  return `#${token.id} ${token.name || 'Unnamed'} · ${owner}`
}

function sanitizeSettings(
  settings: RequestLogSettingsType
): RequestLogSettingsType {
  return {
    ...settings,
    sample_rate: clampRate(Number(settings.sample_rate) || 0),
    max_entries: Math.max(1, Math.floor(Number(settings.max_entries) || 1)),
    max_entry_bytes: Math.max(
      1,
      Math.floor(Number(settings.max_entry_bytes) || 1)
    ),
    max_total_bytes: Math.max(
      1,
      Math.floor(Number(settings.max_total_bytes) || 1)
    ),
    rules: (settings.rules || []).map((rule) => ({
      enabled: rule.enabled !== false,
      channel_ids: (rule.channel_ids || []).filter((item) => item > 0),
      models: (rule.models || []).map((item) => item.trim()).filter(Boolean),
      token_ids: (rule.token_ids || []).filter((item) => item > 0),
      token_names: [],
      token_keys: [],
      sample_rate:
        rule.sample_rate == null
          ? undefined
          : clampRate(Number(rule.sample_rate)),
    })),
  }
}

type StatItemProps = {
  label: string
  value: string | number
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className='rounded-lg border px-3 py-2'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='mt-1 text-sm font-medium'>{value}</div>
    </div>
  )
}

type RuleEditorProps = {
  rule: RequestLogRule
  index: number
  options?: RequestLogOptionsPayload
  onChange: (rule: RequestLogRule) => void
  onRemove: () => void
}

function RuleEditor({
  rule,
  index,
  options,
  onChange,
  onRemove,
}: RuleEditorProps) {
  const { t } = useTranslation()
  const update = (patch: Partial<RequestLogRule>) => {
    onChange({ ...rule, ...patch })
  }
  const channelOptions =
    options?.channels.map((channel) => ({
      label: channelLabel(channel),
      value: String(channel.id),
    })) || []
  const modelOptions =
    options?.models.map((model) => ({ label: model, value: model })) || []
  const tokenOptions =
    options?.tokens.map((token) => ({
      label: tokenLabel(token),
      value: String(token.id),
    })) || []

  return (
    <div className='rounded-lg border p-4'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Badge variant='secondary'>
            {t('Rule {{index}}', { index: index + 1 })}
          </Badge>
          <Switch
            checked={rule.enabled !== false}
            onCheckedChange={(checked) => update({ enabled: checked })}
          />
        </div>
        <Button variant='ghost' size='icon-sm' onClick={onRemove}>
          <Trash2 />
          <span className='sr-only'>{t('Delete')}</span>
        </Button>
      </div>

      <div className='grid gap-3 md:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label>{t('Channels')}</Label>
          <MultiSelect
            options={channelOptions}
            selected={toStringValues(rule.channel_ids)}
            placeholder={t('Search and select channels')}
            emptyText={t('No channels found')}
            onChange={(values) => update({ channel_ids: toNumberValues(values) })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Models')}</Label>
          <MultiSelect
            options={modelOptions}
            selected={rule.models || []}
            placeholder={t('Search or enter models')}
            emptyText={t('No models found')}
            allowCreate
            createLabel='Add custom model "{{value}}"'
            onChange={(values) => update({ models: values })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('API Keys')}</Label>
          <MultiSelect
            options={tokenOptions}
            selected={toStringValues(rule.token_ids)}
            placeholder={t('Search and select API keys')}
            emptyText={t('No API keys found')}
            onChange={(values) =>
              update({
                token_ids: toNumberValues(values),
                token_names: [],
                token_keys: [],
              })
            }
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Rule Sample Rate (%)')}</Label>
          <Input
            type='number'
            min='0'
            max='100'
            step='1'
            value={rateToPercent(rule.sample_rate)}
            placeholder={t('Use global sample rate')}
            onChange={(event) => {
              const value = event.target.value
              update({
                sample_rate:
                  value === '' ? undefined : percentToRate(Number(value)),
              })
            }}
          />
        </div>
        <div className='text-muted-foreground flex items-end text-sm'>
          {sampleRateLabel(rule.sample_rate, t)}
        </div>
      </div>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-24 w-full' />
      <Skeleton className='h-48 w-full' />
      <Skeleton className='h-32 w-full' />
    </div>
  )
}

function StatsBlock({ stats }: { stats?: RequestLogStats }) {
  const { t } = useTranslation()
  if (!stats) return null

  return (
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <StatItem label={t('Buffered Logs')} value={stats.total} />
      <StatItem
        label={t('Buffered Bytes')}
        value={formatBytes(stats.total_bytes)}
      />
      <StatItem label={t('Dropped Logs')} value={stats.dropped} />
      <StatItem label={t('Truncated Logs')} value={stats.truncated} />
    </div>
  )
}

export function RequestLogSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<RequestLogSettingsType>(defaultSettings)

  const { data, isLoading } = useQuery({
    queryKey: ['request-log-settings'],
    queryFn: getRequestLogSettings,
  })
  const { data: optionsData } = useQuery({
    queryKey: ['request-log-options'],
    queryFn: getRequestLogOptions,
  })

  useEffect(() => {
    if (data?.success && data.data?.settings) {
      setForm({
        ...defaultSettings,
        ...data.data.settings,
        rules: data.data.settings.rules || [],
      })
    }
  }, [data])

  const stats = data?.data?.stats
  const entryMb = useMemo(
    () => bytesToMb(form.max_entry_bytes),
    [form.max_entry_bytes]
  )
  const totalMb = useMemo(
    () => bytesToMb(form.max_total_bytes),
    [form.max_total_bytes]
  )

  const saveMutation = useMutation({
    mutationFn: () => updateRequestLogSettings(sanitizeSettings(form)),
    onSuccess: (res) => {
      if (!res.success || !res.data) {
        toast.error(res.message || t('Save failed'))
        return
      }
      setForm(res.data.settings)
      queryClient.setQueryData(['request-log-settings'], res)
      toast.success(t('Saved'))
    },
  })

  const updateRule = (index: number, rule: RequestLogRule) => {
    setForm((prev) => ({
      ...prev,
      rules: prev.rules.map((item, itemIndex) =>
        itemIndex === index ? rule : item
      ),
    }))
  }

  const removeRule = (index: number) => {
    setForm((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  if (isLoading) {
    return (
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Request Log Settings')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <SettingsSkeleton />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Request Log Settings')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' render={<Link to='/request-logs' />}>
          {t('View Request Logs')}
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <Save />
          {t('Save')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-5'>
          <StatsBlock stats={stats} />

          <div className='rounded-lg border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <div className='text-sm font-medium'>
                  {t('Enable Request Logs')}
                </div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {stats?.stopped
                    ? t('Sampling is stopped by the overflow strategy')
                    : t(
                        'Only super admins can configure and view request logs'
                      )}
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>

            <div className='mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
              <div className='space-y-1.5'>
                <Label>{t('Global Sample Rate (%)')}</Label>
                <Input
                  type='number'
                  min='0'
                  max='100'
                  step='1'
                  value={rateToPercent(form.sample_rate)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      sample_rate: percentToRate(
                        numberFromInput(
                          event.target.value,
                          rateToPercent(prev.sample_rate) || 100
                        )
                      ),
                    }))
                  }
                />
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Max Logs')}</Label>
                <Input
                  type='number'
                  min='1'
                  step='1'
                  value={form.max_entries}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      max_entries: Math.max(
                        1,
                        Math.floor(
                          numberFromInput(event.target.value, prev.max_entries)
                        )
                      ),
                    }))
                  }
                />
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Overflow Strategy')}</Label>
                <NativeSelect
                  className='w-full'
                  value={form.overflow_strategy}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      overflow_strategy: event.target
                        .value as RequestLogSettingsType['overflow_strategy'],
                    }))
                  }
                >
                  <NativeSelectOption value='replace_oldest'>
                    {t('Replace oldest')}
                  </NativeSelectOption>
                  <NativeSelectOption value='stop_sampling'>
                    {t('Stop sampling')}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Entry Limit MB')}</Label>
                <Input
                  type='number'
                  min='1'
                  step='1'
                  value={entryMb}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      max_entry_bytes: mbToBytes(
                        Math.max(
                          1,
                          numberFromInput(event.target.value, entryMb)
                        )
                      ),
                    }))
                  }
                />
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Total Limit MB')}</Label>
                <Input
                  type='number'
                  min='1'
                  step='1'
                  value={totalMb}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      max_total_bytes: mbToBytes(
                        Math.max(
                          1,
                          numberFromInput(event.target.value, totalMb)
                        )
                      ),
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <div className='text-sm font-medium'>{t('Sampling Rules')}</div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {t('Rules are matched in order')}
                </div>
              </div>
              <Button
                variant='outline'
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    rules: [...(prev.rules || []), newRule()],
                  }))
                }
              >
                <Plus />
                {t('Add Rule')}
              </Button>
            </div>

            {form.rules.length === 0 ? (
              <div className='text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm'>
                {t('No sampling rules')}
              </div>
            ) : (
              <div className='space-y-3'>
                {form.rules.map((rule, index) => (
                  <RuleEditor
                    key={index}
                    rule={rule}
                    index={index}
                    options={optionsData?.data}
                    onChange={(nextRule) => updateRule(index, nextRule)}
                    onRemove={() => removeRule(index)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              variant='outline'
              onClick={() =>
                setForm({
                  ...(data?.data?.settings || defaultSettings),
                  rules: data?.data?.settings.rules || [],
                })
              }
            >
              <RotateCcw />
              {t('Reset')}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save />
              {t('Save')}
            </Button>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
