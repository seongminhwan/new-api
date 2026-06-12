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
import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type RequestMatchSource = 'header' | 'query' | 'body' | 'path' | 'method'
type RequestMatchOp =
  | 'exists'
  | 'missing'
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'prefix'
  | 'suffix'
  | 'regex'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'expr'
  | 'js'

type RequestMatchCondition = {
  source?: RequestMatchSource
  key?: string
  path?: string
  op: RequestMatchOp
  value?: unknown
  expr?: string
  script?: string
}

type RequestMatchConfig = {
  logic?: 'AND' | 'OR'
  conditions?: RequestMatchCondition[]
}

type VisualCondition = {
  source: RequestMatchSource
  key: string
  op: RequestMatchOp
  valueText: string
  valueList: string[]
}

type RequestMatchEditorProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const SOURCE_OPTIONS: Array<{ value: RequestMatchSource; label: string }> = [
  { value: 'header', label: 'Header' },
  { value: 'query', label: 'Query' },
  { value: 'body', label: 'JSON Body' },
  { value: 'path', label: 'Path' },
  { value: 'method', label: 'Method' },
]

const OP_OPTIONS: Array<{ value: RequestMatchOp; label: string }> = [
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
]

const VALUELESS_OPS = new Set<RequestMatchOp>(['exists', 'missing'])
const LIST_OPS = new Set<RequestMatchOp>(['in', 'not_in'])
const NUMBER_OPS = new Set<RequestMatchOp>(['gt', 'gte', 'lt', 'lte'])
const SCRIPT_OPS = new Set<RequestMatchOp>(['expr', 'js'])

const DEFAULT_CONDITION: VisualCondition = {
  source: 'body',
  key: 'stream',
  op: 'eq',
  valueText: 'true',
  valueList: ['true'],
}

const DEFAULT_CONFIG: RequestMatchConfig = {
  logic: 'AND',
  conditions: [
    {
      source: 'body',
      path: 'stream',
      op: 'eq',
      value: true,
    },
  ],
}

function normalizeSource(source: unknown): RequestMatchSource {
  if (
    source === 'header' ||
    source === 'query' ||
    source === 'body' ||
    source === 'path' ||
    source === 'method'
  ) {
    return source
  }
  return 'body'
}

function normalizeOp(op: unknown): RequestMatchOp {
  if (OP_OPTIONS.some((item) => item.value === op)) return op as RequestMatchOp
  return 'eq'
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value))
    return value.map((item) => stringifyValue(item)).join(', ')
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function valueToList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item))
  }
  const text = stringifyValue(value)
  if (!text) return ['']
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toVisualCondition(condition: RequestMatchCondition): VisualCondition {
  const op = normalizeOp(condition.op)
  const scriptText =
    op === 'js'
      ? condition.script || condition.expr || stringifyValue(condition.value)
      : condition.expr || condition.script || stringifyValue(condition.value)
  return {
    source: normalizeSource(condition.source),
    key: String(condition.path || condition.key || ''),
    op,
    valueText: SCRIPT_OPS.has(op)
      ? scriptText
      : LIST_OPS.has(op)
        ? ''
        : stringifyValue(condition.value),
    valueList: valueToList(condition.value),
  }
}

function parseScalarValue(text: string): unknown {
  const raw = text.trim()
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (raw.startsWith('[') || raw.startsWith('{') || /^-?\d/.test(raw)) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  return raw
}

function parseValueText(condition: VisualCondition): unknown {
  const text = condition.valueText.trim()
  if (NUMBER_OPS.has(condition.op)) {
    const numberValue = Number(text)
    return Number.isFinite(numberValue) ? numberValue : text
  }
  return parseScalarValue(text)
}

function parseValueList(condition: VisualCondition): unknown[] {
  return (condition.valueList || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseScalarValue)
}

function toRequestCondition(condition: VisualCondition): RequestMatchCondition {
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
  const next: RequestMatchCondition = {
    source: condition.source,
    op: condition.op,
  }
  if (condition.source === 'body') {
    next.path = condition.key.trim()
  } else if (condition.source === 'header' || condition.source === 'query') {
    next.key = condition.key.trim()
  }
  if (!VALUELESS_OPS.has(condition.op)) {
    next.value = LIST_OPS.has(condition.op)
      ? parseValueList(condition)
      : parseValueText(condition)
  }
  return next
}

