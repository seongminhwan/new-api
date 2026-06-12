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
import { useEffect, useMemo, useRef } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { parseHttpStatusCodeRules } from '@/lib/http-status-code-rules'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CooldownMapEditor } from '@/components/cooldown-map-editor'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

const numericString = z.string().refine((value) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  return !Number.isNaN(Number(trimmed)) && Number(trimmed) >= 0
}, 'Enter a non-negative number or leave empty')

const monitoringSchema = z
  .object({
    ChannelDisableThreshold: numericString,
    QuotaRemindThreshold: numericString,
    AutomaticDisableChannelEnabled: z.boolean(),
    AutomaticEnableChannelEnabled: z.boolean(),
    AutomaticDisableKeywords: z.string(),
    AutomaticDisableStatusCodes: z.string(),
    AutomaticRetryStatusCodes: z.string(),
    monitor_setting: z.object({
      auto_test_channel_enabled: z.boolean(),
      auto_test_channel_minutes: z.coerce
        .number()
        .int()
        .min(1, 'Interval must be at least 1 minute'),
      rate_limit_cooldown_seconds: z.coerce.number().int().min(0),
      rate_limit_model_cooldowns: z
        .record(z.string(), z.number().int().min(0))
        .optional()
        .default({}),
      rate_limit_all_cooldown_message: z.string(),
      rpm_limit: z.coerce.number().int().min(0),
      rpm_model_limits: z
        .record(z.string(), z.number().int().min(0))
        .optional()
        .default({}),
      rpm_all_limit_message: z.string(),
      retry_elapsed_threshold_seconds: z.coerce.number().int().min(0),
      retry_elapsed_model_thresholds: z
        .record(z.string(), z.number().int().min(0))
        .optional()
        .default({}),
    }),
  })
  .superRefine((values, ctx) => {
    const disableParsed = parseHttpStatusCodeRules(
      values.AutomaticDisableStatusCodes
    )
    if (!disableParsed.ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['AutomaticDisableStatusCodes'],
        message: `Invalid status code rules: ${disableParsed.invalidTokens.join(
          ', '
        )}`,
      })
    }

    const retryParsed = parseHttpStatusCodeRules(
      values.AutomaticRetryStatusCodes
    )
    if (!retryParsed.ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['AutomaticRetryStatusCodes'],
        message: `Invalid status code rules: ${retryParsed.invalidTokens.join(
          ', '
        )}`,
      })
    }
  })

type MonitoringFormValues = z.output<typeof monitoringSchema>
type MonitoringFormInput = z.input<typeof monitoringSchema>

type MonitoringSettingsSectionProps = {
  defaultValues: {
    ChannelDisableThreshold: string
    QuotaRemindThreshold: string
    AutomaticDisableChannelEnabled: boolean
    AutomaticEnableChannelEnabled: boolean
    AutomaticDisableKeywords: string
    AutomaticDisableStatusCodes: string
    AutomaticRetryStatusCodes: string
    'monitor_setting.auto_test_channel_enabled': boolean
    'monitor_setting.auto_test_channel_minutes': number
    'monitor_setting.rate_limit_cooldown_seconds': number
    'monitor_setting.rate_limit_model_cooldowns': Record<string, number>
    'monitor_setting.rate_limit_all_cooldown_message': string
    'monitor_setting.rpm_limit': number
    'monitor_setting.rpm_model_limits': Record<string, number>
    'monitor_setting.rpm_all_limit_message': string
    'monitor_setting.retry_elapsed_threshold_seconds': number
    'monitor_setting.retry_elapsed_model_thresholds': Record<string, number>
  }
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, '\n')
}

type NormalizedMonitoringValues = {
  ChannelDisableThreshold: string
  QuotaRemindThreshold: string
  AutomaticDisableChannelEnabled: boolean
  AutomaticEnableChannelEnabled: boolean
  AutomaticDisableKeywords: string
  AutomaticDisableStatusCodes: string
  AutomaticRetryStatusCodes: string
  'monitor_setting.auto_test_channel_enabled': boolean
  'monitor_setting.auto_test_channel_minutes': number
  'monitor_setting.rate_limit_cooldown_seconds': number
  'monitor_setting.rate_limit_model_cooldowns': string
  'monitor_setting.rate_limit_all_cooldown_message': string
  'monitor_setting.rpm_limit': number
  'monitor_setting.rpm_model_limits': string
  'monitor_setting.rpm_all_limit_message': string
  'monitor_setting.retry_elapsed_threshold_seconds': number
  'monitor_setting.retry_elapsed_model_thresholds': string
}

