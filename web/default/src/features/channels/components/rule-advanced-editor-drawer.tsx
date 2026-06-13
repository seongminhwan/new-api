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
import { Code2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type RuleAdvancedEditorKind =
  | 'request_match'
  | 'error_override'
  | 'param_override'
  | 'response_override'
  | 'response_header_override'

type RuleAdvancedEditorDrawerProps = {
  open: boolean
  kind: RuleAdvancedEditorKind
  value: string
  onOpenChange: (open: boolean) => void
  onSave: (value: string) => void
}

type FieldScope =
  | 'request_body'
  | 'request_header'
  | 'request_query'
  | 'response_body'
  | 'response_header'
  | 'response_header_name'
  | 'stream'
  | 'context'

type FieldCatalogItem = {
  protocol: string
  scope: FieldScope
  path: string
  label: string
  example?: string
}

type SelectOption = {
  value: string
  label: string
}

const FIELD_CATALOG: FieldCatalogItem[] = [
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'model',
    label: 'Request model',
    example: 'gpt-4.1',
  },
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'stream',
    label: 'Stream flag',
    example: 'false',
  },
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'messages.0.role',
    label: 'First message role',
    example: 'user',
  },
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'messages.0.content',
    label: 'First message content',
  },
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'temperature',
    label: 'Temperature',
    example: '0.7',
  },
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'top_p',
    label: 'Top P',
    example: '1',
  },
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'max_tokens',
    label: 'Max tokens',
    example: '4096',
  },
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'tools.0.type',
    label: 'First tool type',
    example: 'function',
  },
  {
    protocol: 'Common',
    scope: 'request_body',
    path: 'response_format.type',
    label: 'Response format type',
    example: 'json_object',
  },
  {
    protocol: 'Common',
    scope: 'request_header',
    path: 'Authorization',
    label: 'Authorization header',
    example: 'Bearer ...',
  },
  {
    protocol: 'Common',
    scope: 'request_header',
    path: 'User-Agent',
    label: 'User agent',
  },
  {
    protocol: 'Common',
    scope: 'request_query',
    path: 'stream',
    label: 'Stream query flag',
    example: 'true',
  },
  {
    protocol: 'Common',
    scope: 'context',
    path: 'original_model',
    label: 'Original model',
  },
  {
    protocol: 'Common',
    scope: 'context',
    path: 'upstream_model',
    label: 'Upstream model',
  },
  {
    protocol: 'Common',
    scope: 'context',
    path: 'retry_count',
    label: 'Retry count',
    example: '1',
  },
  {
    protocol: 'Common',
    scope: 'context',
    path: 'last_error.status',
    label: 'Last retry status',
    example: '429',
  },
  {
    protocol: 'Common',
    scope: 'response_header_name',
    path: 'Content-Type',
    label: 'Response header name',
    example: 'application/json',
  },
  {
    protocol: 'Common',
    scope: 'response_header_name',
    path: 'Retry-After',
    label: 'Response header name',
    example: '30',
  },
  {
    protocol: 'Common',
    scope: 'response_header_name',
    path: 'X-Litellm-*',
    label: 'Header wildcard selector',
    example: 'matches X-Litellm-Response-Cost',
  },
  {
    protocol: 'Common',
    scope: 'response_header_name',
    path: 'prefix:X-Litellm-',
    label: 'Header prefix selector',
    example: 'matches all X-Litellm-* headers',
  },
  {
    protocol: 'Common',
    scope: 'response_header_name',
    path: 're:^X-Litellm-',
    label: 'Header regex selector',
    example: 'matches all X-Litellm-* headers',
  },
  {
    protocol: 'Common',
    scope: 'response_header',
    path: 'response.status',
    label: 'Response HTTP status',
    example: '200',
  },
  {
    protocol: 'Common',
    scope: 'response_header',
    path: 'upstream_response.status',
    label: 'Upstream HTTP status',
    example: '200',
  },
  {
    protocol: 'Common',
    scope: 'response_header',
    path: 'response.headers.content-type',
    label: 'Response Content-Type header',
    example: 'application/json',
  },
  {
    protocol: 'Common',
    scope: 'response_header',
    path: 'response.headers.retry-after',
    label: 'Response Retry-After header',
    example: '30',
  },
  {
    protocol: 'Common',
    scope: 'response_header',
    path: 'upstream_response.headers.content-type',
    label: 'Upstream Content-Type header',
    example: 'text/html',
  },
  {
    protocol: 'Common',
    scope: 'response_header',
    path: 'upstream_response.headers.retry-after',
    label: 'Upstream Retry-After header',
    example: '30',
  },
  {
    protocol: 'Common',
    scope: 'stream',
    path: 'stream.enabled',
    label: 'Stream enabled',
    example: 'true',
  },
  {
    protocol: 'Common',
    scope: 'stream',
    path: 'stream.event',
    label: 'SSE event name',
    example: 'content_block_delta',
  },
  {
    protocol: 'Common',
    scope: 'stream',
    path: 'stream.format',
    label: 'Stream format',
    example: 'claude',
  },
  {
    protocol: 'Common',
    scope: 'stream',
    path: 'stream.chunk_index',
    label: 'Chunk index',
    example: '0',
  },
  {
    protocol: 'OpenAI Chat',
    scope: 'request_body',
    path: 'stream_options.include_usage',
    label: 'Stream usage flag',
    example: 'true',
  },
  {
    protocol: 'OpenAI Chat',
    scope: 'response_body',
    path: 'choices.0.delta.content',
    label: 'Delta content',
  },
  {
    protocol: 'OpenAI Chat',
    scope: 'response_body',
    path: 'choices.0.finish_reason',
    label: 'Finish reason',
    example: 'stop',
  },
  {
    protocol: 'OpenAI Chat',
    scope: 'response_body',
    path: 'usage.total_tokens',
    label: 'Total tokens',
    example: '233',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'request_body',
    path: 'input',
    label: 'Responses input',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'request_body',
    path: 'instructions',
    label: 'Instructions',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'request_body',
    path: 'reasoning.effort',
    label: 'Reasoning effort',
    example: 'high',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'request_body',
    path: 'max_output_tokens',
    label: 'Max output tokens',
    example: '4096',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'response_body',
    path: 'output.0.content.0.text',
    label: 'Output text',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'response_body',
    path: 'status',
    label: 'Response status',
    example: 'completed',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'response_body',
    path: 'usage.input_tokens',
    label: 'Input tokens',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'stream',
    path: 'response.output_text.delta',
    label: 'Output text delta event',
  },
  {
    protocol: 'OpenAI Responses',
    scope: 'stream',
    path: 'response.completed',
    label: 'Completed event',
  },
  {
    protocol: 'Claude Messages',
    scope: 'request_body',
    path: 'system',
    label: 'System prompt',
  },
  {
    protocol: 'Claude Messages',
    scope: 'request_body',
    path: 'messages.0.content.0.text',
    label: 'First text block',
  },
  {
    protocol: 'Claude Messages',
    scope: 'request_body',
    path: 'thinking.type',
    label: 'Thinking mode',
    example: 'enabled',
  },
  {
    protocol: 'Claude Messages',
    scope: 'request_body',
    path: 'thinking.budget_tokens',
    label: 'Thinking budget',
  },
  {
    protocol: 'Claude Messages',
    scope: 'response_body',
    path: 'delta.type',
    label: 'Claude delta type',
    example: 'thinking_delta',
  },
  {
    protocol: 'Claude Messages',
    scope: 'response_body',
    path: 'delta.text',
    label: 'Claude text delta',
  },
  {
    protocol: 'Claude Messages',
    scope: 'response_body',
    path: 'delta.thinking',
    label: 'Claude thinking delta',
  },
  {
    protocol: 'Claude Messages',
    scope: 'stream',
    path: 'message_start',
    label: 'Message start event',
  },
  {
    protocol: 'Claude Messages',
    scope: 'stream',
    path: 'content_block_delta',
    label: 'Content block delta event',
  },
  {
    protocol: 'Claude Messages',
    scope: 'stream',
    path: 'message_delta',
    label: 'Message delta event',
  },
  {
    protocol: 'Claude Messages',
    scope: 'stream',
    path: 'message_stop',
    label: 'Message stop event',
  },
  {
    protocol: 'Gemini',
    scope: 'request_body',
    path: 'contents.0.parts.0.text',
    label: 'First text part',
  },
  {
    protocol: 'Gemini',
    scope: 'request_body',
    path: 'generationConfig.temperature',
    label: 'Generation temperature',
  },
  {
    protocol: 'Gemini',
    scope: 'request_body',
    path: 'generationConfig.maxOutputTokens',
    label: 'Max output tokens',
  },
  {
    protocol: 'Gemini',
    scope: 'request_body',
    path: 'systemInstruction.parts.0.text',
    label: 'System instruction text',
  },
  {
    protocol: 'Gemini',
    scope: 'response_body',
    path: 'candidates.0.content.parts.0.text',
    label: 'Candidate text',
  },
  {
    protocol: 'Gemini',
    scope: 'response_body',
    path: 'candidates.0.finishReason',
    label: 'Finish reason',
  },
  {
    protocol: 'Gemini',
    scope: 'response_body',
    path: 'usageMetadata.totalTokenCount',
    label: 'Total token count',
  },
]

