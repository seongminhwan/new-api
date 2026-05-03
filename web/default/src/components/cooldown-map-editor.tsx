import { useCallback, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type CooldownEntry = { model: string; seconds: number }

interface CooldownMapEditorProps {
  value: Record<string, number> | undefined
  onChange: (value: Record<string, number>) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}

function mapToEntries(
  map_: Record<string, number> | undefined
): CooldownEntry[] {
  if (!map_ || Object.keys(map_).length === 0) return []
  return Object.entries(map_).map(([model, seconds]) => ({ model, seconds }))
}

function entriesToMap(entries: CooldownEntry[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const entry of entries) {
    const key = entry.model.trim()
    if (key) {
      result[key] = entry.seconds
    }
  }
  return result
}

export function CooldownMapEditor({
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: CooldownMapEditorProps) {
  const { t } = useTranslation()
  // Internal entries state allows empty model names while editing
  const [entries, setEntries] = useState<CooldownEntry[]>(() =>
    mapToEntries(value)
  )
  const prevValueRef = useRef(value)

  // Sync from parent when value changes externally
  if (value !== prevValueRef.current) {
    prevValueRef.current = value
    const incoming = mapToEntries(value)
    // Only reset if no pending empty entries (user is typing)
    if (!entries.some((e) => !e.model.trim())) {
      setEntries(incoming)
    }
  }

  const emitChange = useCallback(
    (next: CooldownEntry[]) => {
      setEntries(next)
      onChange(entriesToMap(next))
    },
    [onChange]
  )

  const updateEntry = useCallback(
    (index: number, field: keyof CooldownEntry, val: string | number) => {
      const next = [...entries]
      if (field === 'model') {
        next[index] = { ...next[index], model: val as string }
      } else {
        next[index] = { ...next[index], seconds: Number(val) || 0 }
      }
      setEntries(next)
      // Only emit cleaned map when model name is non-empty
      onChange(entriesToMap(next))
    },
    [entries, onChange]
  )

  const removeEntry = useCallback(
    (index: number) => {
      const next = entries.filter((_, i) => i !== index)
      emitChange(next)
    },
    [entries, emitChange]
  )

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, { model: '', seconds: 60 }])
  }, [])

  return (
    <div className='space-y-2'>
      {entries.map((entry, index) => (
        <div key={index} className='flex items-center gap-2'>
          <Input
            className='flex-1'
            placeholder={keyPlaceholder ?? t('Model name')}
            value={entry.model}
            onChange={(e) => updateEntry(index, 'model', e.target.value)}
          />
          <Input
            className='w-24'
            type='number'
            min={0}
            step={1}
            placeholder={valuePlaceholder ?? t('Seconds')}
            value={entry.seconds}
            onChange={(e) =>
              updateEntry(index, 'seconds', e.target.valueAsNumber)
            }
          />
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => removeEntry(index)}
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={addEntry}
        className='mt-1'
      >
        <Plus className='mr-1 h-3 w-3' />
        {t('Add override')}
      </Button>
    </div>
  )
}