const buildFormDefaults = (
  defaults: MonitoringSettingsSectionProps['defaultValues']
): MonitoringFormInput => ({
  ChannelDisableThreshold: defaults.ChannelDisableThreshold ?? '',
  QuotaRemindThreshold: defaults.QuotaRemindThreshold ?? '',
  AutomaticDisableChannelEnabled: defaults.AutomaticDisableChannelEnabled,
  AutomaticEnableChannelEnabled: defaults.AutomaticEnableChannelEnabled,
  AutomaticDisableKeywords: normalizeLineEndings(
    defaults.AutomaticDisableKeywords ?? ''
  ),
  AutomaticDisableStatusCodes: defaults.AutomaticDisableStatusCodes ?? '',
  AutomaticRetryStatusCodes: defaults.AutomaticRetryStatusCodes ?? '',
  monitor_setting: {
    auto_test_channel_enabled:
      defaults['monitor_setting.auto_test_channel_enabled'],
    auto_test_channel_minutes:
      defaults['monitor_setting.auto_test_channel_minutes'],
    rate_limit_cooldown_seconds:
      defaults['monitor_setting.rate_limit_cooldown_seconds'] ?? 60,
    rate_limit_model_cooldowns:
      defaults['monitor_setting.rate_limit_model_cooldowns'] ?? {},
    rate_limit_all_cooldown_message:
      defaults['monitor_setting.rate_limit_all_cooldown_message'] ?? '',
    rpm_limit: defaults['monitor_setting.rpm_limit'] ?? 0,
    rpm_model_limits: defaults['monitor_setting.rpm_model_limits'] ?? {},
    rpm_all_limit_message:
      defaults['monitor_setting.rpm_all_limit_message'] ?? '',
    retry_elapsed_threshold_seconds:
      defaults['monitor_setting.retry_elapsed_threshold_seconds'] ?? 0,
    retry_elapsed_model_thresholds:
      defaults['monitor_setting.retry_elapsed_model_thresholds'] ?? {},
  },
})

const normalizeDefaults = (
  defaults: MonitoringSettingsSectionProps['defaultValues']
): NormalizedMonitoringValues => ({
  ChannelDisableThreshold: (defaults.ChannelDisableThreshold ?? '').trim(),
  QuotaRemindThreshold: (defaults.QuotaRemindThreshold ?? '').trim(),
  AutomaticDisableChannelEnabled: defaults.AutomaticDisableChannelEnabled,
  AutomaticEnableChannelEnabled: defaults.AutomaticEnableChannelEnabled,
  AutomaticDisableKeywords: normalizeLineEndings(
    defaults.AutomaticDisableKeywords ?? ''
  ),
  AutomaticDisableStatusCodes: parseHttpStatusCodeRules(
    defaults.AutomaticDisableStatusCodes ?? ''
  ).normalized,
  AutomaticRetryStatusCodes: parseHttpStatusCodeRules(
    defaults.AutomaticRetryStatusCodes ?? ''
  ).normalized,
  'monitor_setting.auto_test_channel_enabled':
    defaults['monitor_setting.auto_test_channel_enabled'],
  'monitor_setting.auto_test_channel_minutes':
    defaults['monitor_setting.auto_test_channel_minutes'],
  'monitor_setting.rate_limit_cooldown_seconds':
    defaults['monitor_setting.rate_limit_cooldown_seconds'] ?? 60,
  'monitor_setting.rate_limit_model_cooldowns': JSON.stringify(
    defaults['monitor_setting.rate_limit_model_cooldowns'] ?? {}
  ),
  'monitor_setting.rate_limit_all_cooldown_message':
    defaults['monitor_setting.rate_limit_all_cooldown_message'] ?? '',
  'monitor_setting.rpm_limit': defaults['monitor_setting.rpm_limit'] ?? 0,
  'monitor_setting.rpm_model_limits': JSON.stringify(
    defaults['monitor_setting.rpm_model_limits'] ?? {}
  ),
  'monitor_setting.rpm_all_limit_message':
    defaults['monitor_setting.rpm_all_limit_message'] ?? '',
  'monitor_setting.retry_elapsed_threshold_seconds':
    defaults['monitor_setting.retry_elapsed_threshold_seconds'] ?? 0,
  'monitor_setting.retry_elapsed_model_thresholds': JSON.stringify(
    defaults['monitor_setting.retry_elapsed_model_thresholds'] ?? {}
  ),
})