const KIND_META: Record<
  RuleAdvancedEditorKind,
  { title: string; description: string }
> = {
  request_match: {
    title: 'Request Matching Advanced Editor',
    description:
      'Build channel matching constraints with protocol field shortcuts and custom paths.',
  },
  error_override: {
    title: 'Error Override Advanced Editor',
    description:
      'Build ordered error rewrite rules. The first matched rule rewrites message, status code, and headers.',
  },
  param_override: {
    title: 'Parameter Override Advanced Editor',
    description:
      'Build request parameter and request header override operations.',
  },
  response_override: {
    title: 'Response Override Advanced Editor',
    description:
      'Build response body override rules. Stream rules apply to each chunk independently.',
  },
  response_header_override: {
    title: 'Response Header Override Advanced Editor',
    description:
      'Build response header overrides as simple key-value entries or conditional operations.',
  },
}

const REQUEST_SOURCES = [
  { value: 'header', label: 'Header' },
  { value: 'query', label: 'Query' },
  { value: 'body', label: 'JSON Body' },
  { value: 'path', label: 'Path' },
  { value: 'method', label: 'Method' },
] as const

const REQUEST_OPS = [
  { value: 'exists', label: 'Exists' },
  { value: 'missing', label: 'Missing' },
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Not equals' },
  { value: 'in', label: 'In list' },
  { value: 'not_in', label: 'Not in list' },
  { value: 'contains', label: 'Contains' },
  { value: 'prefix', label: 'Starts with' },
  { value: 'suffix', label: 'Ends with' },
  { value: 'regex', label: 'Regex' },
  { value: 'gt', label: 'Greater than' },
  { value: 'gte', label: 'Greater or equal' },
  { value: 'lt', label: 'Less than' },
  { value: 'lte', label: 'Less or equal' },
  { value: 'expr', label: 'Expr condition' },
  { value: 'js', label: 'JS condition' },
] as const

const CONDITION_MODES = [
  { value: 'full', label: 'Exact Match' },
  { value: 'prefix', label: 'Prefix' },
  { value: 'suffix', label: 'Suffix' },
  { value: 'contains', label: 'Contains' },
  { value: 'gt', label: 'Greater Than' },
  { value: 'gte', label: 'Greater Than or Equal' },
  { value: 'lt', label: 'Less Than' },
  { value: 'lte', label: 'Less Than or Equal' },
  { value: 'expr', label: 'Expr condition' },
  { value: 'js', label: 'JS condition' },
] as const

const BASE_OPERATION_MODES = [
  { value: 'set', label: 'Set Field' },
  { value: 'set_expr', label: 'Set Field by Expr' },
  { value: 'set_js', label: 'Set Field by JS' },
  { value: 'transform_expr', label: 'Transform by Expr' },
  { value: 'transform_js', label: 'Transform by JS' },
  { value: 'delete', label: 'Delete Field' },
  { value: 'append', label: 'Append to End' },
  { value: 'prepend', label: 'Prepend to Start' },
  { value: 'copy', label: 'Copy Field' },
  { value: 'move', label: 'Move Field' },
  { value: 'replace', label: 'String Replace' },
  { value: 'regex_replace', label: 'Regex Replace' },
  { value: 'trim_prefix', label: 'Trim Prefix' },
  { value: 'trim_suffix', label: 'Trim Suffix' },
  { value: 'ensure_prefix', label: 'Ensure Prefix' },
  { value: 'ensure_suffix', label: 'Ensure Suffix' },
  { value: 'trim_space', label: 'Trim Space' },
  { value: 'to_lower', label: 'To Lowercase' },
  { value: 'to_upper', label: 'To Uppercase' },
  { value: 'return_error', label: 'Return Custom Error' },
  { value: 'prune_objects', label: 'Prune Object Items' },
  { value: 'sync_fields', label: 'Sync Fields' },
] as const

const RESPONSE_OPERATION_MODES = [
  { value: 'set_body', label: 'Set Response Body' },
  { value: 'set_body_expr', label: 'Set Response Body by Expr' },
  { value: 'set_body_js', label: 'Set Response Body by JS' },
  { value: 'set_status', label: 'Set HTTP Status' },
  { value: 'set_status_expr', label: 'Set HTTP Status by Expr' },
  { value: 'set_status_js', label: 'Set HTTP Status by JS' },
] as const

const HEADER_OPERATION_MODES = [
  { value: 'set_header', label: 'Set Header' },
  { value: 'set_header_expr', label: 'Set Header by Expr' },
  { value: 'set_header_js', label: 'Set Header by JS' },
  { value: 'delete_header', label: 'Delete Header' },
  { value: 'delete_headers', label: 'Delete Matching Headers' },
  { value: 'keep_headers', label: 'Keep Only Headers' },
  { value: 'copy_header', label: 'Copy Header' },
  { value: 'move_header', label: 'Move Header' },
] as const

const PARAM_HEADER_OPERATION_MODES = [
  { value: 'pass_headers', label: 'Pass Through Headers' },
  { value: 'set_header', label: 'Set Request Header' },
  { value: 'set_header_expr', label: 'Set Request Header by Expr' },
  { value: 'set_header_js', label: 'Set Request Header by JS' },
  { value: 'delete_header', label: 'Delete Request Header' },
  { value: 'copy_header', label: 'Copy Request Header' },
  { value: 'move_header', label: 'Move Request Header' },
] as const

const STREAM_OPERATION_MODES = [
  { value: 'drop_chunk', label: 'Drop Matched Chunk' },
  { value: 'drop_event', label: 'Drop Matched Event' },
] as const

const VALUELESS_REQUEST_OPS = new Set(['exists', 'missing'])
const LIST_REQUEST_OPS = new Set(['in', 'not_in'])
const NUMBER_REQUEST_OPS = new Set(['gt', 'gte', 'lt', 'lte'])
const SCRIPT_REQUEST_OPS = new Set(['expr', 'js'])
const SCRIPT_CONDITION_MODES = new Set(['expr', 'js'])
const VALUE_OPERATION_MODES = new Set([
  'set',
  'set_expr',
  'set_js',
  'transform_expr',
  'transform_js',
  'set_body',
  'set_body_expr',
  'set_body_js',
  'set_status',
  'set_status_expr',
  'set_status_js',
  'append',
  'prepend',
  'trim_prefix',
  'trim_suffix',
  'ensure_prefix',
  'ensure_suffix',
  'return_error',
  'prune_objects',
  'pass_headers',
  'keep_headers',
  'set_header',
  'set_header_expr',
  'set_header_js',
])
const FROM_OPERATION_MODES = new Set([
  'copy',
  'move',
  'replace',
  'regex_replace',
  'copy_header',
  'move_header',
  'sync_fields',
])
const TO_OPERATION_MODES = new Set([
  'copy',
  'move',
  'replace',
  'regex_replace',
  'copy_header',
  'move_header',
  'sync_fields',
])
const NO_PATH_OPERATION_MODES = new Set([
  'set_body',
  'set_body_expr',
  'set_body_js',
  'set_status',
  'set_status_expr',
  'set_status_js',
  'keep_headers',
])
const KEEP_ORIGIN_OPERATION_MODES = new Set([
  'set',
  'set_expr',
  'set_js',
  'append',
  'prepend',
  'pass_headers',
  'set_header',
  'set_header_expr',
  'set_header_js',
  'copy_header',
  'move_header',
])