function stringifyConfig(config: RequestMatchConfig): string {
  return JSON.stringify(config, null, 2)
}

function parseConfig(raw: string): {
  config: RequestMatchConfig
  invalid: boolean
} {
  if (!raw.trim()) {
    return { config: { logic: 'AND', conditions: [] }, invalid: false }
  }
  try {
    const parsed = JSON.parse(raw) as RequestMatchConfig
    return {
      config: {
        logic: parsed.logic === 'OR' ? 'OR' : 'AND',
        conditions: Array.isArray(parsed.conditions)
          ? parsed.conditions.map((item) =>
              toRequestCondition(toVisualCondition(item))
            )
          : [],
      },
      invalid: false,
    }
  } catch {
    return { config: { logic: 'AND', conditions: [] }, invalid: true }
  }
}

function buildConfig(logic: 'AND' | 'OR', conditions: VisualCondition[]) {
  return {
    logic,
    conditions: conditions.map(toRequestCondition),
  }
}

function needsLookupKey(source: RequestMatchSource): boolean {
  return source === 'header' || source === 'query' || source === 'body'
}

function getKeyPlaceholder(source: RequestMatchSource): string {
  if (source === 'header') return 'X-Client'
  if (source === 'query') return 'tier'
  if (source === 'body') return 'reasoning.effort'
  return ''
}

function ensureListValues(condition: VisualCondition): string[] {
  if (condition.valueList.length > 0) return condition.valueList
  const text = condition.valueText.trim()
  return text ? valueToList(text) : ['']
}

