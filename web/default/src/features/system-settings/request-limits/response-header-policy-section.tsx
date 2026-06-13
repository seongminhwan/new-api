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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/multi-select'
import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type ResponseHeaderPolicyValues = {
  'response_header_policy.whitelist': string[]
  'response_header_policy.blacklist': string[]
}

type ResponseHeaderPolicySectionProps = {
  defaultValues: ResponseHeaderPolicyValues
}

const COMMON_RESPONSE_HEADERS = [
  'Content-Type',
  'Cache-Control',
  'X-Request-Id',
  'X-Oneapi-Request-Id',
  'X-Accel-Buffering',
  'OpenAI-Organization',
  'OpenAI-Processing-Ms',
  'OpenAI-Version',
  'Anthropic-Organization-Id',
  'Anthropic-Ratelimit-Requests-Limit',
  'Anthropic-Ratelimit-Requests-Remaining',
  'Anthropic-Ratelimit-Tokens-Limit',
  'Anthropic-Ratelimit-Tokens-Remaining',
]

const normalizeHeaderPatterns = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.replaceAll(/\s+/g, ' '))
    )
  )

const arraysEqual = (a: string[], b: string[]) =>
  JSON.stringify(a) === JSON.stringify(b)

export function ResponseHeaderPolicySection({
  defaultValues,
}: ResponseHeaderPolicySectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const baselineRef = useRef<ResponseHeaderPolicyValues>(defaultValues)
  const [values, setValues] =
    useState<ResponseHeaderPolicyValues>(defaultValues)

  useEffect(() => {
    baselineRef.current = defaultValues
    setValues(defaultValues)
  }, [defaultValues])

  const options = useMemo(
    () =>
      Array.from(
        new Set([
          ...COMMON_RESPONSE_HEADERS,
          ...values['response_header_policy.whitelist'],
          ...values['response_header_policy.blacklist'],
        ])
      ).map((header) => ({
        label: header,
        value: header,
      })),
    [values]
  )

  const save = async () => {
    const normalized: ResponseHeaderPolicyValues = {
      'response_header_policy.whitelist': normalizeHeaderPatterns(
        values['response_header_policy.whitelist']
      ),
      'response_header_policy.blacklist': normalizeHeaderPatterns(
        values['response_header_policy.blacklist']
      ),
    }

    const updates = (
      Object.keys(normalized) as Array<keyof ResponseHeaderPolicyValues>
    ).filter((key) => !arraysEqual(normalized[key], baselineRef.current[key]))

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of updates) {
      await updateOption.mutateAsync({
        key,
        value: JSON.stringify(normalized[key]),
      })
    }

    baselineRef.current = normalized
    setValues(normalized)
  }

  return (
    <SettingsSection title={t('Response Header Policy')}>
      <SettingsForm
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <SettingsPageFormActions
          onSave={() => void save()}
          isSaving={updateOption.isPending}
          saveLabel='Save response header policy'
        />

        <div data-settings-form-span='full' className='space-y-1.5'>
          <Label>{t('Response Header Whitelist')}</Label>
          <MultiSelect
            options={options}
            selected={values['response_header_policy.whitelist']}
            placeholder={t('Search or enter response headers')}
            emptyText={t('No response headers found')}
            allowCreate
            createLabel='Add header "{{value}}"'
            onChange={(next) =>
              setValues((prev) => ({
                ...prev,
                'response_header_policy.whitelist':
                  normalizeHeaderPatterns(next),
              }))
            }
          />
          <p className='text-muted-foreground text-xs'>
            {t('When configured, only matching response headers are returned.')}
          </p>
        </div>

        <div data-settings-form-span='full' className='space-y-1.5'>
          <Label>{t('Response Header Blacklist')}</Label>
          <MultiSelect
            options={options}
            selected={values['response_header_policy.blacklist']}
            placeholder={t('Search or enter response headers')}
            emptyText={t('No response headers found')}
            allowCreate
            createLabel='Add header "{{value}}"'
            onChange={(next) =>
              setValues((prev) => ({
                ...prev,
                'response_header_policy.blacklist':
                  normalizeHeaderPatterns(next),
              }))
            }
          />
          <p className='text-muted-foreground text-xs'>
            {t('Blacklisted response headers are removed after rewriting.')}
          </p>
        </div>
      </SettingsForm>
    </SettingsSection>
  )
}