let localIdSeed = 0
const nextId = (prefix: string) => `${prefix}_${Date.now()}_${localIdSeed++}`

function prettyJSONString(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function parseLooseValue(text: string): unknown {
  const raw = String(text ?? '').trim()
  if (raw === '') return ''
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function valueToText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseScalarValue(text: string, numberHint = false): unknown {
  const raw = String(text ?? '').trim()
  if (numberHint) {
    const numberValue = Number(raw)
    return Number.isFinite(numberValue) ? numberValue : raw
  }
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (raw.startsWith('{') || raw.startsWith('[') || /^-?\d/.test(raw)) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  return raw
}

function fieldOptions(scopes: FieldScope[]): SelectOption[] {
  return FIELD_CATALOG.filter((item) => scopes.includes(item.scope)).map(
    (item) => ({
      value: item.path,
      label: `${item.protocol} · ${item.label} · ${item.path}${
        item.example ? ` = ${item.example}` : ''
      }`,
    })
  )
}

function normalizeSelectValue<T extends readonly { value: string }[]>(
  value: unknown,
  options: T,
  fallback: T[number]['value']
): string {
  return options.some((option) => option.value === value)
    ? String(value)
    : fallback
}

function FieldPathInput({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={(next) => onChange(next || '')}
      placeholder={placeholder}
      searchPlaceholder={placeholder}
      emptyText='No matching field. Type a custom path.'
      allowCustomValue
      className={cn(disabled && 'pointer-events-none opacity-50')}
    />
  )
}

function SectionTitle({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-1'>
      <h3 className='text-sm font-medium'>{t(title)}</h3>
      {description && (
        <p className='text-muted-foreground text-xs'>{t(description)}</p>
      )}
    </div>
  )
}

function JSONPreview({ value }: { value: string }) {
  const { t } = useTranslation()
  return (
    <div className='space-y-2'>
      <div className='text-muted-foreground flex items-center gap-2 text-xs'>
        <Code2 className='h-3.5 w-3.5' />
        {t('Generated JSON')}
      </div>
      <pre className='bg-muted/60 border-border max-h-64 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap'>
        {value || '{}'}
      </pre>
    </div>
  )
}

function FieldCatalogPanel() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FIELD_CATALOG
    return FIELD_CATALOG.filter((item) =>
      `${item.protocol} ${item.scope} ${item.path} ${item.label} ${
        item.example || ''
      }`
        .toLowerCase()
        .includes(q)
    )
  }, [query])

  return (
    <aside className='border-border bg-muted/20 space-y-3 rounded-md border p-3'>
      <SectionTitle
        title='Field Library'
        description='Search protocol fields, then pick them from the path dropdowns or type custom paths.'
      />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('Search protocol fields')}
      />
      <ScrollArea className='h-[calc(100dvh-18rem)] min-h-72'>
        <div className='space-y-2 pr-2'>
          {filtered.map((item) => (
            <div
              key={`${item.protocol}-${item.scope}-${item.path}`}
              className='border-border bg-background rounded-md border p-2'
            >
              <div className='flex flex-wrap gap-1.5'>
                <Badge variant='secondary'>{item.protocol}</Badge>
                <Badge variant='outline'>{item.scope.replace('_', ' ')}</Badge>
              </div>
              <div className='mt-2 font-mono text-xs break-all'>
                {item.path}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {t(item.label)}
                {item.example ? (
                  <span className='font-mono'> · {item.example}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

type RequestVisualCondition = {
  id: string
  source: string
  key: string
  op: string
  valueText: string
  valueList: string[]
}

function requestValueList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(valueToText)
  const text = valueToText(value)
  if (!text) return ['']
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeRequestCondition(input: Record<string, unknown> = {}) {
  const op = normalizeSelectValue(input.op, REQUEST_OPS, 'eq')
  return {
    id: nextId('rm'),
    source: normalizeSelectValue(input.source, REQUEST_SOURCES, 'body'),
    key: String(input.path || input.key || ''),
    op,
    valueText: SCRIPT_REQUEST_OPS.has(op)
      ? String(input.script || input.expr || input.value || '')
      : LIST_REQUEST_OPS.has(op)
        ? ''
        : valueToText(input.value),
    valueList: requestValueList(input.value),
  }
}

function defaultRequestConditions(): RequestVisualCondition[] {
  return [
    normalizeRequestCondition({
      source: 'body',
      path: 'stream',
      op: 'eq',
      value: true,
    }),
  ]
}

function buildRequestConfig(
  logic: 'AND' | 'OR',
  conditions: RequestVisualCondition[]
) {
  return {
    logic,
    conditions: conditions.map((condition) => {
      if (condition.op === 'expr') {
        return {
          op: 'expr',
          expr: condition.valueText.trim(),
        }
      }
      if (condition.op === 'js') {
        return {
          op: 'js',
          script: condition.valueText.trim(),
        }
      }
      const next: Record<string, unknown> = {
        source: condition.source,
        op: condition.op,
      }
      if (condition.source === 'body') {
        next.path = condition.key.trim()
      } else if (condition.source === 'header' || condition.source === 'query') {
        next.key = condition.key.trim()
      }
      if (!VALUELESS_REQUEST_OPS.has(condition.op)) {
        next.value = LIST_REQUEST_OPS.has(condition.op)
          ? condition.valueList
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => parseScalarValue(item))
          : parseScalarValue(
              condition.valueText,
              NUMBER_REQUEST_OPS.has(condition.op)
            )
      }
      return next
    }),
  }
}

function requestFieldScopes(source: string): FieldScope[] {
  if (source === 'header') return ['request_header']
  if (source === 'query') return ['request_query']
  if (source === 'body') return ['request_body']
  return []
}

function RequestMatchRulesEditor({
  value,
  onSerializedChange,
}: {
  value: string
  onSerializedChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const [conditions, setConditions] = useState<RequestVisualCondition[]>(
    defaultRequestConditions
  )
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!value.trim()) {
      setLogic('AND')
      setConditions(defaultRequestConditions())
      setInvalid(false)
      return
    }
    try {
      const parsed = JSON.parse(value) as {
        logic?: string
        conditions?: Record<string, unknown>[]
      }
      setLogic(parsed.logic === 'OR' ? 'OR' : 'AND')
      setConditions(
        Array.isArray(parsed.conditions) && parsed.conditions.length > 0
          ? parsed.conditions.map(normalizeRequestCondition)
          : defaultRequestConditions()
      )
      setInvalid(false)
    } catch {
      setLogic('AND')
      setConditions(defaultRequestConditions())
      setInvalid(true)
    }
  }, [value])

  useEffect(() => {
    onSerializedChange(prettyJSONString(buildRequestConfig(logic, conditions)))
  }, [conditions, logic, onSerializedChange])

  const patchCondition = (
    id: string,
    patch: Partial<RequestVisualCondition>
  ) => {
    setConditions((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }

  return (
    <div className='space-y-4'>
      {invalid && (
        <div className='border-destructive/30 text-destructive rounded-md border p-3 text-xs'>
          {t('Existing JSON is invalid. Saving will replace it with the rules below.')}
        </div>
      )}
      <div className='flex flex-wrap items-center gap-3'>
        <Select value={logic} onValueChange={(next) => setLogic(next as 'AND' | 'OR')}>
          <SelectTrigger className='w-28'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value='AND'>{t('AND')}</SelectItem>
              <SelectItem value='OR'>{t('OR')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className='text-muted-foreground text-xs'>
          {t('Combine all request matching conditions')}
        </span>
      </div>
      <div className='space-y-3'>
        {conditions.map((condition) => {
          const isScriptCondition = SCRIPT_REQUEST_OPS.has(condition.op)
          const showKey =
            !isScriptCondition &&
            (condition.source === 'header' ||
              condition.source === 'query' ||
              condition.source === 'body')
          const showValue = !VALUELESS_REQUEST_OPS.has(condition.op)
          const showList = LIST_REQUEST_OPS.has(condition.op)
          const list = condition.valueList.length ? condition.valueList : ['']
          return (
            <div
              key={condition.id}
              className='border-border space-y-3 rounded-md border p-3'
            >
              <div className='grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_150px]'>
                {isScriptCondition ? (
                  <div className='bg-muted text-muted-foreground flex h-9 items-center rounded-md px-3 text-xs'>
                    {t('Script condition')}
                  </div>
                ) : (
                  <Select
                    value={condition.source}
                    onValueChange={(next) => {
                      const nextSource = next || 'body'
                      patchCondition(condition.id, {
                        source: nextSource,
                        key: requestFieldScopes(nextSource).length
                          ? condition.key
                          : '',
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {REQUEST_SOURCES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(option.label)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                {showKey ? (
                  <FieldPathInput
                    value={condition.key}
                    onChange={(next) =>
                      patchCondition(condition.id, { key: next })
                    }
                    options={fieldOptions(requestFieldScopes(condition.source))}
                    placeholder={t('Select or type a field path')}
                  />
                ) : (
                  <div className='bg-muted text-muted-foreground flex h-9 items-center rounded-md px-3 text-xs'>
                    {isScriptCondition
                      ? t('Use get("req.body.model") or current context')
                      : condition.source === 'path'
                      ? t('Request path')
                      : t('HTTP method')}
                  </div>
                )}
                <Select
                  value={condition.op}
                  onValueChange={(next) => {
                    const nextOp = next || 'eq'
                    patchCondition(condition.id, {
                      op: nextOp,
                      valueList: LIST_REQUEST_OPS.has(nextOp)
                        ? list
                        : condition.valueList,
                      valueText:
                        LIST_REQUEST_OPS.has(condition.op) &&
                        !LIST_REQUEST_OPS.has(nextOp)
                          ? list[0] || ''
                          : condition.valueText,
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {REQUEST_OPS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.label)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {showValue &&
                (isScriptCondition ? (
                  <Textarea
                    value={condition.valueText}
                    className='min-h-20 font-mono text-xs'
                    placeholder={
                      condition.op === 'js'
                        ? `return get('req.body.stream') === false;`
                        : `get('req.body.stream') == false`
                    }
                    onChange={(event) =>
                      patchCondition(condition.id, {
                        valueText: event.target.value,
                      })
                    }
                  />
                ) : showList ? (
                  <div className='space-y-2'>
                    {list.map((item, index) => (
                      <div key={index} className='flex gap-2'>
                        <Input
                          value={item}
                          placeholder={t('Value')}
                          onChange={(event) => {
                            const next = [...list]
                            next[index] = event.target.value
                            patchCondition(condition.id, { valueList: next })
                          }}
                        />
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          disabled={list.length <= 1}
                          onClick={() =>
                            patchCondition(condition.id, {
                              valueList:
                                list.filter((_, i) => i !== index).length > 0
                                  ? list.filter((_, i) => i !== index)
                                  : [''],
                            })
                          }
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        patchCondition(condition.id, {
                          valueList: [...list, ''],
                        })
                      }
                    >
                      <Plus className='mr-2 h-4 w-4' />
                      {t('Add value')}
                    </Button>
                  </div>
                ) : (
                  <Input
                    value={condition.valueText}
                    placeholder={t('Value')}
                    onChange={(event) =>
                      patchCondition(condition.id, {
                        valueText: event.target.value,
                      })
                    }
                  />
                ))}
              <div className='flex justify-end'>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  disabled={conditions.length <= 1}
                  onClick={() =>
                    setConditions((items) =>
                      items.filter((item) => item.id !== condition.id)
                    )
                  }
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('Delete')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() =>
          setConditions((items) => [
            ...items,
            normalizeRequestCondition({
              source: 'body',
              path: 'model',
              op: 'contains',
              value: 'gpt',
            }),
          ])
        }
      >
        <Plus className='mr-2 h-4 w-4' />
        {t('Add condition')}
      </Button>
    </div>
  )
}

type OperationConditionDraft = {
  id: string
  path: string
  mode: string
  valueText: string
  invert: boolean
  passMissingKey: boolean
}

type OperationDraft = {
  id: string
  description: string
  mode: string
  path: string
  from: string
  to: string
  valueText: string
  keepOrigin: boolean
  logic: 'AND' | 'OR'
  conditions: OperationConditionDraft[]
}

function operationModeOptions(kind: RuleAdvancedEditorKind) {
  if (kind === 'param_override') {
    return [...BASE_OPERATION_MODES, ...PARAM_HEADER_OPERATION_MODES]
  }
  if (kind === 'response_header_override') return HEADER_OPERATION_MODES
  return [
    ...BASE_OPERATION_MODES,
    ...RESPONSE_OPERATION_MODES,
    ...HEADER_OPERATION_MODES,
    ...STREAM_OPERATION_MODES,
  ]
}

function normalizeOperationCondition(
  condition: Record<string, unknown> = {}
): OperationConditionDraft {
  const mode = normalizeSelectValue(condition.mode, CONDITION_MODES, 'full')
  return {
    id: nextId('oc'),
    path: String(condition.path || ''),
    mode,
    valueText: SCRIPT_CONDITION_MODES.has(mode)
      ? String(condition.script || condition.expr || condition.value || '')
      : valueToText(condition.value),
    invert: condition.invert === true,
    passMissingKey: condition.pass_missing_key === true,
  }
}

function normalizeOperation(
  operation: Record<string, unknown> = {},
  kind: RuleAdvancedEditorKind
): OperationDraft {
  const options = operationModeOptions(kind)
  return {
    id: nextId('op'),
    description: String(operation.description || ''),
    mode: normalizeSelectValue(operation.mode, options, options[0].value),
    path: String(operation.path || ''),
    from: String(operation.from || ''),
    to: String(operation.to || ''),
    valueText:
      String(operation.mode || '').endsWith('_js')
        ? String(operation.script || operation.expr || operation.value || '')
        : String(operation.mode || '').endsWith('_expr')
          ? String(operation.expr || operation.value || '')
          : valueToText(operation.value),
    keepOrigin: operation.keep_origin === true,
    logic: String(operation.logic || 'OR').toUpperCase() === 'AND' ? 'AND' : 'OR',
    conditions: Array.isArray(operation.conditions)
      ? (operation.conditions as Record<string, unknown>[]).map(
          normalizeOperationCondition
        )
      : [],
  }
}

function defaultOperation(kind: RuleAdvancedEditorKind): OperationDraft {
  if (kind === 'response_override') {
    return normalizeOperation(
      {
        mode: 'drop_event',
        description: 'Drop Claude thinking stream events.',
        conditions: [
          { path: 'stream.event', mode: 'full', value: 'content_block_delta' },
          { path: 'delta.type', mode: 'full', value: 'thinking_delta' },
        ],
        logic: 'AND',
      },
      kind
    )
  }
  if (kind === 'response_header_override') {
    return normalizeOperation(
      {
        mode: 'delete_header',
        description: 'Delete LiteLLM response headers.',
        path: 'X-Litellm-*',
      },
      kind
    )
  }
  return normalizeOperation(
    {
      mode: 'set',
      path: 'temperature',
      value: 0.7,
      conditions: [{ path: 'model', mode: 'prefix', value: 'gpt' }],
      logic: 'AND',
    },
    kind
  )
}

function operationFieldScopes(kind: RuleAdvancedEditorKind): FieldScope[] {
  if (kind === 'param_override') {
    return ['request_body', 'request_header', 'request_query', 'context']
  }
  if (kind === 'response_header_override') {
    return ['response_header', 'stream', 'context']
  }
  return ['response_body', 'response_header', 'stream', 'context']
}

function operationPathScopes(
  kind: RuleAdvancedEditorKind,
  mode: string
): FieldScope[] {
  if (mode.includes('header') && kind !== 'param_override') {
    return ['response_header_name']
  }
  if (kind === 'response_header_override') {
    return ['response_header_name']
  }
  return operationFieldScopes(kind)
}

function defaultOperationCondition(
  kind: RuleAdvancedEditorKind,
  mode = ''
): OperationConditionDraft {
  if (kind === 'response_header_override' || mode.includes('header')) {
    return normalizeOperationCondition({
      path: 'response.headers.content-type',
      mode: 'contains',
      value: 'text/html',
    })
  }
  if (kind === 'response_override' && mode.startsWith('drop_')) {
    return normalizeOperationCondition({
      path: 'stream.event',
      mode: 'full',
      value: 'content_block_delta',
    })
  }
  if (kind === 'response_override') {
    return normalizeOperationCondition({
      path: 'response.status',
      mode: 'full',
      value: 200,
    })
  }
  return normalizeOperationCondition({
    path: 'model',
    mode: 'prefix',
    value: 'gpt',
  })
}

function buildOperationConfig(operations: OperationDraft[]) {
  return {
    operations: operations.map((operation) => {
      const next: Record<string, unknown> = { mode: operation.mode }
      if (operation.description.trim()) {
        next.description = operation.description.trim()
      }
      if (operation.path.trim()) next.path = operation.path.trim()
      if (operation.from.trim()) next.from = operation.from.trim()
      if (operation.to.trim()) next.to = operation.to.trim()
      if (operation.valueText.trim() !== '') {
        if (operation.mode.endsWith('_js')) {
          next.script = operation.valueText.trim()
        } else if (operation.mode.endsWith('_expr')) {
          next.expr = operation.valueText.trim()
        } else {
          next.value = parseLooseValue(operation.valueText)
        }
      }
      if (operation.keepOrigin) next.keep_origin = true
      if (operation.conditions.length > 0) {
        next.logic = operation.logic
        next.conditions = operation.conditions.map((condition) => {
          const item: Record<string, unknown> = {
            mode: condition.mode,
          }
          if (!SCRIPT_CONDITION_MODES.has(condition.mode)) {
            item.path = condition.path.trim()
          }
          if (condition.valueText.trim() !== '') {
            if (condition.mode === 'js') {
              item.script = condition.valueText.trim()
            } else if (condition.mode === 'expr') {
              item.expr = condition.valueText.trim()
            } else {
              item.value = parseLooseValue(condition.valueText)
            }
          }
          if (condition.invert) item.invert = true
          if (condition.passMissingKey) item.pass_missing_key = true
          return item
        })
      }
      return next
    }),
  }
}

function OperationsRulesEditor({
  kind,
  value,
  onSerializedChange,
}: {
  kind: RuleAdvancedEditorKind
  value: string
  onSerializedChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [operations, setOperations] = useState<OperationDraft[]>([
    defaultOperation(kind),
  ])
  const [invalid, setInvalid] = useState(false)
  const options = operationModeOptions(kind)
  const scopes = operationFieldScopes(kind)
  const conditionFieldOptionList = useMemo(() => fieldOptions(scopes), [scopes])

  useEffect(() => {
    if (!value.trim()) {
      setOperations([defaultOperation(kind)])
      setInvalid(false)
      return
    }
    try {
      const parsed = JSON.parse(value) as { operations?: Record<string, unknown>[] }
      setOperations(
        Array.isArray(parsed.operations) && parsed.operations.length > 0
          ? parsed.operations.map((item) => normalizeOperation(item, kind))
          : [defaultOperation(kind)]
      )
      setInvalid(false)
    } catch {
      setOperations([defaultOperation(kind)])
      setInvalid(true)
    }
  }, [kind, value])

  useEffect(() => {
    onSerializedChange(prettyJSONString(buildOperationConfig(operations)))
  }, [onSerializedChange, operations])

  const patchOperation = (id: string, patch: Partial<OperationDraft>) => {
    setOperations((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }

  const patchCondition = (
    operationId: string,
    conditionId: string,
    patch: Partial<OperationConditionDraft>
  ) => {
    setOperations((items) =>
      items.map((operation) => {
        if (operation.id !== operationId) return operation
        return {
          ...operation,
          conditions: operation.conditions.map((condition) =>
            condition.id === conditionId ? { ...condition, ...patch } : condition
          ),
        }
      })
    )
  }

  return (
    <div className='space-y-4'>
      {invalid && (
        <div className='border-destructive/30 text-destructive rounded-md border p-3 text-xs'>
          {t('Existing JSON is invalid. Saving will replace it with the rules below.')}
        </div>
      )}
      <div className='space-y-3'>
        {operations.map((operation, index) => {
          const pathFieldOptionList = fieldOptions(
            operationPathScopes(kind, operation.mode)
          )
          const showPath =
            !['copy', 'move', 'copy_header', 'move_header', 'sync_fields'].includes(
              operation.mode
            ) &&
            !operation.mode.startsWith('drop_') &&
            !NO_PATH_OPERATION_MODES.has(operation.mode)
          const showValue = VALUE_OPERATION_MODES.has(operation.mode)
          const isScriptOperation =
            operation.mode.endsWith('_expr') || operation.mode.endsWith('_js')
          const showFrom = FROM_OPERATION_MODES.has(operation.mode)
          const showTo = TO_OPERATION_MODES.has(operation.mode)
          const showKeepOrigin = KEEP_ORIGIN_OPERATION_MODES.has(operation.mode)
          return (
            <div
              key={operation.id}
              className='border-border space-y-4 rounded-md border p-3'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary'>
                    {t('Rule')} {index + 1}
                  </Badge>
                  <Badge variant='outline'>
                    {t(options.find((item) => item.value === operation.mode)?.label || operation.mode)}
                  </Badge>
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  disabled={operations.length <= 1}
                  onClick={() =>
                    setOperations((items) =>
                      items.filter((item) => item.id !== operation.id)
                    )
                  }
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('Delete')}
                </Button>
              </div>
              <Input
                value={operation.description}
                placeholder={t('Rule description')}
                onChange={(event) =>
                  patchOperation(operation.id, {
                    description: event.target.value,
                  })
                }
              />
              <div className='grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]'>
                <Select
                  value={operation.mode}
                  onValueChange={(next) =>
                    patchOperation(operation.id, { mode: next || 'set' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(option.label)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {showPath ? (
                  <FieldPathInput
                    value={operation.path}
                    onChange={(next) =>
                      patchOperation(operation.id, { path: next })
                    }
                    options={pathFieldOptionList}
                    placeholder={
                      operation.mode.includes('header')
                        ? t('Select or type a header name or selector')
                        : t('Select or type a field path')
                    }
                  />
                ) : (
                  <div className='bg-muted text-muted-foreground flex h-9 items-center rounded-md px-3 text-xs'>
                    {operation.mode.startsWith('drop_')
                      ? t('Matched chunk or event will be discarded')
                      : t('Source and target fields are configured below')}
                  </div>
                )}
              </div>
              {(showFrom || showTo) && (
                <div className='grid gap-3 md:grid-cols-2'>
                  {showFrom && (
                    <FieldPathInput
                      value={operation.from}
                      onChange={(next) =>
                        patchOperation(operation.id, { from: next })
                      }
                      options={pathFieldOptionList}
                      placeholder={t('Source field or match text')}
                    />
                  )}
                  {showTo && (
                    <FieldPathInput
                      value={operation.to}
                      onChange={(next) =>
                        patchOperation(operation.id, { to: next })
                      }
                      options={pathFieldOptionList}
                      placeholder={t('Target field or replacement text')}
                    />
                  )}
                </div>
              )}
              {showValue && (
                <Textarea
                  value={operation.valueText}
                  placeholder={
                    isScriptOperation
                      ? operation.mode.endsWith('_js')
                        ? `return current;`
                        : `current`
                      : operation.mode === 'keep_headers'
                        ? `["Content-Type", "Cache-Control", "X-Request-Id"]`
                      : t('Value supports JSON or plain text')
                  }
                  className='min-h-20 font-mono text-xs'
                  onChange={(event) =>
                    patchOperation(operation.id, {
                      valueText: event.target.value,
                    })
                  }
                />
              )}
              {showKeepOrigin && (
                <label className='flex items-center gap-2 text-xs'>
                  <Switch
                    checked={operation.keepOrigin}
                    onCheckedChange={(checked) =>
                      patchOperation(operation.id, { keepOrigin: checked })
                    }
                  />
                  {t('Keep original value when merging')}
                </label>
              )}
              <Separator />
              <div className='space-y-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='flex items-center gap-3'>
                    <Select
                      value={operation.logic}
                      onValueChange={(next) =>
                        patchOperation(operation.id, {
                          logic: next === 'AND' ? 'AND' : 'OR',
                        })
                      }
                    >
                      <SelectTrigger className='w-24'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value='AND'>{t('AND')}</SelectItem>
                          <SelectItem value='OR'>{t('OR')}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <span className='text-muted-foreground text-xs'>
                      {t('Operation conditions')}
                    </span>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      patchOperation(operation.id, {
                        conditions: [
                          ...operation.conditions,
                          defaultOperationCondition(kind, operation.mode),
                        ],
                      })
                    }
                  >
                    <Plus className='mr-2 h-4 w-4' />
                    {t('Add condition')}
                  </Button>
                  {operation.conditions.length > 0 && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() =>
                        patchOperation(operation.id, { conditions: [] })
                      }
                    >
                      {t('Clear conditions')}
                    </Button>
                  )}
                </div>
                {operation.conditions.length === 0 ? (
                  <div className='text-muted-foreground bg-muted/50 rounded-md p-3 text-xs'>
                    {t('No conditions. This operation always runs.')}
                  </div>
                ) : (
                  operation.conditions.map((condition) => {
                    const isScriptCondition = SCRIPT_CONDITION_MODES.has(
                      condition.mode
                    )
                    return (
                    <div
                      key={condition.id}
                      className='bg-muted/30 grid gap-2 rounded-md p-2 md:grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)_auto]'
                    >
                      {isScriptCondition ? (
                        <div className='bg-background text-muted-foreground flex h-9 items-center rounded-md px-3 text-xs'>
                          {t('Script condition')}
                        </div>
                      ) : (
                        <FieldPathInput
                          value={condition.path}
                          onChange={(next) =>
                            patchCondition(operation.id, condition.id, {
                              path: next,
                            })
                          }
                          options={conditionFieldOptionList}
                          placeholder={t('Condition field')}
                        />
                      )}
                      <Select
                        value={condition.mode}
                        onValueChange={(next) =>
                          patchCondition(operation.id, condition.id, {
                            mode: next || 'full',
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {CONDITION_MODES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(option.label)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {isScriptCondition ? (
                        <Textarea
                          value={condition.valueText}
                          className='min-h-20 font-mono text-xs'
                          placeholder={
                            condition.mode === 'js'
                              ? `return get('stream.event') === 'ping';`
                              : `get('stream.event') == 'ping'`
                          }
                          onChange={(event) =>
                            patchCondition(operation.id, condition.id, {
                              valueText: event.target.value,
                            })
                          }
                        />
                      ) : (
                        <Input
                          value={condition.valueText}
                          placeholder={t('Value')}
                          onChange={(event) =>
                            patchCondition(operation.id, condition.id, {
                              valueText: event.target.value,
                            })
                          }
                        />
                      )}
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={() =>
                          patchOperation(operation.id, {
                            conditions: operation.conditions.filter(
                              (item) => item.id !== condition.id
                            ),
                          })
                        }
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                      <div className='flex flex-wrap gap-4 md:col-span-4'>
                        <label className='flex items-center gap-2 text-xs'>
                          <Switch
                            checked={condition.invert}
                            onCheckedChange={(checked) =>
                              patchCondition(operation.id, condition.id, {
                                invert: checked,
                              })
                            }
                          />
                          {t('Invert condition')}
                        </label>
                        <label className='flex items-center gap-2 text-xs'>
                          <Switch
                            checked={condition.passMissingKey}
                            onCheckedChange={(checked) =>
                              patchCondition(operation.id, condition.id, {
                                passMissingKey: checked,
                              })
                            }
                          />
                          {t('Pass when field is missing')}
                        </label>
                      </div>
                    </div>
                  )})
                )}
              </div>
            </div>
          )
        })}
      </div>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() =>
          setOperations((items) => [...items, defaultOperation(kind)])
        }
      >
        <Plus className='mr-2 h-4 w-4' />
        {t('Add rule')}
      </Button>
    </div>
  )
}

type HeaderEntry = {
  id: string
  name: string
  valueText: string
}

function ResponseHeaderRulesEditor({
  value,
  onSerializedChange,
}: {
  value: string
  onSerializedChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'simple' | 'operations'>('simple')
  const [entries, setEntries] = useState<HeaderEntry[]>([
    { id: nextId('hdr'), name: 'Content-Type', valueText: 'application/json' },
  ])
  const [operationsInitialValue, setOperationsInitialValue] = useState(value)
  const [operationsValue, setOperationsValue] = useState(value)

  useEffect(() => {
    if (!value.trim()) {
      setMode('simple')
      setEntries([
        { id: nextId('hdr'), name: 'Content-Type', valueText: 'application/json' },
      ])
      setOperationsValue('')
      return
    }
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      if (Array.isArray(parsed.operations)) {
        setMode('operations')
        setOperationsInitialValue(value)
        setOperationsValue(value)
        return
      }
      setMode('simple')
      setEntries(
        Object.entries(parsed).map(([name, val]) => ({
          id: nextId('hdr'),
          name,
          valueText: valueToText(val),
        }))
      )
    } catch {
      setMode('simple')
      setEntries([
        { id: nextId('hdr'), name: 'Content-Type', valueText: 'application/json' },
      ])
    }
  }, [value])

  useEffect(() => {
    if (mode === 'operations') {
      onSerializedChange(operationsValue)
      return
    }
    const payload: Record<string, unknown> = {}
    for (const entry of entries) {
      const name = entry.name.trim()
      if (!name) continue
      payload[name] = parseLooseValue(entry.valueText)
    }
    onSerializedChange(prettyJSONString(payload))
  }, [entries, mode, onSerializedChange, operationsValue])

  const patchEntry = (id: string, patch: Partial<HeaderEntry>) => {
    setEntries((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <Select
          value={mode}
          onValueChange={(next) => {
            const nextMode = next === 'operations' ? 'operations' : 'simple'
            if (nextMode === 'operations' && !operationsInitialValue.trim()) {
              setOperationsInitialValue(
                prettyJSONString(
                  buildOperationConfig([
                    defaultOperation('response_header_override'),
                  ])
                )
              )
            }
            setMode(nextMode)
          }}
        >
          <SelectTrigger className='w-52'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value='simple'>{t('Simple header map')}</SelectItem>
              <SelectItem value='operations'>
                {t('Conditional operations')}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className='text-muted-foreground text-xs'>
          {mode === 'simple'
            ? t('Use direct header key-value overrides.')
            : t('Use operation rules when headers need conditions.')}
        </span>
      </div>

      {mode === 'simple' ? (
        <div className='space-y-3'>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className='grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
            >
              <FieldPathInput
                value={entry.name}
                onChange={(next) => patchEntry(entry.id, { name: next })}
                options={fieldOptions(['response_header_name'])}
                placeholder={t('Select or type a header name')}
              />
              <Input
                value={entry.valueText}
                placeholder={t('Header value. Use null to delete.')}
                onChange={(event) =>
                  patchEntry(entry.id, { valueText: event.target.value })
                }
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                disabled={entries.length <= 1}
                onClick={() =>
                  setEntries((items) => items.filter((item) => item.id !== entry.id))
                }
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          ))}
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              setEntries((items) => [
                ...items,
                { id: nextId('hdr'), name: '', valueText: '' },
              ])
            }
          >
            <Plus className='mr-2 h-4 w-4' />
            {t('Add header')}
          </Button>
        </div>
      ) : (
        <OperationsRulesEditor
          kind='response_header_override'
          value={operationsInitialValue}
          onSerializedChange={setOperationsValue}
        />
      )}
    </div>
  )
}

type ErrorConditionDraft = {
  id: string
  source: string
  key: string
  op: string
  valueText: string
  valueList: string[]
}

type ErrorRuleDraft = {
  id: string
  logic: 'AND' | 'OR'
  message: string
  statusCode: string
  headersText: string
  conditions: ErrorConditionDraft[]
}

const ERROR_SOURCES = [
  { value: 'status', label: 'Current status code' },
  { value: 'original_status', label: 'Original status code' },
  { value: 'upstream_status', label: 'Upstream status code' },
  { value: 'error_message', label: 'Error message' },
  { value: 'error_code', label: 'Error code' },
  { value: 'error_type', label: 'Error type' },
  { value: 'channel_id', label: 'Channel ID' },
  { value: 'channel_name', label: 'Channel name' },
  { value: 'channel_type', label: 'Channel type' },
  { value: 'req_header', label: 'Request header' },
  { value: 'req_query', label: 'Request query' },
  { value: 'req_body', label: 'Request JSON body' },
  { value: 'resp_header', label: 'Response header' },
] as const

function normalizeErrorCondition(
  condition: Record<string, unknown> = {}
): ErrorConditionDraft {
  const op = normalizeSelectValue(condition.op || condition.mode, REQUEST_OPS, 'eq')
  return {
    id: nextId('ec'),
    source: normalizeSelectValue(condition.source, ERROR_SOURCES, 'status'),
    key: String(condition.path || condition.key || ''),
    op,
    valueText: SCRIPT_REQUEST_OPS.has(op)
      ? String(condition.script || condition.expr || condition.value || '')
      : LIST_REQUEST_OPS.has(op)
        ? ''
        : valueToText(condition.value),
    valueList: requestValueList(condition.value),
  }
}

function normalizeErrorRule(rule: Record<string, unknown> = {}): ErrorRuleDraft {
  return {
    id: nextId('er'),
    logic: String(rule.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND',
    message: String(rule.message || ''),
    statusCode: valueToText(rule.status_code ?? rule.status),
    headersText: valueToText(rule.headers ?? rule.response_headers ?? {}),
    conditions: Array.isArray(rule.conditions)
      ? (rule.conditions as Record<string, unknown>[]).map(normalizeErrorCondition)
      : [],
  }
}

function defaultErrorRule(): ErrorRuleDraft {
  return normalizeErrorRule({
    logic: 'AND',
    conditions: [
      { source: 'upstream_status', op: 'eq', value: 429 },
      { source: 'req_body', path: 'stream', op: 'eq', value: false },
    ],
    message: '{req.body.model} Resource exhausted',
    status_code: 429,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorNeedsKey(source: string) {
  return (
    source === 'req_header' ||
    source === 'req_query' ||
    source === 'req_body' ||
    source === 'resp_header'
  )
}

function errorFieldScopes(source: string): FieldScope[] {
  if (source === 'req_header') return ['request_header']
  if (source === 'req_query') return ['request_query']
  if (source === 'req_body') return ['request_body']
  if (source === 'resp_header') return ['response_header_name']
  return ['context']
}

function buildErrorOverrideConfig(rules: ErrorRuleDraft[]) {
  return {
    rules: rules.map((rule) => {
      const next: Record<string, unknown> = {
        logic: rule.logic,
        conditions: rule.conditions.map((condition) => {
          if (condition.op === 'expr') {
            return {
              op: 'expr',
              expr: condition.valueText.trim(),
            }
          }
          if (condition.op === 'js') {
            return {
              op: 'js',
              script: condition.valueText.trim(),
            }
          }
          const item: Record<string, unknown> = {
            source: condition.source,
            op: condition.op,
          }
          if (condition.source === 'req_body') {
            item.path = condition.key.trim()
          } else if (errorNeedsKey(condition.source)) {
            item.key = condition.key.trim()
          }
          if (!VALUELESS_REQUEST_OPS.has(condition.op)) {
            item.value = LIST_REQUEST_OPS.has(condition.op)
              ? condition.valueList
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .map((value) => parseScalarValue(value))
              : parseScalarValue(
                  condition.valueText,
                  NUMBER_REQUEST_OPS.has(condition.op)
                )
          }
          return item
        }),
      }
      if (rule.message.trim()) next.message = rule.message
      const statusCode = Number(rule.statusCode)
      if (Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) {
        next.status_code = statusCode
      }
      if (rule.headersText.trim()) {
        const headers = parseLooseValue(rule.headersText)
        if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
          next.headers = headers
        }
      }
      return next
    }),
  }
}

function ErrorOverrideRulesEditor({
  value,
  onSerializedChange,
}: {
  value: string
  onSerializedChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [rules, setRules] = useState<ErrorRuleDraft[]>([defaultErrorRule()])
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!value.trim()) {
      setRules([defaultErrorRule()])
      setInvalid(false)
      return
    }
    try {
      const parsed = JSON.parse(value) as
        | { rules?: Record<string, unknown>[] }
        | Record<string, unknown>[]
        | Record<string, unknown>
      if (Array.isArray(parsed)) {
        setRules(parsed.length ? parsed.map(normalizeErrorRule) : [defaultErrorRule()])
      } else if (Array.isArray(parsed.rules)) {
        setRules(
          parsed.rules.length
            ? parsed.rules.map(normalizeErrorRule)
            : [defaultErrorRule()]
        )
      } else {
        setRules([normalizeErrorRule(parsed)])
      }
      setInvalid(false)
    } catch {
      setRules([defaultErrorRule()])
      setInvalid(true)
    }
  }, [value])

  useEffect(() => {
    onSerializedChange(prettyJSONString(buildErrorOverrideConfig(rules)))
  }, [onSerializedChange, rules])

  const patchRule = (id: string, patch: Partial<ErrorRuleDraft>) => {
    setRules((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }

  const patchCondition = (
    ruleId: string,
    conditionId: string,
    patch: Partial<ErrorConditionDraft>
  ) => {
    setRules((items) =>
      items.map((rule) => {
        if (rule.id !== ruleId) return rule
        return {
          ...rule,
          conditions: rule.conditions.map((condition) =>
            condition.id === conditionId ? { ...condition, ...patch } : condition
          ),
        }
      })
    )
  }

  return (
    <div className='space-y-4'>
      {invalid && (
        <div className='border-destructive/30 text-destructive rounded-md border p-3 text-xs'>
          {t('Existing JSON is invalid. Saving will replace it with the rules below.')}
        </div>
      )}
      {rules.map((rule, index) => (
        <div key={rule.id} className='border-border space-y-4 rounded-md border p-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Badge variant='secondary'>
              {t('Rule')} {index + 1}
            </Badge>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              disabled={rules.length <= 1}
              onClick={() =>
                setRules((items) => items.filter((item) => item.id !== rule.id))
              }
            >
              <Trash2 className='mr-2 h-4 w-4' />
              {t('Delete')}
            </Button>
          </div>
          <Textarea
            value={rule.message}
            placeholder={t('Error message template, e.g. {req.body.model} Resource exhausted')}
            className='min-h-20'
            onChange={(event) => patchRule(rule.id, { message: event.target.value })}
          />
          <div className='grid gap-3 md:grid-cols-2'>
            <Input
              value={rule.statusCode}
              placeholder={t('Override status code')}
              onChange={(event) =>
                patchRule(rule.id, { statusCode: event.target.value })
              }
            />
            <Textarea
              value={rule.headersText}
              placeholder={t('Response headers JSON')}
              className='min-h-20 font-mono text-xs'
              onChange={(event) =>
                patchRule(rule.id, { headersText: event.target.value })
              }
            />
          </div>
          <Separator />
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-3'>
              <Select
                value={rule.logic}
                onValueChange={(next) =>
                  patchRule(rule.id, { logic: next === 'OR' ? 'OR' : 'AND' })
                }
              >
                <SelectTrigger className='w-24'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='AND'>{t('AND')}</SelectItem>
                    <SelectItem value='OR'>{t('OR')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className='text-muted-foreground text-xs'>
                {t('Rule conditions')}
              </span>
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() =>
                patchRule(rule.id, {
                  conditions: [
                    ...rule.conditions,
                    normalizeErrorCondition({
                      source: 'status',
                      op: 'eq',
                      value: 429,
                    }),
                  ],
                })
              }
            >
              <Plus className='mr-2 h-4 w-4' />
              {t('Add condition')}
            </Button>
          </div>
          {rule.conditions.map((condition) => {
            const isScriptCondition = SCRIPT_REQUEST_OPS.has(condition.op)
            const showKey =
              !isScriptCondition && errorNeedsKey(condition.source)
            const showValue = !VALUELESS_REQUEST_OPS.has(condition.op)
            const showList = LIST_REQUEST_OPS.has(condition.op)
            const list = condition.valueList.length ? condition.valueList : ['']
            return (
              <div
                key={condition.id}
                className='bg-muted/30 space-y-3 rounded-md p-2'
              >
                <div className='grid gap-2 md:grid-cols-[170px_minmax(0,1fr)_140px_auto]'>
                  {isScriptCondition ? (
                    <div className='bg-background text-muted-foreground flex h-9 items-center rounded-md px-3 text-xs'>
                      {t('Script condition')}
                    </div>
                  ) : (
                    <Select
                      value={condition.source}
                      onValueChange={(next) => {
                        const nextSource = next || 'status'
                        patchCondition(rule.id, condition.id, {
                          source: nextSource,
                          key: errorNeedsKey(nextSource) ? condition.key : '',
                        })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ERROR_SOURCES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.label)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                  {showKey ? (
                    <FieldPathInput
                      value={condition.key}
                      onChange={(next) =>
                        patchCondition(rule.id, condition.id, { key: next })
                      }
                      options={fieldOptions(errorFieldScopes(condition.source))}
                      placeholder={t('Select or type a field path')}
                    />
                  ) : (
                    <div className='bg-background text-muted-foreground flex h-9 items-center rounded-md px-3 text-xs'>
                      {isScriptCondition
                        ? t('Use response.status_code or get("req.body.stream")')
                        : t('Built-in value')}
                    </div>
                  )}
                  <Select
                    value={condition.op}
                    onValueChange={(next) => {
                      const nextOp = next || 'eq'
                      patchCondition(rule.id, condition.id, {
                        op: nextOp,
                        valueList: LIST_REQUEST_OPS.has(nextOp)
                          ? list
                          : condition.valueList,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {REQUEST_OPS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(option.label)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    onClick={() =>
                      patchRule(rule.id, {
                        conditions: rule.conditions.filter(
                          (item) => item.id !== condition.id
                        ),
                      })
                    }
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
                {showValue &&
                  (isScriptCondition ? (
                    <Textarea
                      value={condition.valueText}
                      className='min-h-20 font-mono text-xs'
                      placeholder={
                        condition.op === 'js'
                          ? `return response.status_code === 429 && get('req.body.stream') === false;`
                          : `response.status_code == 429 && get('req.body.stream') == false`
                      }
                      onChange={(event) =>
                        patchCondition(rule.id, condition.id, {
                          valueText: event.target.value,
                        })
                      }
                    />
                  ) : showList ? (
                    <div className='space-y-2'>
                      {list.map((item, itemIndex) => (
                        <div key={itemIndex} className='flex gap-2'>
                          <Input
                            value={item}
                            placeholder={t('Value')}
                            onChange={(event) => {
                              const nextList = [...list]
                              nextList[itemIndex] = event.target.value
                              patchCondition(rule.id, condition.id, {
                                valueList: nextList,
                              })
                            }}
                          />
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            disabled={list.length <= 1}
                            onClick={() =>
                              patchCondition(rule.id, condition.id, {
                                valueList:
                                  list.filter((_, i) => i !== itemIndex).length >
                                  0
                                    ? list.filter((_, i) => i !== itemIndex)
                                    : [''],
                              })
                            }
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() =>
                          patchCondition(rule.id, condition.id, {
                            valueList: [...list, ''],
                          })
                        }
                      >
                        <Plus className='mr-2 h-4 w-4' />
                        {t('Add value')}
                      </Button>
                    </div>
                  ) : (
                    <Input
                      value={condition.valueText}
                      placeholder={t('Value')}
                      onChange={(event) =>
                        patchCondition(rule.id, condition.id, {
                          valueText: event.target.value,
                        })
                      }
                    />
                  ))}
              </div>
            )
          })}
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => setRules((items) => [...items, defaultErrorRule()])}
      >
        <Plus className='mr-2 h-4 w-4' />
        {t('Add rule')}
      </Button>
    </div>
  )
}

function EditorBody({
  kind,
  value,
  onSerializedChange,
}: {
  kind: RuleAdvancedEditorKind
  value: string
  onSerializedChange: (value: string) => void
}) {
  if (kind === 'request_match') {
    return (
      <RequestMatchRulesEditor
        value={value}
        onSerializedChange={onSerializedChange}
      />
    )
  }
  if (kind === 'error_override') {
    return (
      <ErrorOverrideRulesEditor
        value={value}
        onSerializedChange={onSerializedChange}
      />
    )
  }
  if (kind === 'response_header_override') {
    return (
      <ResponseHeaderRulesEditor
        value={value}
        onSerializedChange={onSerializedChange}
      />
    )
  }
  return (
    <OperationsRulesEditor
      kind={kind}
      value={value}
      onSerializedChange={onSerializedChange}
    />
  )
}

export function RuleAdvancedEditorDrawer({
  open,
  kind,
  value,
  onOpenChange,
  onSave,
}: RuleAdvancedEditorDrawerProps) {
  const { t } = useTranslation()
  const meta = KIND_META[kind]
  const [serialized, setSerialized] = useState(value || '')

  useEffect(() => {
    if (open) setSerialized(value || '')
  }, [open, value, kind])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-screen sm:max-w-none sm:[width:clamp(520px,calc(100vw-48rem),900px)]'>
        <SheetHeader className='border-border border-b pr-12'>
          <SheetTitle>{t(meta.title)}</SheetTitle>
          <SheetDescription>{t(meta.description)}</SheetDescription>
        </SheetHeader>
        <ScrollArea className='min-h-0 flex-1'>
          <div className='grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_290px]'>
            <div className='space-y-4'>
              <EditorBody
                kind={kind}
                value={value || ''}
                onSerializedChange={setSerialized}
              />
              <JSONPreview value={serialized} />
            </div>
            <FieldCatalogPanel />
          </div>
        </ScrollArea>
        <SheetFooter className='border-border border-t sm:flex-row sm:justify-between'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => {
              onSave('')
              onOpenChange(false)
            }}
          >
            <RotateCcw className='mr-2 h-4 w-4' />
            {t('Clear')}
          </Button>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              onClick={() => {
                onSave(serialized)
                onOpenChange(false)
              }}
            >
              <Save className='mr-2 h-4 w-4' />
              {t('Save')}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
