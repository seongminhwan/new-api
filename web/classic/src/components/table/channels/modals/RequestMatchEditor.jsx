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

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Collapse,
  Input,
  Select,
  Space,
  Switch,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import { IconDelete, IconPlus } from '@douyinfe/semi-icons';

const { Text } = Typography;

const SOURCE_OPTIONS = [
  { value: 'header', label: '请求头' },
  { value: 'query', label: '查询参数' },
  { value: 'body', label: 'JSON 请求体' },
  { value: 'path', label: '请求路径' },
  { value: 'method', label: 'HTTP 方法' },
];

const OP_OPTIONS = [
  { value: 'exists', label: '存在' },
  { value: 'missing', label: '不存在' },
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'in', label: '在列表中' },
  { value: 'not_in', label: '不在列表中' },
  { value: 'contains', label: '包含' },
  { value: 'prefix', label: '前缀匹配' },
  { value: 'suffix', label: '后缀匹配' },
  { value: 'regex', label: '正则匹配' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'expr', label: 'Expr 条件' },
  { value: 'js', label: 'JS 条件' },
];

const VALUELESS_OPS = new Set(['exists', 'missing']);
const LIST_OPS = new Set(['in', 'not_in']);
const NUMBER_OPS = new Set(['gt', 'gte', 'lt', 'lte']);
const SCRIPT_OPS = new Set(['expr', 'js']);

const DEFAULT_CONDITION = {
  source: 'body',
  key: 'stream',
  op: 'eq',
  valueText: 'true',
  valueList: ['true'],
};

const DEFAULT_CONFIG = {
  logic: 'AND',
  conditions: [
    {
      source: 'body',
      path: 'stream',
      op: 'eq',
      value: true,
    },
  ],
};

function normalizeSource(source) {
  if (
    source === 'header' ||
    source === 'query' ||
    source === 'body' ||
    source === 'path' ||
    source === 'method'
  ) {
    return source;
  }
  return 'body';
}

function normalizeOp(op) {
  if (OP_OPTIONS.some((item) => item.value === op)) return op;
  return 'eq';
}

function stringifyValue(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value))
    return value.map((item) => stringifyValue(item)).join(', ');
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function valueToList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item));
  }
  const text = stringifyValue(value);
  if (!text) return [''];
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toVisualCondition(condition) {
  const op = normalizeOp(condition?.op);
  const value = condition?.value;
  const scriptText =
    op === 'js'
      ? condition?.script || condition?.expr || stringifyValue(value)
      : condition?.expr || condition?.script || stringifyValue(value);
  return {
    source: normalizeSource(condition?.source),
    key: String(condition?.path || condition?.key || ''),
    op,
    valueText: SCRIPT_OPS.has(op)
      ? scriptText
      : LIST_OPS.has(op)
        ? ''
        : stringifyValue(value),
    valueList: valueToList(value),
  };
}

