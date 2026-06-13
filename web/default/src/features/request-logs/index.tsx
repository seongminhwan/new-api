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
import { getRouteApi } from '@tanstack/react-router'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Filter,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionPageLayout } from '@/components/layout'
import {
  clearPersistedRequestLogs,
  clearRequestLogs,
  exportRequestLogs,
  getRequestLog,
  getRequestLogSettings,
  getRequestLogs,
} from './api'
import { RequestLogSettings } from './settings'
import type {
  RequestLogEntry,
  RequestLogHTTPMessage,
  RequestLogListParams,
  RequestLogSummary,
} from './types'
import {
  formatBytes,
  formatDuration,
  formatTimestamp,
  headersToText,
  downloadJson,
  prettyJson,
  requestMessageToCurl,
  statusVariant,
} from './utils'

const route = getRouteApi('/_authenticated/request-logs/')

type Filters = {
  model: string
  requestId: string
  tokenName: string
  channelId: string
  tokenId: string
  statusCode: string
}

const defaultFilters: Filters = {
  model: '',
  requestId: '',
  tokenName: '',
  channelId: '',
  tokenId: '',
  statusCode: '',
}

function compactParams(params: Record<string, string | number | undefined>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value != null)
  )
}

function parseNumberFilter(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function copyText(value: string, successMessage: string) {
  void navigator.clipboard.writeText(value)
  toast.success(successMessage)
}

function BodyBlock({
  title,
  message,
  enableCurl = false,
}: {
  title: string
  message?: RequestLogHTTPMessage
  enableCurl?: boolean
}) {
  const { t } = useTranslation()
  const body = message?.body || ''
  const headers = headersToText(message?.headers)
  const curl = enableCurl ? requestMessageToCurl(message) : ''
  const bodyMeta = [
    message?.method && message?.url
      ? `${message.method.toUpperCase()} ${message.url}`
      : null,
    message?.status ? `${t('Status')}: ${message.status}` : null,
    `${t('Body Size')}: ${formatBytes(message?.body_size)}`,
    message?.body_truncated ? t('Truncated') : null,
  ]
    .filter(Boolean)
    .join(' / ')

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <div className='text-sm font-medium'>{title}</div>
          <div className='text-muted-foreground mt-1 text-xs'>{bodyMeta}</div>
        </div>
        <div className='flex gap-2'>
          {enableCurl && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => copyText(curl, t('curl copied'))}
              disabled={!curl}
            >
              <Copy />
              {t('Copy curl')}
            </Button>
          )}
          <Button
            variant='outline'
            size='sm'
            onClick={() => copyText(headers, t('Headers copied'))}
          >
            <Copy />
            {t('Headers')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => copyText(body, t('Body copied'))}
            disabled={!body}
          >
            <Copy />
            {t('Body')}
          </Button>
        </div>
      </div>
      <div className='grid gap-3 xl:grid-cols-2'>
        <ScrollArea className='bg-muted/20 h-72 rounded-lg border'>
          <pre className='p-3 text-xs break-words whitespace-pre-wrap'>
            {headers}
          </pre>
        </ScrollArea>
        <ScrollArea className='bg-muted/20 h-72 rounded-lg border'>
          <pre className='p-3 text-xs break-words whitespace-pre-wrap'>
            {body || t('Empty body')}
          </pre>
        </ScrollArea>
      </div>
    </div>
  )
}

function DetailOverview({ entry }: { entry: RequestLogEntry }) {
  const { t } = useTranslation()
  const rows = [
    [t('Request ID'), entry.request_id || '-'],
    [t('Upstream Request ID'), entry.upstream_request_id || '-'],
    [
      t('Path'),
      `${entry.method || ''} ${entry.path || ''}${entry.query ? `?${entry.query}` : ''}`,
    ],
    [t('Model'), entry.model || '-'],
    [t('Upstream Model'), entry.upstream_model || '-'],
    [t('User'), entry.username || String(entry.user_id || '-')],
    [t('Group'), entry.group || '-'],
    [t('Token'), entry.token_name || String(entry.token_id || '-')],
    [t('Channel'), entry.channel_name || String(entry.channel_id || '-')],
    [t('Duration'), formatDuration(entry.duration_ms)],
    [t('Retry Index'), entry.retry_index],
    [t('Used Channels'), entry.used_channels?.join(', ') || '-'],
    [t('Approx Bytes'), formatBytes(entry.approx_bytes)],
    [t('Error'), entry.error || '-'],
  ] as const

  return (
    <div className='grid gap-2 md:grid-cols-2'>
      {rows.map(([label, value]) => (
        <div key={label} className='rounded-lg border px-3 py-2'>
          <div className='text-muted-foreground text-xs'>{label}</div>
          <div className='mt-1 text-sm break-words'>{value}</div>
        </div>
      ))}
    </div>
  )
}