const normalizeFormValues = (
  values: MonitoringFormValues
): NormalizedMonitoringValues => ({
  ChannelDisableThreshold: values.ChannelDisableThreshold.trim(),
  QuotaRemindThreshold: values.QuotaRemindThreshold.trim(),
  AutomaticDisableChannelEnabled: values.AutomaticDisableChannelEnabled,
  AutomaticEnableChannelEnabled: values.AutomaticEnableChannelEnabled,
  AutomaticDisableKeywords: normalizeLineEndings(
    values.AutomaticDisableKeywords
  ),
  AutomaticDisableStatusCodes: parseHttpStatusCodeRules(
    values.AutomaticDisableStatusCodes
  ).normalized,
  AutomaticRetryStatusCodes: parseHttpStatusCodeRules(
    values.AutomaticRetryStatusCodes
  ).normalized,
  'monitor_setting.auto_test_channel_enabled':
    values.monitor_setting.auto_test_channel_enabled,
  'monitor_setting.auto_test_channel_minutes':
    values.monitor_setting.auto_test_channel_minutes,
  'monitor_setting.rate_limit_cooldown_seconds':
    values.monitor_setting.rate_limit_cooldown_seconds,
  'monitor_setting.rate_limit_model_cooldowns': JSON.stringify(
    values.monitor_setting.rate_limit_model_cooldowns ?? {}
  ),
  'monitor_setting.rate_limit_all_cooldown_message':
    values.monitor_setting.rate_limit_all_cooldown_message,
  'monitor_setting.rpm_limit': values.monitor_setting.rpm_limit,
  'monitor_setting.rpm_model_limits': JSON.stringify(
    values.monitor_setting.rpm_model_limits ?? {}
  ),
  'monitor_setting.rpm_all_limit_message':
    values.monitor_setting.rpm_all_limit_message,
  'monitor_setting.retry_elapsed_threshold_seconds':
    values.monitor_setting.retry_elapsed_threshold_seconds,
  'monitor_setting.retry_elapsed_model_thresholds': JSON.stringify(
    values.monitor_setting.retry_elapsed_model_thresholds ?? {}
  ),
})