function parseScalarValue(text) {
  const raw = String(text ?? '').trim();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw.startsWith('[') || raw.startsWith('{') || /^-?\d/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function parseValueText(condition) {
  const text = condition.valueText.trim();
  if (NUMBER_OPS.has(condition.op)) {
    const numberValue = Number(text);
    return Number.isFinite(numberValue) ? numberValue : text;
  }
  return parseScalarValue(text);
}

function parseValueList(condition) {
  return (condition.valueList || [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .map(parseScalarValue);
}

function toRequestCondition(condition) {
  if (condition.op === 'expr') {
    return {
      op: 'expr',
      expr: condition.valueText.trim(),
    };
  }
  if (condition.op === 'js') {
    return {
      op: 'js',
      script: condition.valueText.trim(),
    };
  }
  const next = {
    source: condition.source,
    op: condition.op,
  };
  if (condition.source === 'body') {
    next.path = condition.key.trim();
  } else if (condition.source === 'header' || condition.source === 'query') {
    next.key = condition.key.trim();
  }
  if (!VALUELESS_OPS.has(condition.op)) {
    next.value = LIST_OPS.has(condition.op)
      ? parseValueList(condition)
      : parseValueText(condition);
  }
  return next;
}

function stringifyConfig(config) {
  return JSON.stringify(config, null, 2);
}

function parseConfig(raw) {
  if (!raw.trim()) {
    return { config: { logic: 'AND', conditions: [] }, invalid: false };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      config: {
        logic: parsed.logic === 'OR' ? 'OR' : 'AND',
        conditions: Array.isArray(parsed.conditions)
          ? parsed.conditions.map((item) =>
              toRequestCondition(toVisualCondition(item)),
            )
          : [],
      },
      invalid: false,
    };
  } catch {
    return { config: { logic: 'AND', conditions: [] }, invalid: true };
  }
}

function buildConfig(logic, conditions) {
  return {
    logic,
    conditions: conditions.map(toRequestCondition),
  };
}

function needsLookupKey(source) {
  return source === 'header' || source === 'query' || source === 'body';
}

function getKeyPlaceholder(source) {
  if (source === 'header') return 'X-Client';
  if (source === 'query') return 'tier';
  if (source === 'body') return 'reasoning.effort';
  return '';
}

function ensureListValues(condition) {
  if (condition.valueList && condition.valueList.length > 0) {
    return condition.valueList;
  }
  const text = condition.valueText.trim();
  return text ? valueToList(text) : [''];
}

function RequestMatchEditor({ value, onChange, disabled = false }) {
  const { t } = useTranslation();
  const enabled = Boolean((value || '').trim());
  const parsed = useMemo(() => parseConfig(value || ''), [value]);
  const logic = parsed.config.logic === 'OR' ? 'OR' : 'AND';
  const conditions = useMemo(
    () => (parsed.config.conditions || []).map(toVisualCondition),
    [parsed.config.conditions],
  );

  const updateFromConditions = (nextLogic, nextConditions) => {
    onChange(stringifyConfig(buildConfig(nextLogic, nextConditions)));
  };

  const toggleEnabled = (checked) => {
    if (!checked) {
      onChange('');
      return;
    }
    onChange(stringifyConfig(DEFAULT_CONFIG));
  };

  const updateCondition = (index, patch) => {
    const nextConditions = conditions.slice();
    nextConditions[index] = {
      ...conditions[index],
      ...patch,
    };
    updateFromConditions(logic, nextConditions);
  };

  return (
    <div className='space-y-3'>
      <div
        className='flex items-center justify-between gap-3 rounded-xl p-3'
        style={{
          border: '1px solid var(--semi-color-fill-2)',
          backgroundColor: 'var(--semi-color-fill-0)',
        }}
      >
        <div>
          <Text className='font-medium'>{t('启用请求匹配')}</Text>
          <div className='text-xs text-gray-500 mt-1'>
            {t('仅路由满足这些渠道约束的请求')}
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          onChange={toggleEnabled}
        />
      </div>

      {enabled && parsed.invalid && (
        <div className='space-y-2'>
          <Text type='danger' size='small'>
            {t('请求匹配 JSON 格式错误')}
          </Text>
          <TextArea
            value={value}
            disabled={disabled}
            autosize={{ minRows: 6 }}
            onChange={onChange}
          />
          <Button
            size='small'
            disabled={disabled}
            onClick={() => onChange(stringifyConfig(DEFAULT_CONFIG))}
          >
            {t('重置模板')}
          </Button>
        </div>
      )}

      {enabled && !parsed.invalid && (
        <div className='space-y-3'>
          <Space wrap>
            <Select
              value={logic}
              disabled={disabled}
              optionList={[
                { label: 'AND', value: 'AND' },
                { label: 'OR', value: 'OR' },
              ]}
              style={{ width: 120 }}
              onChange={(next) =>
                updateFromConditions(next === 'OR' ? 'OR' : 'AND', conditions)
              }
            />
            <Text type='tertiary' size='small'>
              {t('组合所有请求匹配条件')}
            </Text>
          </Space>

          <div className='space-y-2'>
            {conditions.map((condition, index) => {
              const isScriptCondition = SCRIPT_OPS.has(condition.op);
              const showKey =
                !isScriptCondition && needsLookupKey(condition.source);
              const showValue = !VALUELESS_OPS.has(condition.op);
              const showListValues = LIST_OPS.has(condition.op);
              return (
                <div
                  key={index}
                  className='rounded-xl p-3'
                  style={{ border: '1px solid var(--semi-color-fill-2)' }}
                >
                  <div className='grid grid-cols-1 md:grid-cols-[120px_1fr_130px_1fr_auto] gap-2 items-start'>
                    {isScriptCondition ? (
                      <div
                        className='h-8 flex items-center rounded px-3 text-xs text-gray-500'
                        style={{ backgroundColor: 'var(--semi-color-fill-0)' }}
                      >
                        {t('脚本条件')}
                      </div>
                    ) : (
                      <Select
                        value={condition.source}
                        disabled={disabled}
                        optionList={SOURCE_OPTIONS.map((option) => ({
                          ...option,
                          label: t(option.label),
                        }))}
                        onChange={(source) => {
                          const normalizedSource = normalizeSource(source);
                          updateCondition(index, {
                            source: normalizedSource,
                            key: needsLookupKey(normalizedSource)
                              ? condition.key
                              : '',
                          });
                        }}
                      />
                    )}

                    {showKey ? (
                      <Input
                        value={condition.key}
                        disabled={disabled}
                        placeholder={getKeyPlaceholder(condition.source)}
                        onChange={(next) =>
                          updateCondition(index, { key: next })
                        }
                      />
                    ) : (
                      <div
                        className='h-8 flex items-center rounded px-3 text-xs text-gray-500'
                        style={{ backgroundColor: 'var(--semi-color-fill-0)' }}
                      >
                        {isScriptCondition
                          ? t('可使用 get("req.body.model") 或上下文变量')
                          : condition.source === 'path'
                          ? t('请求路径')
                          : t('HTTP 方法')}
                      </div>
                    )}

                    <Select
                      value={condition.op}
                      disabled={disabled}
                      optionList={OP_OPTIONS.map((option) => ({
                        ...option,
                        label: t(option.label),
                      }))}
                      onChange={(op) => {
                        const nextOp = normalizeOp(op);
                        updateCondition(index, {
                          op: nextOp,
                          valueList: LIST_OPS.has(nextOp)
                            ? ensureListValues(condition)
                            : condition.valueList,
                          valueText:
                            LIST_OPS.has(condition.op) && !LIST_OPS.has(nextOp)
                              ? ensureListValues(condition)[0] || ''
                              : condition.valueText,
                        });
                      }}
                    />

                    {showValue ? (
                      isScriptCondition ? (
                        <TextArea
                          autosize
                          value={condition.valueText}
                          disabled={disabled}
                          placeholder={
                            condition.op === 'js'
                              ? `return get('req.body.stream') === false;`
                              : `get('req.body.stream') == false`
                          }
                          onChange={(next) =>
                            updateCondition(index, { valueText: next })
                          }
                        />
                      ) : showListValues ? (
                        <div className='space-y-2'>
                          {ensureListValues(condition).map(
                            (item, itemIndex) => (
                              <div
                                key={`${index}-${itemIndex}`}
                                className='flex gap-2'
                              >
                                <Input
                                  value={item}
                                  disabled={disabled}
                                  placeholder={t('列表值')}
                                  onChange={(next) => {
                                    const nextList =
                                      ensureListValues(condition).slice();
                                    nextList[itemIndex] = next;
                                    updateCondition(index, {
                                      valueList: nextList,
                                    });
                                  }}
                                />
                                <Button
                                  type='tertiary'
                                  icon={<IconDelete />}
                                  disabled={
                                    disabled ||
                                    ensureListValues(condition).length <= 1
                                  }
                                  onClick={() => {
                                    const nextList = ensureListValues(
                                      condition,
                                    ).filter((_, i) => i !== itemIndex);
                                    updateCondition(index, {
                                      valueList: nextList.length
                                        ? nextList
                                        : [''],
                                    });
                                  }}
                                />
                              </div>
                            ),
                          )}
                          <Button
                            size='small'
                            type='tertiary'
                            icon={<IconPlus />}
                            disabled={disabled}
                            onClick={() =>
                              updateCondition(index, {
                                valueList: [...ensureListValues(condition), ''],
                              })
                            }
                          >
                            {t('新增值')}
                          </Button>
                        </div>
                      ) : (
                        <Input
                          value={condition.valueText}
                          disabled={disabled}
                          type={
                            NUMBER_OPS.has(condition.op) ? 'number' : 'text'
                          }
                          placeholder={t('值')}
                          onChange={(next) =>
                            updateCondition(index, { valueText: next })
                          }
                        />
                      )
                    ) : (
                      <div
                        className='h-8 flex items-center rounded px-3 text-xs text-gray-500'
                        style={{ backgroundColor: 'var(--semi-color-fill-0)' }}
                      >
                        {t('无需填写值')}
                      </div>
                    )}

                    <Button
                      type='tertiary'
                      icon={<IconDelete />}
                      disabled={disabled}
                      onClick={() =>
                        updateFromConditions(
                          logic,
                          conditions.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            size='small'
            type='primary'
            icon={<IconPlus />}
            disabled={disabled}
            onClick={() =>
              updateFromConditions(logic, [...conditions, DEFAULT_CONDITION])
            }
          >
            {t('新增条件')}
          </Button>

          <Collapse>
            <Collapse.Panel header={t('高级 JSON')} itemKey='json'>
              <TextArea
                value={value}
                disabled={disabled}
                autosize={{ minRows: 8 }}
                onChange={onChange}
              />
            </Collapse.Panel>
          </Collapse>
        </div>
      )}
    </div>
  );
}

export default RequestMatchEditor;