function UpstreamAttempts({ entry }: { entry: RequestLogEntry }) {
  const { t } = useTranslation()
  if (!entry.upstream_attempts?.length) {
    return (
      <div className='text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm'>
        {t('No upstream attempts captured')}
      </div>
    )
  }

  return (
    <div className='space-y-5'>
      {entry.upstream_attempts.map((attempt) => (
        <div key={attempt.index} className='space-y-3 rounded-lg border p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>
              {t('Attempt {{index}}', { index: attempt.index })}
            </Badge>
            <Badge variant={statusVariant(attempt.response?.status)}>
              {attempt.response?.status || attempt.error || '-'}
            </Badge>
            <span className='text-muted-foreground text-xs'>
              {attempt.channel_name || attempt.channel_id || '-'} /{' '}
              {formatDuration(attempt.duration_ms)}
            </span>
          </div>
          {attempt.error && (
            <pre className='bg-muted/20 rounded-lg border p-3 text-xs whitespace-pre-wrap'>
              {attempt.error}
            </pre>
          )}
          <BodyBlock
            title={t('Upstream Request')}
            message={attempt.request}
            enableCurl
          />
          <BodyBlock
            title={t('Upstream Response')}
            message={attempt.response}
          />
        </div>
      ))}
    </div>
  )
}