export function RequestMatchEditor({
  value,
  onChange,
  disabled,
}: RequestMatchEditorProps) {
  const { t } = useTranslation()
  const enabled = Boolean(value.trim())
  const parsed = useMemo(() => parseConfig(value), [value])
  const logic = parsed.config.logic === 'OR' ? 'OR' : 'AND'
  const conditions = useMemo(
    () => (parsed.config.conditions || []).map(toVisualCondition),
    [parsed.config.conditions]
  )

  const updateFromConditions = (
    nextLogic: 'AND' | 'OR',
    nextConditions: VisualCondition[]
  ) => {
    onChange(stringifyConfig(buildConfig(nextLogic, nextConditions)))
  }

  const updateCondition = (index: number, patch: Partial<VisualCondition>) => {
    const nextConditions = conditions.slice()
    nextConditions[index] = {
      ...conditions[index],
      ...patch,
    }
    updateFromConditions(logic, nextConditions)
  }

  const toggleEnabled = (checked: boolean) => {
    if (!checked) {
      onChange('')
      return
    }
    onChange(stringifyConfig(DEFAULT_CONFIG))
  }

  return (
    <div className='space-y-4'>
      <div className='border-border flex items-center justify-between gap-3 rounded-md border p-3'>
        <div className='space-y-1'>
          <div className='text-sm font-medium'>
            {t('Enable request matching')}
          </div>
          <p className='text-muted-foreground text-xs'>
            {t('Only route requests that satisfy these channel constraints.')}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={toggleEnabled}
        />
      </div>

      {enabled && parsed.invalid && (
        <div className='space-y-3'>
          <p className='text-destructive text-xs'>
            {t('Request matching JSON is invalid.')}
          </p>
          <Textarea
            value={value}
            disabled={disabled}
            className='min-h-40 font-mono text-xs'
            onChange={(event) => onChange(event.target.value)}
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled}
            onClick={() => onChange(stringifyConfig(DEFAULT_CONFIG))}
          >
            {t('Reset template')}
          </Button>
        </div>
      )}

      {enabled && !parsed.invalid && (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center gap-3'>
            <Select
              value={logic}
              disabled={disabled}
              onValueChange={(next) =>
                updateFromConditions(next === 'OR' ? 'OR' : 'AND', conditions)
              }
            >
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
            {conditions.map((condition, index) => {
              const isScriptCondition = SCRIPT_OPS.has(condition.op)
              const showKey =
                !isScriptCondition && needsLookupKey(condition.source)
              const showValue = !VALUELESS_OPS.has(condition.op)
              const showListValues = LIST_OPS.has(condition.op)
              return (
                <div
                  key={index}
                  className='border-border grid gap-3 rounded-md border p-3 sm:grid-cols-[150px_1fr_150px_1fr_auto]'
                >
                  {isScriptCondition ? (
                    <div className='bg-muted text-muted-foreground flex h-9 items-center rounded-md px-3 text-xs'>
                      {t('Script condition')}
                    </div>
                  ) : (
                    <Select
                      value={condition.source}
                      disabled={disabled}
                      onValueChange={(source) => {
                        const normalizedSource = normalizeSource(source)
                        updateCondition(index, {
                          source: normalizeSource(source),
                          key: needsLookupKey(normalizedSource)
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
                          {SOURCE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.label)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}

                  {showKey ? (
                    <Input
                      value={condition.key}
                      disabled={disabled}
                      placeholder={getKeyPlaceholder(condition.source)}
                      onChange={(event) => {
                        updateCondition(index, {
                          key: event.target.value,
                        })
                      }}
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
                    disabled={disabled}
                    onValueChange={(op) => {
                      const nextOp = normalizeOp(op)
                      updateCondition(index, {
                        op: nextOp,
                        valueList: LIST_OPS.has(nextOp)
                          ? ensureListValues(condition)
                          : condition.valueList,
                        valueText:
                          LIST_OPS.has(condition.op) && !LIST_OPS.has(nextOp)
                            ? ensureListValues(condition)[0] || ''
                            : condition.valueText,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {OP_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(option.label)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {showValue ? (
                    isScriptCondition ? (
                      <Textarea
                        value={condition.valueText}
                        disabled={disabled}
                        className='min-h-20 font-mono text-xs'
                        placeholder={
                          condition.op === 'expr'
                            ? `get('req.body.stream') == false`
                            : `return get('req.body.stream') === false;`
                        }
                        onChange={(event) => {
                          updateCondition(index, {
                            valueText: event.target.value,
                          })
                        }}
                      />
                    ) : showListValues ? (
                      <div className='space-y-2'>
                        {ensureListValues(condition).map((item, itemIndex) => (
                          <div
                            key={`${index}-${itemIndex}`}
                            className='flex gap-2'
                          >
                            <Input
                              value={item}
                              disabled={disabled}
                              placeholder={t('Value')}
                              onChange={(event) => {
                                const nextList =
                                  ensureListValues(condition).slice()
                                nextList[itemIndex] = event.target.value
                                updateCondition(index, {
                                  valueList: nextList,
                                })
                              }}
                            />
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              disabled={
                                disabled ||
                                ensureListValues(condition).length <= 1
                              }
                              onClick={() => {
                                const nextList = ensureListValues(
                                  condition
                                ).filter((_, i) => i !== itemIndex)
                                updateCondition(index, {
                                  valueList: nextList.length ? nextList : [''],
                                })
                              }}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          disabled={disabled}
                          onClick={() =>
                            updateCondition(index, {
                              valueList: [...ensureListValues(condition), ''],
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
                        disabled={disabled}
                        type={NUMBER_OPS.has(condition.op) ? 'number' : 'text'}
                        placeholder={t('Value')}
                        onChange={(event) => {
                          updateCondition(index, {
                            valueText: event.target.value,
                          })
                        }}
                      />
                    )
                  ) : (
                    <div className='bg-muted text-muted-foreground flex h-9 items-center rounded-md px-3 text-xs'>
                      {t('No value required')}
                    </div>
                  )}

                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    disabled={disabled}
                    onClick={() => {
                      const nextConditions = conditions.filter(
                        (_, itemIndex) => itemIndex !== index
                      )
                      updateFromConditions(logic, nextConditions)
                    }}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              )
            })}
          </div>

          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled}
            onClick={() =>
              updateFromConditions(logic, [...conditions, DEFAULT_CONDITION])
            }
          >
            <Plus className='mr-2 h-4 w-4' />
            {t('Add condition')}
          </Button>

          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='px-0'
                />
              }
            >
              {t('Advanced JSON')}
            </CollapsibleTrigger>
            <CollapsibleContent className='pt-2'>
              <Textarea
                value={value}
                disabled={disabled}
                className='min-h-44 font-mono text-xs'
                onChange={(event) => onChange(event.target.value)}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  )
}