export function MonitoringSettingsSection({
  defaultValues,
}: MonitoringSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const baselineRef = useRef<NormalizedMonitoringValues>(
    normalizeDefaults(defaultValues)
  )

  useEffect(() => {
    baselineRef.current = normalizeDefaults(defaultValues)
  }, [defaultValues])

  const formDefaults = useMemo(
    () => buildFormDefaults(defaultValues),
    [defaultValues]
  )

  const form = useForm<MonitoringFormInput, unknown, MonitoringFormValues>({
    resolver: zodResolver(monitoringSchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  const autoDisableStatusCodes = form.watch('AutomaticDisableStatusCodes')
  const autoRetryStatusCodes = form.watch('AutomaticRetryStatusCodes')
  const autoDisableParsed = useMemo(
    () => parseHttpStatusCodeRules(autoDisableStatusCodes),
    [autoDisableStatusCodes]
  )
  const autoRetryParsed = useMemo(
    () => parseHttpStatusCodeRules(autoRetryStatusCodes),
    [autoRetryStatusCodes]
  )

  const onSubmit = async (values: MonitoringFormValues) => {
    const normalized = normalizeFormValues(values)
    const updates = (
      Object.keys(normalized) as Array<keyof NormalizedMonitoringValues>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of updates) {
      const value = normalized[key]
      await updateOption.mutateAsync({
        key,
        value,
      })
    }

    baselineRef.current = normalized
  }

  return (
    <SettingsSection title={t('Monitoring & Alerts')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save monitoring rules'
          />
          <div className='grid gap-6 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='monitor_setting.auto_test_channel_enabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Scheduled channel tests')}</FormLabel>
                    <FormDescription>
                      {t('Automatically probe all channels in the background')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='monitor_setting.auto_test_channel_minutes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Test interval (minutes)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={1}
                      step={1}
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('How frequently the system tests all channels')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid gap-6 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='ChannelDisableThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Disable threshold (seconds)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Automatically disable channels exceeding this response time'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='QuotaRemindThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Quota reminder (tokens)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Send email alerts when a user falls below this quota')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='grid gap-6 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='AutomaticDisableChannelEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Disable on failure')}</FormLabel>
                    <FormDescription>
                      {t('Automatically disable channels when tests fail')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='AutomaticEnableChannelEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Re-enable on success')}</FormLabel>
                    <FormDescription>
                      {t('Bring channels back online after successful checks')}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='AutomaticDisableKeywords'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Failure keywords')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={6}
                    placeholder={t('one keyword per line')}
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'If an upstream error contains any of these keywords (case insensitive), the channel will be disabled automatically.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='grid gap-6 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='AutomaticDisableStatusCodes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Auto-disable status codes')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('e.g. 401, 403, 429, 500-599')}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Accepts comma-separated status codes and inclusive ranges.'
                    )}{' '}
                    {autoDisableParsed.ok &&
                      autoDisableParsed.normalized &&
                      autoDisableParsed.normalized !== field.value.trim() && (
                        <span className='text-muted-foreground'>
                          {t('Normalized:')} {autoDisableParsed.normalized}
                        </span>
                      )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='AutomaticRetryStatusCodes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Auto-retry status codes')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('e.g. 401, 403, 429, 500-599')}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Accepts comma-separated status codes and inclusive ranges.'
                    )}{' '}
                    {autoRetryParsed.ok &&
                      autoRetryParsed.normalized &&
                      autoRetryParsed.normalized !== field.value.trim() && (
                        <span className='text-muted-foreground'>
                          {t('Normalized:')} {autoRetryParsed.normalized}
                        </span>
                      )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='space-y-4 rounded-xl border p-5'>
            <div className='space-y-1'>
              <h4 className='text-sm font-semibold'>
                {t('Retry Elapsed Limit')}
              </h4>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Skip further retries after a request has already spent too much time across previous channels'
                )}
              </p>
            </div>

            <FormField
              control={form.control}
              name='monitor_setting.retry_elapsed_threshold_seconds'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Max retry elapsed time (seconds)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Skip further retries once the request has already spent this many seconds. Set to 0 to disable.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='monitor_setting.retry_elapsed_model_thresholds'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Per-model retry elapsed thresholds')}</FormLabel>
                  <FormControl>
                    <CooldownMapEditor
                      value={field.value}
                      onChange={field.onChange}
                      keyPlaceholder={t('Model name (e.g. gpt-4o)')}
                      valuePlaceholder={t('Seconds')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Override retry elapsed threshold for specific models globally. Takes priority over the default above.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='space-y-4 rounded-md border p-4'>
            <div className='space-y-1'>
              <h4 className='text-sm font-semibold'>
                {t('Rate Limit Cooldown')}
              </h4>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Temporarily skip a channel+model combination when upstream returns 429'
                )}
              </p>
            </div>

            <FormField
              control={form.control}
              name='monitor_setting.rate_limit_cooldown_seconds'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Default cooldown (seconds)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Fallback cooldown duration for all channels and models. Set to 0 to disable.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='monitor_setting.rate_limit_model_cooldowns'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Per-model cooldown overrides')}</FormLabel>
                  <FormControl>
                    <CooldownMapEditor
                      value={field.value}
                      onChange={field.onChange}
                      keyPlaceholder={t('Model name (e.g. gpt-4o)')}
                      valuePlaceholder={t('Seconds')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Override cooldown for specific models globally. Takes priority over the default above.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='monitor_setting.rate_limit_all_cooldown_message'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Rate-limited message template')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Message returned to clients when all channels for a model are rate-limited. Supports Go template variable: {{.Model}}'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* RPM Limiting */}
          <div className='space-y-4 rounded-xl border p-5'>
            <div className='space-y-1'>
              <h4 className='text-sm font-semibold'>{t('RPM Limiting')}</h4>
              <p className='text-muted-foreground text-xs'>
                {t('Limit requests per minute per channel+model combination')}
              </p>
            </div>

            <FormField
              control={form.control}
              name='monitor_setting.rpm_limit'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Default RPM limit')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      value={
                        typeof field.value === 'number' &&
                        Number.isFinite(field.value)
                          ? field.value
                          : ''
                      }
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                      name={field.name}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Maximum requests per minute per channel+model. Set to 0 to disable.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='monitor_setting.rpm_model_limits'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Per-model RPM overrides')}</FormLabel>
                  <FormControl>
                    <CooldownMapEditor
                      value={field.value}
                      onChange={field.onChange}
                      keyPlaceholder={t('Model name (e.g. gpt-4o)')}
                      valuePlaceholder={t('RPM')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Override RPM limit for specific models globally. Takes priority over the default above.'
                    )}
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='monitor_setting.rpm_all_limit_message'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('RPM exceeded message template')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Message returned to clients when all channels for a model have exceeded RPM limit. Supports Go template variable: {{.Model}}'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