function RequestLogDetailSheet({
  id,
  open,
  onOpenChange,
}: {
  id: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['request-log', id],
    queryFn: () => getRequestLog(id || ''),
    enabled: Boolean(id && open),
  })

  const entry = data?.data

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full sm:max-w-5xl'>
        <SheetHeader>
          <SheetTitle>{t('Bypass Debug Detail')}</SheetTitle>
          <SheetDescription>
            {entry
              ? `${formatTimestamp(entry.created_at)} / ${entry.model || '-'}`
              : t('Loading')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className='min-h-0 flex-1 px-4 pb-4'>
          {isLoading || !entry ? (
            <div className='space-y-3'>
              <Skeleton className='h-20 w-full' />
              <Skeleton className='h-72 w-full' />
            </div>
          ) : (
            <Tabs defaultValue='overview' className='gap-4'>
              <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
                <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
                <TabsTrigger value='client'>{t('Client Request')}</TabsTrigger>
                <TabsTrigger value='upstream'>{t('Upstream')}</TabsTrigger>
                <TabsTrigger value='response'>
                  {t('Client Response')}
                </TabsTrigger>
                <TabsTrigger value='json'>{t('JSON')}</TabsTrigger>
              </TabsList>

              <TabsContent value='overview'>
                <DetailOverview entry={entry} />
              </TabsContent>
              <TabsContent value='client'>
                <BodyBlock
                  title={t('Client Request')}
                  message={entry.client_request}
                  enableCurl
                />
              </TabsContent>
              <TabsContent value='upstream'>
                <UpstreamAttempts entry={entry} />
              </TabsContent>
              <TabsContent value='response'>
                <BodyBlock
                  title={t('Client Response')}
                  message={entry.client_response}
                />
              </TabsContent>
              <TabsContent value='json'>
                <div className='flex justify-end pb-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      copyText(prettyJson(entry), t('JSON copied'))
                    }
                  >
                    <Copy />
                    {t('Copy JSON')}
                  </Button>
                </div>
                <ScrollArea className='bg-muted/20 h-[70vh] rounded-lg border'>
                  <pre className='p-3 text-xs break-words whitespace-pre-wrap'>
                    {prettyJson(entry)}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function FiltersBar({
  filters,
  setFilters,
  onApply,
  onReset,
}: {
  filters: Filters
  setFilters: (filters: Filters) => void
  onApply: () => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const update = (patch: Partial<Filters>) =>
    setFilters({ ...filters, ...patch })

  return (
    <div className='rounded-lg border p-3'>
      <div className='grid gap-3 md:grid-cols-3 xl:grid-cols-6'>
        <div className='space-y-1.5'>
          <Label>{t('Model')}</Label>
          <Input
            value={filters.model}
            onChange={(event) => update({ model: event.target.value })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Request ID')}</Label>
          <Input
            value={filters.requestId}
            onChange={(event) => update({ requestId: event.target.value })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Token Name')}</Label>
          <Input
            value={filters.tokenName}
            onChange={(event) => update({ tokenName: event.target.value })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Channel ID')}</Label>
          <Input
            value={filters.channelId}
            onChange={(event) => update({ channelId: event.target.value })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Token ID')}</Label>
          <Input
            value={filters.tokenId}
            onChange={(event) => update({ tokenId: event.target.value })}
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('Status Code')}</Label>
          <Input
            value={filters.statusCode}
            onChange={(event) => update({ statusCode: event.target.value })}
          />
        </div>
      </div>
      <div className='mt-3 flex flex-wrap justify-end gap-2'>
        <Button variant='outline' onClick={onReset}>
          {t('Reset')}
        </Button>
        <Button onClick={onApply}>
          <Filter />
          {t('Apply Filters')}
        </Button>
      </div>
    </div>
  )
}

function RequestLogRow({
  item,
  selected,
  onSelectedChange,
  onOpen,
}: {
  item: RequestLogSummary
  selected: boolean
  onSelectedChange: (id: string, checked: boolean) => void
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) =>
            onSelectedChange(item.id, checked === true)
          }
          aria-label={t('Select log')}
        />
      </TableCell>
      <TableCell>
        <div className='text-sm font-medium'>
          {formatTimestamp(item.created_at)}
        </div>
        <div className='text-muted-foreground text-xs'>
          {item.request_id || item.upstream_request_id || item.id}
        </div>
      </TableCell>
      <TableCell>
        <div className='font-medium'>{item.model || '-'}</div>
        <div className='text-muted-foreground text-xs'>
          {item.stream ? t('stream') : t('non-stream')}
        </div>
      </TableCell>
      <TableCell>
        <div>{item.channel_name || item.channel_id || '-'}</div>
        <div className='text-muted-foreground text-xs'>
          {item.used_channels?.join(', ') || '-'}
        </div>
      </TableCell>
      <TableCell>
        <div>{item.token_name || item.token_id || '-'}</div>
        <div className='text-muted-foreground text-xs'>
          {item.username || item.user_id || '-'}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(item.status_code)}>
          {item.status_code || '-'}
        </Badge>
      </TableCell>
      <TableCell>{formatDuration(item.duration_ms)}</TableCell>
      <TableCell>
        <div>{formatBytes(item.approx_bytes)}</div>
        {item.truncated && (
          <Badge variant='secondary' className='mt-1'>
            {t('Truncated')}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Button variant='outline' size='sm' onClick={() => onOpen(item.id)}>
          {t('Detail')}
        </Button>
      </TableCell>
    </TableRow>
  )
}

function TableSkeleton() {
  return (
    <div className='space-y-2'>
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className='h-14 w-full' />
      ))}
    </div>
  )
}

export function RequestLogs() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultFilters,
    model: search.model || '',
    requestId: search.requestId || '',
    tokenName: search.tokenName || '',
    channelId: search.channelId ? String(search.channelId) : '',
    tokenId: search.tokenId ? String(search.tokenId) : '',
    statusCode: search.statusCode ? String(search.statusCode) : '',
  }))

  useEffect(() => {
    setFilters({
      ...defaultFilters,
      model: search.model || '',
      requestId: search.requestId || '',
      tokenName: search.tokenName || '',
      channelId: search.channelId ? String(search.channelId) : '',
      tokenId: search.tokenId ? String(search.tokenId) : '',
      statusCode: search.statusCode ? String(search.statusCode) : '',
    })
  }, [search])

  const page = search.page || 1
  const pageSize = search.pageSize || 20

  const apiParams = useMemo<RequestLogListParams>(
    () => ({
      p: page,
      page_size: pageSize,
      model: search.model,
      request_id: search.requestId,
      token_name: search.tokenName,
      channel_id: search.channelId,
      token_id: search.tokenId,
      status_code: search.statusCode,
    }),
    [page, pageSize, search]
  )

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['request-logs', apiParams],
    queryFn: () => getRequestLogs(apiParams),
    placeholderData: (previous) => previous,
  })

  const { data: settingsData } = useQuery({
    queryKey: ['request-log-settings'],
    queryFn: getRequestLogSettings,
  })

  const pageData = data?.data
  const items = pageData?.items || []
  const total = pageData?.total || 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const selectableIds = useMemo(() => items.map((item) => item.id), [items])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id))
  const samplingStats = settingsData?.data?.stats
  const samplingSettings = settingsData?.data?.settings
  const memorySamplingAvailable = Boolean(
    samplingStats && !samplingStats.stopped && samplingStats.max_entries > 0
  )
  const databaseSamplingAvailable = Boolean(
    samplingSettings?.persist_enabled &&
      samplingStats &&
      samplingStats.persist_max > 0 &&
      samplingStats.persist_queue_size > 0 &&
      samplingStats.persist_stored + samplingStats.persist_queued <
        samplingStats.persist_max &&
      samplingStats.persist_queued < samplingStats.persist_queue_size
  )
  const samplingEnabled = Boolean(
    samplingSettings?.enabled &&
      (memorySamplingAvailable || databaseSamplingAvailable)
  )

  useEffect(() => {
    if (page > pageCount) {
      void navigate({
        search: (prev) => ({
          ...prev,
          page: pageCount <= 1 ? undefined : pageCount,
        }),
        replace: true,
      })
    }
  }, [navigate, page, pageCount])

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => selectableIds.includes(id)))
  }, [selectableIds])

  const clearMutation = useMutation({
    mutationFn: clearRequestLogs,
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Clear failed'))
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['request-logs'] })
      void queryClient.invalidateQueries({ queryKey: ['request-log-settings'] })
      setSelectedIds([])
      toast.success(t('Cleared'))
    },
  })

  const clearHistoryMutation = useMutation({
    mutationFn: clearPersistedRequestLogs,
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Delete failed'))
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['request-logs'] })
      void queryClient.invalidateQueries({ queryKey: ['request-log-settings'] })
      setSelectedIds([])
      toast.success(t('Database history deleted'))
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => exportRequestLogs(selectedIds),
    onSuccess: (res) => {
      if (!res.success || !res.data) {
        toast.error(res.message || t('Export failed'))
        return
      }
      downloadJson(`bypass-debug-logs-${Date.now()}.json`, res.data.items)
      toast.success(t('Downloaded selected logs'))
    },
  })

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((item) => item !== id)
    })
  }

  const togglePageSelected = (checked: boolean) => {
    setSelectedIds(checked ? selectableIds : [])
  }

  const applyFilters = () => {
    void navigate({
      search: {
        page: undefined,
        pageSize,
        ...compactParams({
          model: filters.model.trim(),
          requestId: filters.requestId.trim(),
          tokenName: filters.tokenName.trim(),
          channelId: parseNumberFilter(filters.channelId),
          tokenId: parseNumberFilter(filters.tokenId),
          statusCode: parseNumberFilter(filters.statusCode),
        }),
      },
    })
  }

  const resetFilters = () => {
    setFilters(defaultFilters)
    void navigate({
      search: { page: undefined, pageSize },
    })
  }

  const changePageSize = (nextPageSize: number) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        page: undefined,
        pageSize: nextPageSize,
      }),
    })
  }

  const changePage = (nextPage: number) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        page: nextPage <= 1 ? undefined : nextPage,
      }),
    })
  }

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Bypass Debug')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <div className='text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm'>
            <span
              className={
                samplingEnabled
                  ? 'size-2 rounded-full bg-emerald-500'
                  : 'size-2 rounded-full bg-red-500'
              }
            />
            {samplingEnabled ? t('Sampling') : t('Sampling paused')}
          </div>
          <Button
            variant='outline'
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ['request-logs'] })
            }
          >
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
            {t('Refresh')}
          </Button>
          <Button variant='outline' onClick={() => setSettingsOpen(true)}>
            <Settings />
            {t('Configure Bypass Debug')}
          </Button>
          <Button
            variant='outline'
            onClick={() => exportMutation.mutate()}
            disabled={selectedIds.length === 0 || exportMutation.isPending}
          >
            <Download />
            {t('Download Selected')}
          </Button>
          <Button
            variant='destructive'
            onClick={() => {
              if (window.confirm(t('Clear all bypass debug logs?'))) {
                clearMutation.mutate()
              }
            }}
            disabled={clearMutation.isPending}
          >
            <Trash2 />
            {t('Clear')}
          </Button>
          <Button
            variant='destructive'
            onClick={() => {
              if (window.confirm(t('Delete database history logs?'))) {
                clearHistoryMutation.mutate()
              }
            }}
            disabled={clearHistoryMutation.isPending}
          >
            <Trash2 />
            {t('Delete DB History')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-4'>
            <FiltersBar
              filters={filters}
              setFilters={setFilters}
              onApply={applyFilters}
              onReset={resetFilters}
            />

            <div className='rounded-lg border'>
              <div className='flex flex-wrap items-center justify-between gap-3 border-b p-3'>
                <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                  <Search className='size-4' />
                  {t('Total {{total}} logs', { total })}
                  {selectedIds.length > 0 && (
                    <Badge variant='secondary'>
                      {t('{{count}} selected', { count: selectedIds.length })}
                    </Badge>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  <NativeSelect
                    value={String(pageSize)}
                    onChange={(event) =>
                      changePageSize(Number.parseInt(event.target.value, 10))
                    }
                  >
                    {[10, 20, 50, 100].map((size) => (
                      <NativeSelectOption key={size} value={String(size)}>
                        {size}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <span className='text-muted-foreground text-sm'>
                    {t('Rows per page')}
                  </span>
                </div>
              </div>

              {isLoading ? (
                <div className='p-3'>
                  <TableSkeleton />
                </div>
              ) : items.length === 0 ? (
                <div className='text-muted-foreground p-10 text-center text-sm'>
                  {t('No bypass debug logs found')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-10'>
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={(checked) =>
                            togglePageSelected(checked === true)
                          }
                          aria-label={t('Select current page')}
                        />
                      </TableHead>
                      <TableHead>{t('Time')}</TableHead>
                      <TableHead>{t('Model')}</TableHead>
                      <TableHead>{t('Channel')}</TableHead>
                      <TableHead>{t('Token')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                      <TableHead>{t('Duration')}</TableHead>
                      <TableHead>{t('Size')}</TableHead>
                      <TableHead>{t('Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <RequestLogRow
                        key={item.id}
                        item={item}
                        selected={selectedSet.has(item.id)}
                        onSelectedChange={toggleSelected}
                        onOpen={setSelectedId}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}

              <div className='flex flex-wrap items-center justify-between gap-3 border-t p-3'>
                <div className='text-muted-foreground text-sm'>
                  {t('Page {{current}} of {{total}}', {
                    current: page,
                    total: pageCount,
                  })}
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1}
                    onClick={() => changePage(Math.max(1, page - 1))}
                  >
                    <ChevronLeft />
                    {t('Previous')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page >= pageCount}
                    onClick={() => changePage(Math.min(pageCount, page + 1))}
                  >
                    {t('Next')}
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <RequestLogDetailSheet
        id={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      />
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className='w-full sm:max-w-5xl'>
          <SheetHeader>
            <SheetTitle>{t('Configure Bypass Debug')}</SheetTitle>
            <SheetDescription>
              {t('Control sampling, capacity, and retention.')}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className='min-h-0 flex-1 px-4 pb-4'>
            <RequestLogSettings embedded />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
