/*
Copyright (C) 2025 QuantumNous

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

import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Divider,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconDelete, IconPlus, IconSave } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { API, selectFilter, showError, showSuccess } from '../../helpers';

const { Text } = Typography;

const mbToBytes = (value) =>
  Math.max(1, Math.round(Number(value || 1) * 1024 * 1024));
const bytesToMb = (value) =>
  Number(((Number(value || 0) || 0) / 1024 / 1024).toFixed(2));
const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const clampRate = (value) => Math.max(0, Math.min(1, Number(value || 0)));
const percentToRate = (value) =>
  Math.max(0, Math.min(100, Number(value || 0))) / 100;
const rateToPercent = (value) =>
  value === undefined || value === null || value === ''
    ? ''
    : Math.round(Number(value || 0) * 10000) / 100;
const toStringValues = (values) => (values || []).map((value) => String(value));
const toNumberValues = (values) =>
  (values || [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);

const emptyOptions = {
  channels: [],
  models: [],
  tokens: [],
};

const channelLabel = (channel) =>
  `#${channel.id} ${channel.name || '未命名渠道'}`;
const tokenLabel = (token) => {
  const owner =
    token.username || token.display_name || `user ${token.user_id || '-'}`;
  return `#${token.id} ${token.name || '未命名令牌'} · ${owner}`;
};
const withSelectedOptions = (options, selected, prefix = '#') => {
  const merged = [...options];
  const seen = new Set(options.map((option) => String(option.value)));
  (selected || []).forEach((value) => {
    const normalized = String(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    merged.push({ label: `${prefix}${normalized}`, value: normalized });
  });
  return merged;
};

const defaultSettings = {
  enabled: false,
  sample_rate: 1,
  max_entries: 200,
  overflow_strategy: 'replace_oldest',
  max_entry_bytes: mbToBytes(4),
  max_total_bytes: mbToBytes(64),
  rules: [],
};

const newRule = () => ({
  enabled: true,
  channel_ids: [],
  models: [],
  token_ids: [],
  token_names: [],
  token_keys: [],
});

const sanitizeSettings = (settings) => ({
  ...settings,
  sample_rate: clampRate(settings.sample_rate),
  max_entries: Math.max(1, Math.floor(Number(settings.max_entries || 1))),
  max_entry_bytes: Math.max(
    1,
    Math.floor(Number(settings.max_entry_bytes || 1)),
  ),
  max_total_bytes: Math.max(
    1,
    Math.floor(Number(settings.max_total_bytes || 1)),
  ),
  rules: (settings.rules || []).map((rule) => ({
    enabled: rule.enabled !== false,
    channel_ids: rule.channel_ids || [],
    models: rule.models || [],
    token_ids: rule.token_ids || [],
    token_names: [],
    token_keys: [],
    sample_rate:
      rule.sample_rate === undefined ||
      rule.sample_rate === null ||
      rule.sample_rate === ''
        ? undefined
        : clampRate(rule.sample_rate),
  })),
});

function Field({ label, children }) {
  return (
    <div className='mb-3'>
      <Text strong>{label}</Text>
      <div className='mt-2'>{children}</div>
    </div>
  );
}

function RequestLogSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [stats, setStats] = useState(null);
  const [options, setOptions] = useState(emptyOptions);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/request-logs/settings');
      if (res.data.success) {
        setSettings({
          ...defaultSettings,
          ...(res.data.data?.settings || {}),
          rules: res.data.data?.settings?.rules || [],
        });
        setStats(res.data.data?.stats || null);
      } else {
        showError(res.data.message || t('加载失败'));
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    try {
      const res = await API.get('/api/request-logs/options');
      if (res.data.success) {
        setOptions({
          ...emptyOptions,
          ...(res.data.data || {}),
        });
      }
    } catch (error) {
      showError(error);
    }
  };

  useEffect(() => {
    loadSettings();
    loadOptions();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await API.put(
        '/api/request-logs/settings',
        sanitizeSettings(settings),
      );
      if (res.data.success) {
        setSettings(res.data.data.settings);
        setStats(res.data.data.stats);
        showSuccess(t('保存成功'));
      } else {
        showError(res.data.message || t('保存失败'));
      }
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const patchRule = (index, patch) => {
    setSettings((prev) => ({
      ...prev,
      rules: prev.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    }));
  };

  const removeRule = (index) => {
    setSettings((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, ruleIndex) => ruleIndex !== index),
    }));
  };

  const channelOptions = (options.channels || []).map((channel) => ({
    label: channelLabel(channel),
    value: String(channel.id),
  }));
  const modelOptions = (options.models || []).map((model) => ({
    label: model,
    value: model,
  }));
  const tokenOptions = (options.tokens || []).map((token) => ({
    label: tokenLabel(token),
    value: String(token.id),
  }));

  return (
    <div className='mt-[60px] px-2'>
      <Spin spinning={loading}>
        <Card
          title={
            <div className='flex items-center justify-between gap-2 flex-wrap'>
              <span>{t('请求日志配置')}</span>
              <Space>
                <Link to='/console/request-logs'>
                  <Button>{t('查看请求日志')}</Button>
                </Link>
                <Button
                  theme='solid'
                  type='primary'
                  icon={<IconSave />}
                  loading={saving}
                  onClick={saveSettings}
                >
                  {t('保存')}
                </Button>
              </Space>
            </div>
          }
          bordered
        >
          {stats ? (
            <Row gutter={[12, 12]} className='mb-4'>
              <Col xs={12} md={6}>
                <Tag color='blue'>
                  {t('缓存条数')}: {stats.total}
                </Tag>
              </Col>
              <Col xs={12} md={6}>
                <Tag>
                  {t('缓存大小')}: {formatBytes(stats.total_bytes)}
                </Tag>
              </Col>
              <Col xs={12} md={6}>
                <Tag color='orange'>
                  {t('丢弃')}: {stats.dropped}
                </Tag>
              </Col>
              <Col xs={12} md={6}>
                <Tag color='red'>
                  {t('截断')}: {stats.truncated}
                </Tag>
              </Col>
            </Row>
          ) : null}

          <Row gutter={[16, 16]}>
            <Col xs={24} md={6}>
              <Field label={t('启用请求日志')}>
                <Switch
                  checked={settings.enabled}
                  onChange={(checked) =>
                    setSettings((prev) => ({ ...prev, enabled: checked }))
                  }
                />
              </Field>
            </Col>
            <Col xs={24} md={6}>
              <Field label={t('全局采样率 (%)')}>
                <Input
                  type='number'
                  min={0}
                  max={100}
                  step={1}
                  value={rateToPercent(settings.sample_rate)}
                  onChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      sample_rate: percentToRate(value),
                    }))
                  }
                />
              </Field>
            </Col>
            <Col xs={24} md={6}>
              <Field label={t('最大日志条数')}>
                <Input
                  type='number'
                  min={1}
                  value={settings.max_entries}
                  onChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      max_entries: Math.max(
                        1,
                        Number.parseInt(value || '1', 10),
                      ),
                    }))
                  }
                />
              </Field>
            </Col>
            <Col xs={24} md={6}>
              <Field label={t('溢出策略')}>
                <Select
                  value={settings.overflow_strategy}
                  onChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      overflow_strategy: value,
                    }))
                  }
                  style={{ width: '100%' }}
                >
                  <Select.Option value='replace_oldest'>
                    {t('替换最老')}
                  </Select.Option>
                  <Select.Option value='stop_sampling'>
                    {t('停止采样')}
                  </Select.Option>
                </Select>
              </Field>
            </Col>
            <Col xs={24} md={6}>
              <Field label={t('单条限制 MB')}>
                <Input
                  type='number'
                  min={1}
                  value={bytesToMb(settings.max_entry_bytes)}
                  onChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      max_entry_bytes: mbToBytes(value),
                    }))
                  }
                />
              </Field>
            </Col>
            <Col xs={24} md={6}>
              <Field label={t('总量限制 MB')}>
                <Input
                  type='number'
                  min={1}
                  value={bytesToMb(settings.max_total_bytes)}
                  onChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      max_total_bytes: mbToBytes(value),
                    }))
                  }
                />
              </Field>
            </Col>
          </Row>

          <Divider />

          <div className='flex items-center justify-between mb-3'>
            <Text strong>{t('采样规则')}</Text>
            <Button
              icon={<IconPlus />}
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  rules: [...prev.rules, newRule()],
                }))
              }
            >
              {t('新增规则')}
            </Button>
          </div>

          {(settings.rules || []).length === 0 ? (
            <div className='text-center text-gray-500 py-8'>
              {t('暂无采样规则')}
            </div>
          ) : (
            <Space vertical align='stretch' className='w-full'>
              {settings.rules.map((rule, index) => (
                <Card
                  key={index}
                  size='small'
                  title={
                    <div className='flex items-center justify-between'>
                      <Space>
                        <Tag color='blue'>
                          {t('规则')} {index + 1}
                        </Tag>
                        <Switch
                          checked={rule.enabled !== false}
                          onChange={(checked) =>
                            patchRule(index, { enabled: checked })
                          }
                        />
                      </Space>
                      <Button
                        type='danger'
                        theme='borderless'
                        icon={<IconDelete />}
                        onClick={() => removeRule(index)}
                      />
                    </div>
                  }
                >
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={12}>
                      <Field label={t('渠道')}>
                        <Select
                          multiple
                          filter={selectFilter}
                          showClear
                          autoClearSearchValue={false}
                          searchPosition='dropdown'
                          value={toStringValues(rule.channel_ids)}
                          optionList={withSelectedOptions(
                            channelOptions,
                            toStringValues(rule.channel_ids),
                          )}
                          placeholder={t('搜索并选择渠道')}
                          onChange={(values) =>
                            patchRule(index, {
                              channel_ids: toNumberValues(values),
                            })
                          }
                          style={{ width: '100%' }}
                        />
                      </Field>
                    </Col>
                    <Col xs={24} md={12}>
                      <Field label={t('模型')}>
                        <Select
                          multiple
                          filter={selectFilter}
                          allowCreate
                          showClear
                          autoClearSearchValue={false}
                          searchPosition='dropdown'
                          value={rule.models || []}
                          optionList={withSelectedOptions(
                            modelOptions,
                            rule.models || [],
                            '',
                          )}
                          placeholder={t('搜索或输入模型')}
                          onChange={(values) =>
                            patchRule(index, { models: values || [] })
                          }
                          style={{ width: '100%' }}
                        />
                      </Field>
                    </Col>
                    <Col xs={24} md={12}>
                      <Field label={t('令牌')}>
                        <Select
                          multiple
                          filter={selectFilter}
                          showClear
                          autoClearSearchValue={false}
                          searchPosition='dropdown'
                          value={toStringValues(rule.token_ids)}
                          optionList={withSelectedOptions(
                            tokenOptions,
                            toStringValues(rule.token_ids),
                          )}
                          placeholder={t('搜索并选择令牌')}
                          onChange={(values) =>
                            patchRule(index, {
                              token_ids: toNumberValues(values),
                              token_names: [],
                              token_keys: [],
                            })
                          }
                          style={{ width: '100%' }}
                        />
                      </Field>
                    </Col>
                    <Col xs={24} md={12}>
                      <Field label={t('规则采样率 (%)')}>
                        <Input
                          type='number'
                          min={0}
                          max={100}
                          step={1}
                          value={rateToPercent(rule.sample_rate)}
                          placeholder={t('留空使用全局采样率')}
                          onChange={(value) =>
                            patchRule(index, {
                              sample_rate:
                                value === '' ? undefined : percentToRate(value),
                            })
                          }
                        />
                      </Field>
                    </Col>
                  </Row>
                </Card>
              ))}
            </Space>
          )}
        </Card>
      </Spin>
    </div>
  );
}

export default RequestLogSettings;
