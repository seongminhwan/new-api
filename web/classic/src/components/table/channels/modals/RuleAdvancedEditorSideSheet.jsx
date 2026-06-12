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

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Divider,
  Input,
  Select,
  SideSheet,
  Space,
  Switch,
  Tag,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import { IconCode, IconDelete, IconPlus, IconSave } from '@douyinfe/semi-icons';

const { Text, Title } = Typography;

const FIELD_CATALOG = [
  { protocol: 'Common', scope: 'request_body', path: 'model', label: '请求模型', example: 'gpt-4.1' },
  { protocol: 'Common', scope: 'request_body', path: 'stream', label: '流式开关', example: 'false' },
  { protocol: 'Common', scope: 'request_body', path: 'messages.0.role', label: '首条消息角色', example: 'user' },
  { protocol: 'Common', scope: 'request_body', path: 'messages.0.content', label: '首条消息内容' },
  { protocol: 'Common', scope: 'request_body', path: 'temperature', label: '温度', example: '0.7' },
  { protocol: 'Common', scope: 'request_body', path: 'top_p', label: 'Top P', example: '1' },
  { protocol: 'Common', scope: 'request_body', path: 'max_tokens', label: '最大 token', example: '4096' },
  { protocol: 'Common', scope: 'request_body', path: 'response_format.type', label: '响应格式', example: 'json_object' },
  { protocol: 'Common', scope: 'request_header', path: 'Authorization', label: '鉴权请求头', example: 'Bearer ...' },
  { protocol: 'Common', scope: 'request_header', path: 'User-Agent', label: 'User-Agent' },
  { protocol: 'Common', scope: 'request_query', path: 'stream', label: '查询参数 stream', example: 'true' },
  { protocol: 'Common', scope: 'context', path: 'original_model', label: '原始模型' },
  { protocol: 'Common', scope: 'context', path: 'upstream_model', label: '上游模型' },
  { protocol: 'Common', scope: 'context', path: 'retry_count', label: '重试次数', example: '1' },
  { protocol: 'Common', scope: 'response_header', path: 'Content-Type', label: '响应类型', example: 'application/json' },
  { protocol: 'Common', scope: 'response_header', path: 'Retry-After', label: '重试等待', example: '30' },
  { protocol: 'Common', scope: 'stream', path: 'stream.event', label: 'SSE event 名称', example: 'content_block_delta' },
  { protocol: 'Common', scope: 'stream', path: 'stream.format', label: '流式协议', example: 'claude' },
  { protocol: 'Common', scope: 'stream', path: 'stream.chunk_index', label: 'chunk 序号', example: '0' },
  { protocol: 'OpenAI Chat', scope: 'request_body', path: 'stream_options.include_usage', label: '流式 usage 开关', example: 'true' },
  { protocol: 'OpenAI Chat', scope: 'response_body', path: 'choices.0.delta.content', label: '增量内容' },
  { protocol: 'OpenAI Chat', scope: 'response_body', path: 'choices.0.finish_reason', label: '结束原因', example: 'stop' },
  { protocol: 'OpenAI Chat', scope: 'response_body', path: 'usage.total_tokens', label: '总 token', example: '233' },
  { protocol: 'OpenAI Responses', scope: 'request_body', path: 'input', label: 'Responses 输入' },
  { protocol: 'OpenAI Responses', scope: 'request_body', path: 'instructions', label: '指令' },
  { protocol: 'OpenAI Responses', scope: 'request_body', path: 'reasoning.effort', label: '推理强度', example: 'high' },
  { protocol: 'OpenAI Responses', scope: 'response_body', path: 'output.0.content.0.text', label: '输出文本' },
  { protocol: 'Claude', scope: 'request_body', path: 'system', label: '系统提示词' },
  { protocol: 'Claude', scope: 'request_body', path: 'thinking.type', label: 'Thinking 模式', example: 'enabled' },
  { protocol: 'Claude', scope: 'response_body', path: 'delta.type', label: 'Claude delta 类型', example: 'thinking_delta' },
  { protocol: 'Claude', scope: 'response_body', path: 'delta.text', label: 'Claude 文本增量' },
  { protocol: 'Claude', scope: 'response_body', path: 'delta.thinking', label: 'Claude thinking 增量' },
  { protocol: 'Claude', scope: 'stream', path: 'content_block_delta', label: '内容块增量 event' },
  { protocol: 'Claude', scope: 'stream', path: 'message_delta', label: '消息增量 event' },
  { protocol: 'Gemini', scope: 'request_body', path: 'contents.0.parts.0.text', label: '首个文本 part' },
  { protocol: 'Gemini', scope: 'request_body', path: 'generationConfig.temperature', label: '生成温度' },
  { protocol: 'Gemini', scope: 'request_body', path: 'generationConfig.maxOutputTokens', label: '最大输出 token' },
  { protocol: 'Gemini', scope: 'response_body', path: 'candidates.0.content.parts.0.text', label: '候选文本' },
  { protocol: 'Gemini', scope: 'response_body', path: 'candidates.0.finishReason', label: '结束原因' },
  { protocol: 'Gemini', scope: 'response_body', path: 'usageMetadata.totalTokenCount', label: '总 token' },
];

const KIND_META = {
  request_match: ['请求匹配高级编辑器', '配置渠道请求匹配条件，支持协议字段候选和自定义路径'],
  error_override: ['错误复写高级编辑器', '配置多条错误复写规则，按顺序匹配并返回第一条命中结果'],
  param_override: ['参数覆盖高级编辑器', '配置请求参数和请求头覆盖 operations'],
  response_override: ['响应参数覆盖高级编辑器', '配置响应 JSON 覆盖规则，流式响应按每个 chunk 或 event 独立执行'],
  response_header_override: ['响应头覆盖高级编辑器', '配置响应头键值覆盖，或切换为带条件的 operations'],
};

const REQUEST_SOURCES = [
  { value: 'header', label: '请求头' },
  { value: 'query', label: '查询参数' },
  { value: 'body', label: 'JSON 请求体' },
  { value: 'path', label: '请求路径' },
  { value: 'method', label: 'HTTP 方法' },
];

const REQUEST_OPS = [
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

const CONDITION_MODES = [
  { value: 'full', label: '完全匹配' },
  { value: 'prefix', label: '前缀匹配' },
  { value: 'suffix', label: '后缀匹配' },
  { value: 'contains', label: '包含' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'expr', label: 'Expr 条件' },
  { value: 'js', label: 'JS 条件' },
];

const BASE_OPERATION_MODES = [
  { value: 'set', label: '设置字段' },
  { value: 'set_expr', label: '表达式设置字段' },
  { value: 'set_js', label: 'JS 设置字段' },
  { value: 'transform_expr', label: '表达式转换字段' },
  { value: 'transform_js', label: 'JS 转换字段' },
  { value: 'delete', label: '删除字段' },
  { value: 'append', label: '追加到末尾' },
  { value: 'prepend', label: '追加到开头' },
  { value: 'copy', label: '复制字段' },
  { value: 'move', label: '移动字段' },
  { value: 'replace', label: '字符串替换' },
  { value: 'regex_replace', label: '正则替换' },
  { value: 'trim_prefix', label: '裁剪前缀' },
  { value: 'trim_suffix', label: '裁剪后缀' },
  { value: 'ensure_prefix', label: '确保前缀' },
  { value: 'ensure_suffix', label: '确保后缀' },
  { value: 'trim_space', label: '去掉空白' },
  { value: 'to_lower', label: '转小写' },
  { value: 'to_upper', label: '转大写' },
  { value: 'return_error', label: '返回自定义错误' },
  { value: 'prune_objects', label: '清理对象项' },
  { value: 'sync_fields', label: '字段同步' },
];

const RESPONSE_OPERATION_MODES = [
  { value: 'set_body', label: '设置响应体' },
  { value: 'set_body_expr', label: '表达式设置响应体' },
  { value: 'set_body_js', label: 'JS 设置响应体' },
  { value: 'set_status', label: '设置 HTTP 状态码' },
  { value: 'set_status_expr', label: '表达式设置 HTTP 状态码' },
  { value: 'set_status_js', label: 'JS 设置 HTTP 状态码' },
];

const HEADER_OPERATION_MODES = [
  { value: 'set_header', label: '设置响应头' },
  { value: 'set_header_expr', label: '表达式设置响应头' },
  { value: 'set_header_js', label: 'JS 设置响应头' },
  { value: 'delete_header', label: '删除响应头' },
  { value: 'copy_header', label: '复制响应头' },
  { value: 'move_header', label: '移动响应头' },
];

const PARAM_HEADER_OPERATION_MODES = [
  { value: 'pass_headers', label: '请求头透传' },
  { value: 'set_header', label: '设置请求头' },
  { value: 'set_header_expr', label: '表达式设置请求头' },
  { value: 'set_header_js', label: 'JS 设置请求头' },
  { value: 'delete_header', label: '删除请求头' },
  { value: 'copy_header', label: '复制请求头' },
  { value: 'move_header', label: '移动请求头' },
];

const STREAM_OPERATION_MODES = [
  { value: 'drop_chunk', label: '丢弃命中 chunk' },
  { value: 'drop_event', label: '丢弃命中 event' },
];

const ERROR_SOURCES = [
  { value: 'status', label: '当前状态码' },
  { value: 'original_status', label: '原始状态码' },
  { value: 'upstream_status', label: '上游状态码' },
  { value: 'error_message', label: '错误消息' },
  { value: 'error_code', label: '错误 code' },
  { value: 'error_type', label: '错误 type' },
  { value: 'channel_id', label: '渠道 ID' },
  { value: 'channel_name', label: '渠道名称' },
  { value: 'channel_type', label: '渠道类型' },
  { value: 'req_header', label: '请求头' },
  { value: 'req_query', label: '查询参数' },
  { value: 'req_body', label: '请求 JSON' },
  { value: 'resp_header', label: '响应头' },
];

const VALUELESS_OPS = new Set(['exists', 'missing']);
const LIST_OPS = new Set(['in', 'not_in']);
const NUMBER_OPS = new Set(['gt', 'gte', 'lt', 'lte']);
const SCRIPT_OPS = new Set(['expr', 'js']);
const SCRIPT_CONDITION_MODES = new Set(['expr', 'js']);
const VALUE_MODES = new Set(['set', 'set_expr', 'set_js', 'transform_expr', 'transform_js', 'set_body', 'set_body_expr', 'set_body_js', 'set_status', 'set_status_expr', 'set_status_js', 'append', 'prepend', 'trim_prefix', 'trim_suffix', 'ensure_prefix', 'ensure_suffix', 'return_error', 'prune_objects', 'pass_headers', 'set_header', 'set_header_expr', 'set_header_js']);
const FROM_MODES = new Set(['copy', 'move', 'replace', 'regex_replace', 'copy_header', 'move_header', 'sync_fields']);
const TO_MODES = new Set(['copy', 'move', 'replace', 'regex_replace', 'copy_header', 'move_header', 'sync_fields']);
const NO_PATH_MODES = new Set(['set_body', 'set_body_expr', 'set_body_js', 'set_status', 'set_status_expr', 'set_status_js']);
const KEEP_ORIGIN_MODES = new Set(['set', 'set_expr', 'set_js', 'append', 'prepend', 'pass_headers', 'set_header', 'set_header_expr', 'set_header_js', 'copy_header', 'move_header']);

let idSeed = 0;
const nextId = (prefix) => `${prefix}_${Date.now()}_${idSeed++}`;
const pretty = (value) => JSON.stringify(value, null, 2);

function parseLooseValue(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function valueToText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseScalar(text, numberHint = false) {
  const raw = String(text ?? '').trim();
  if (numberHint) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw.startsWith('{') || raw.startsWith('[') || /^-?\d/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function fieldOptions(scopes) {
  return FIELD_CATALOG.filter((item) => scopes.includes(item.scope)).map((item) => ({
    value: item.path,
    label: `${item.protocol} · ${item.label} · ${item.path}${item.example ? ` = ${item.example}` : ''}`,
  }));
}

function FieldPathSelect({ value, onChange, scopes, placeholder }) {
  return (
    <Select
      filter
      allowCreate
      value={value || undefined}
      placeholder={placeholder}
      optionList={fieldOptions(scopes)}
      onChange={(next) => onChange(String(next || ''))}
      style={{ width: '100%' }}
      position='bottomLeft'
    />
  );
}

function FieldCatalogPanel() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FIELD_CATALOG;
    return FIELD_CATALOG.filter((item) =>
      `${item.protocol} ${item.scope} ${item.path} ${item.label} ${item.example || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  return (
    <div
      className='rounded-xl p-3'
      style={{
        border: '1px solid var(--semi-color-border)',
        backgroundColor: 'var(--semi-color-fill-0)',
      }}
    >
      <Text strong>{t('字段候选')}</Text>
      <Text type='tertiary' size='small' className='block mt-1'>
        {t('可搜索协议字段；不存在时直接在路径下拉框输入自定义路径')}
      </Text>
      <Input
        className='mt-2'
        value={query}
        placeholder={t('搜索协议字段')}
        onChange={setQuery}
      />
      <div className='mt-3 space-y-2 overflow-auto' style={{ maxHeight: 'calc(100vh - 260px)' }}>
        {filtered.map((item) => (
          <div
            key={`${item.protocol}-${item.scope}-${item.path}`}
            className='rounded-lg p-2'
            style={{
              border: '1px solid var(--semi-color-fill-2)',
              backgroundColor: 'var(--semi-color-bg-0)',
            }}
          >
            <Space wrap>
              <Tag>{item.protocol}</Tag>
              <Tag color='grey'>{item.scope.replace('_', ' ')}</Tag>
            </Space>
            <div className='font-mono text-xs break-all mt-2'>{item.path}</div>
            <Text type='tertiary' size='small'>
              {item.label}
              {item.example ? ` · ${item.example}` : ''}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}

function listFromValue(value) {
  if (Array.isArray(value)) return value.map(valueToText);
  const text = valueToText(value);
  if (!text) return [''];
  return text.split(',').map((item) => item.trim()).filter(Boolean);
}

function requestScopes(source) {
  if (source === 'header') return ['request_header'];
  if (source === 'query') return ['request_query'];
  if (source === 'body') return ['request_body'];
  return [];
}

function normalizeRequestCondition(condition = {}) {
  const op = REQUEST_OPS.some((item) => item.value === condition.op) ? condition.op : 'eq';
  return {
    id: nextId('rm'),
    source: REQUEST_SOURCES.some((item) => item.value === condition.source) ? condition.source : 'body',
    key: String(condition.path || condition.key || ''),
    op,
    valueText: SCRIPT_OPS.has(op)
      ? String(condition.script || condition.expr || condition.value || '')
      : LIST_OPS.has(op)
        ? ''
        : valueToText(condition.value),
    valueList: listFromValue(condition.value),
  };
}

function buildRequestConfig(logic, conditions) {
  return {
    logic,
    conditions: conditions.map((condition) => {
      if (condition.op === 'expr') {
        return { op: 'expr', expr: condition.valueText.trim() };
      }
      if (condition.op === 'js') {
        return { op: 'js', script: condition.valueText.trim() };
      }
      const item = { source: condition.source, op: condition.op };
      if (condition.source === 'body') item.path = condition.key.trim();
      if (condition.source === 'header' || condition.source === 'query') item.key = condition.key.trim();
      if (!VALUELESS_OPS.has(condition.op)) {
        item.value = LIST_OPS.has(condition.op)
          ? condition.valueList.map((value) => value.trim()).filter(Boolean).map((value) => parseScalar(value))
          : parseScalar(condition.valueText, NUMBER_OPS.has(condition.op));
      }
      return item;
    }),
  };
}

function RequestMatchRulesEditor({ value, onSerializedChange }) {
  const { t } = useTranslation();
  const [logic, setLogic] = useState('AND');
  const [conditions, setConditions] = useState([
    normalizeRequestCondition({ source: 'body', path: 'stream', op: 'eq', value: true }),
  ]);

  useEffect(() => {
    if (!value || !value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      setLogic(parsed.logic === 'OR' ? 'OR' : 'AND');
      setConditions(Array.isArray(parsed.conditions) && parsed.conditions.length ? parsed.conditions.map(normalizeRequestCondition) : conditions);
    } catch {
      // keep template
    }
  }, [value]);

  useEffect(() => {
    onSerializedChange(pretty(buildRequestConfig(logic, conditions)));
  }, [logic, conditions, onSerializedChange]);

  const patch = (id, patchValue) => {
    setConditions((items) => items.map((item) => (item.id === id ? { ...item, ...patchValue } : item)));
  };

  return (
    <div className='space-y-3'>
      <Space>
        <Select
          value={logic}
          optionList={[{ label: 'AND', value: 'AND' }, { label: 'OR', value: 'OR' }]}
          onChange={(next) => setLogic(next === 'OR' ? 'OR' : 'AND')}
          style={{ width: 110 }}
        />
        <Text type='tertiary' size='small'>{t('组合所有请求匹配条件')}</Text>
      </Space>
      {conditions.map((condition) => {
        const isScriptCondition = SCRIPT_OPS.has(condition.op);
        const showKey = !isScriptCondition && ['header', 'query', 'body'].includes(condition.source);
        const showValue = !VALUELESS_OPS.has(condition.op);
        const showList = LIST_OPS.has(condition.op);
        const list = condition.valueList.length ? condition.valueList : [''];
        return (
          <div key={condition.id} className='rounded-xl p-3 space-y-2' style={{ border: '1px solid var(--semi-color-fill-2)' }}>
            <div className='grid grid-cols-1 md:grid-cols-[130px_1fr_130px_auto] gap-2'>
              {isScriptCondition ? (
                <div className='h-8 flex items-center rounded px-3 text-xs text-gray-500' style={{ backgroundColor: 'var(--semi-color-fill-0)' }}>
                  {t('脚本条件')}
                </div>
              ) : (
                <Select
                  value={condition.source}
                  optionList={REQUEST_SOURCES.map((item) => ({ ...item, label: t(item.label) }))}
                  onChange={(next) => {
                    const source = String(next || 'body');
                    patch(condition.id, { source, key: requestScopes(source).length ? condition.key : '' });
                  }}
                />
              )}
              {showKey ? (
                <FieldPathSelect
                  value={condition.key}
                  onChange={(next) => patch(condition.id, { key: next })}
                  scopes={requestScopes(condition.source)}
                  placeholder={t('选择或输入字段路径')}
                />
              ) : (
                <div className='h-8 flex items-center rounded px-3 text-xs text-gray-500' style={{ backgroundColor: 'var(--semi-color-fill-0)' }}>
                  {isScriptCondition ? t('可使用 get("req.body.model") 或上下文变量') : condition.source === 'path' ? t('请求路径') : t('HTTP 方法')}
                </div>
              )}
              <Select
                value={condition.op}
                optionList={REQUEST_OPS.map((item) => ({ ...item, label: t(item.label) }))}
                onChange={(next) => patch(condition.id, { op: String(next || 'eq') })}
              />
              <Button
                icon={<IconDelete />}
                theme='borderless'
                disabled={conditions.length <= 1}
                onClick={() => setConditions((items) => items.filter((item) => item.id !== condition.id))}
              />
            </div>
            {showValue && (
              isScriptCondition ? (
                <TextArea
                  autosize
                  value={condition.valueText}
                  placeholder={condition.op === 'js' ? `return get('req.body.stream') === false;` : `get('req.body.stream') == false`}
                  onChange={(next) => patch(condition.id, { valueText: next })}
                />
              ) : showList ? (
                <div className='space-y-2'>
                  {list.map((item, index) => (
                    <Input
                      key={index}
                      value={item}
                      placeholder={t('值')}
                      onChange={(next) => {
                        const nextList = [...list];
                        nextList[index] = next;
                        patch(condition.id, { valueList: nextList });
                      }}
                    />
                  ))}
                  <Button size='small' icon={<IconPlus />} onClick={() => patch(condition.id, { valueList: [...list, ''] })}>
                    {t('新增值')}
                  </Button>
                </div>
              ) : (
                <Input value={condition.valueText} placeholder={t('值')} onChange={(next) => patch(condition.id, { valueText: next })} />
              )
            )}
          </div>
        );
      })}
      <Button
        size='small'
        icon={<IconPlus />}
        onClick={() => setConditions((items) => [...items, normalizeRequestCondition({ source: 'body', path: 'model', op: 'contains', value: 'gpt' })])}
      >
        {t('新增条件')}
      </Button>
    </div>
  );
}

function operationOptions(kind) {
  if (kind === 'param_override') return [...BASE_OPERATION_MODES, ...PARAM_HEADER_OPERATION_MODES];
  if (kind === 'response_header_override') return HEADER_OPERATION_MODES;
  return [...BASE_OPERATION_MODES, ...RESPONSE_OPERATION_MODES, ...HEADER_OPERATION_MODES, ...STREAM_OPERATION_MODES];
}

function operationScopes(kind) {
  if (kind === 'param_override') return ['request_body', 'request_header', 'request_query', 'context'];
  if (kind === 'response_header_override') return ['response_header', 'stream', 'context'];
  return ['response_body', 'response_header', 'stream', 'context'];
}

function normalizeOperationCondition(condition = {}) {
  const mode = CONDITION_MODES.some((item) => item.value === condition.mode) ? condition.mode : 'full';
  return {
    id: nextId('oc'),
    path: String(condition.path || ''),
    mode,
    valueText: SCRIPT_CONDITION_MODES.has(mode) ? String(condition.script || condition.expr || condition.value || '') : valueToText(condition.value),
    invert: condition.invert === true,
    passMissingKey: condition.pass_missing_key === true,
  };
}

function normalizeOperation(operation = {}, kind) {
  const options = operationOptions(kind);
  const mode = options.some((item) => item.value === operation.mode) ? operation.mode : options[0].value;
  return {
    id: nextId('op'),
    description: String(operation.description || ''),
    mode,
    path: String(operation.path || ''),
    from: String(operation.from || ''),
    to: String(operation.to || ''),
    valueText: mode.endsWith('_js')
      ? String(operation.script || operation.expr || operation.value || '')
      : mode.endsWith('_expr')
        ? String(operation.expr || operation.value || '')
        : valueToText(operation.value),
    keepOrigin: operation.keep_origin === true,
    logic: String(operation.logic || 'OR').toUpperCase() === 'AND' ? 'AND' : 'OR',
    conditions: Array.isArray(operation.conditions) ? operation.conditions.map(normalizeOperationCondition) : [],
  };
}

function defaultOperation(kind) {
  if (kind === 'response_override') {
    return normalizeOperation({
      mode: 'drop_event',
      description: '丢弃 Claude thinking event',
      conditions: [
        { path: 'stream.event', mode: 'full', value: 'content_block_delta' },
        { path: 'delta.type', mode: 'full', value: 'thinking_delta' },
      ],
      logic: 'AND',
    }, kind);
  }
  if (kind === 'response_header_override') {
    return normalizeOperation({
      mode: 'set_header',
      path: 'Content-Type',
      value: 'application/json',
      conditions: [{ path: 'response.status', mode: 'full', value: 200 }],
      logic: 'AND',
    }, kind);
  }
  return normalizeOperation({
    mode: 'set',
    path: 'temperature',
    value: 0.7,
    conditions: [{ path: 'model', mode: 'prefix', value: 'gpt' }],
    logic: 'AND',
  }, kind);
}

function buildOperationConfig(operations) {
  return {
    operations: operations.map((operation) => {
      const item = { mode: operation.mode };
      if (operation.description.trim()) item.description = operation.description.trim();
      if (operation.path.trim()) item.path = operation.path.trim();
      if (operation.from.trim()) item.from = operation.from.trim();
      if (operation.to.trim()) item.to = operation.to.trim();
      if (operation.valueText.trim()) {
        if (operation.mode.endsWith('_js')) item.script = operation.valueText.trim();
        else if (operation.mode.endsWith('_expr')) item.expr = operation.valueText.trim();
        else item.value = parseLooseValue(operation.valueText);
      }
      if (operation.keepOrigin) item.keep_origin = true;
      if (operation.conditions.length) {
        item.logic = operation.logic;
        item.conditions = operation.conditions.map((condition) => {
          const next = { mode: condition.mode };
          if (!SCRIPT_CONDITION_MODES.has(condition.mode)) next.path = condition.path.trim();
          if (condition.valueText.trim()) {
            if (condition.mode === 'js') next.script = condition.valueText.trim();
            else if (condition.mode === 'expr') next.expr = condition.valueText.trim();
            else next.value = parseLooseValue(condition.valueText);
          }
          if (condition.invert) next.invert = true;
          if (condition.passMissingKey) next.pass_missing_key = true;
          return next;
        });
      }
      return item;
    }),
  };
}

function OperationsRulesEditor({ kind, value, onSerializedChange }) {
  const { t } = useTranslation();
  const [operations, setOperations] = useState([defaultOperation(kind)]);
  const options = operationOptions(kind);
  const scopes = operationScopes(kind);

  useEffect(() => {
    if (!value || !value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed.operations) && parsed.operations.length) {
        setOperations(parsed.operations.map((item) => normalizeOperation(item, kind)));
      }
    } catch {
      // keep template
    }
  }, [value, kind]);

  useEffect(() => {
    onSerializedChange(pretty(buildOperationConfig(operations)));
  }, [operations, onSerializedChange]);

  const patchOperation = (id, patch) => {
    setOperations((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };
  const patchCondition = (operationId, conditionId, patch) => {
    setOperations((items) => items.map((operation) => {
      if (operation.id !== operationId) return operation;
      return {
        ...operation,
        conditions: operation.conditions.map((condition) => condition.id === conditionId ? { ...condition, ...patch } : condition),
      };
    }));
  };

  return (
    <div className='space-y-3'>
      {operations.map((operation, index) => {
        const showPath = !['copy', 'move', 'copy_header', 'move_header', 'sync_fields'].includes(operation.mode) && !operation.mode.startsWith('drop_') && !NO_PATH_MODES.has(operation.mode);
        const showValue = VALUE_MODES.has(operation.mode);
        const isScriptOperation = operation.mode.endsWith('_expr') || operation.mode.endsWith('_js');
        const showFrom = FROM_MODES.has(operation.mode);
        const showTo = TO_MODES.has(operation.mode);
        const showKeepOrigin = KEEP_ORIGIN_MODES.has(operation.mode);
        return (
          <div key={operation.id} className='rounded-xl p-3 space-y-3' style={{ border: '1px solid var(--semi-color-fill-2)' }}>
            <div className='flex items-center justify-between gap-2'>
              <Space>
                <Tag color='blue'>{t('规则')} {index + 1}</Tag>
                <Tag>{options.find((item) => item.value === operation.mode)?.label || operation.mode}</Tag>
              </Space>
              <Button
                icon={<IconDelete />}
                theme='borderless'
                disabled={operations.length <= 1}
                onClick={() => setOperations((items) => items.filter((item) => item.id !== operation.id))}
              />
            </div>
            <Input value={operation.description} placeholder={t('规则说明')} onChange={(next) => patchOperation(operation.id, { description: next })} />
            <div className='grid grid-cols-1 md:grid-cols-[170px_1fr] gap-2'>
              <Select
                value={operation.mode}
                optionList={options.map((item) => ({ ...item, label: t(item.label) }))}
                onChange={(next) => patchOperation(operation.id, { mode: String(next || 'set') })}
              />
              {showPath ? (
                <FieldPathSelect
                  value={operation.path}
                  onChange={(next) => patchOperation(operation.id, { path: next })}
                  scopes={scopes}
                  placeholder={operation.mode.includes('header') ? t('选择或输入响应头名称') : t('选择或输入字段路径')}
                />
              ) : (
                <div className='h-8 flex items-center rounded px-3 text-xs text-gray-500' style={{ backgroundColor: 'var(--semi-color-fill-0)' }}>
                  {operation.mode.startsWith('drop_') ? t('命中的 chunk 或 event 会被丢弃') : t('来源和目标在下方配置')}
                </div>
              )}
            </div>
            {(showFrom || showTo) && (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
                {showFrom && (
                  <FieldPathSelect value={operation.from} onChange={(next) => patchOperation(operation.id, { from: next })} scopes={scopes} placeholder={t('来源字段或匹配文本')} />
                )}
                {showTo && (
                  <FieldPathSelect value={operation.to} onChange={(next) => patchOperation(operation.id, { to: next })} scopes={scopes} placeholder={t('目标字段或替换文本')} />
                )}
              </div>
            )}
            {showValue && (
              <TextArea
                autosize
                value={operation.valueText}
                placeholder={isScriptOperation ? (operation.mode.endsWith('_js') ? 'return current;' : 'current') : t('值，支持 JSON 或普通文本')}
                onChange={(next) => patchOperation(operation.id, { valueText: next })}
              />
            )}
            {showKeepOrigin && (
              <Space>
                <Switch checked={operation.keepOrigin} onChange={(checked) => patchOperation(operation.id, { keepOrigin: checked })} />
                <Text size='small'>{t('合并时保留原值')}</Text>
              </Space>
            )}
            <Divider margin='8px' />
            <Space wrap>
              <Select
                value={operation.logic}
                optionList={[{ label: 'AND', value: 'AND' }, { label: 'OR', value: 'OR' }]}
                onChange={(next) => patchOperation(operation.id, { logic: next === 'AND' ? 'AND' : 'OR' })}
                style={{ width: 100 }}
              />
              <Text type='tertiary' size='small'>{t('操作条件')}</Text>
              <Button
                size='small'
                icon={<IconPlus />}
                onClick={() => patchOperation(operation.id, {
                  conditions: [...operation.conditions, normalizeOperationCondition({ path: kind === 'response_override' ? 'stream.event' : 'model', mode: 'full', value: kind === 'response_override' ? 'content_block_delta' : 'gpt' })],
                })}
              >
                {t('新增条件')}
              </Button>
            </Space>
            {operation.conditions.map((condition) => {
              const isScriptCondition = SCRIPT_CONDITION_MODES.has(condition.mode);
              return (
              <div key={condition.id} className='grid grid-cols-1 md:grid-cols-[1fr_120px_1fr_auto] gap-2'>
                {isScriptCondition ? (
                  <div className='h-8 flex items-center rounded px-3 text-xs text-gray-500' style={{ backgroundColor: 'var(--semi-color-fill-0)' }}>
                    {t('脚本条件')}
                  </div>
                ) : (
                  <FieldPathSelect value={condition.path} onChange={(next) => patchCondition(operation.id, condition.id, { path: next })} scopes={scopes} placeholder={t('条件字段')} />
                )}
                <Select value={condition.mode} optionList={CONDITION_MODES.map((item) => ({ ...item, label: t(item.label) }))} onChange={(next) => patchCondition(operation.id, condition.id, { mode: String(next || 'full') })} />
                {isScriptCondition ? (
                  <TextArea
                    autosize
                    value={condition.valueText}
                    placeholder={condition.mode === 'js' ? `return get('stream.event') === 'ping';` : `get('stream.event') == 'ping'`}
                    onChange={(next) => patchCondition(operation.id, condition.id, { valueText: next })}
                  />
                ) : (
                  <Input value={condition.valueText} placeholder={t('值')} onChange={(next) => patchCondition(operation.id, condition.id, { valueText: next })} />
                )}
                <Button icon={<IconDelete />} theme='borderless' onClick={() => patchOperation(operation.id, { conditions: operation.conditions.filter((item) => item.id !== condition.id) })} />
                <div className='md:col-span-4'>
                  <Space wrap>
                    <Switch checked={condition.invert} onChange={(checked) => patchCondition(operation.id, condition.id, { invert: checked })} />
                    <Text size='small'>{t('反转条件')}</Text>
                    <Switch checked={condition.passMissingKey} onChange={(checked) => patchCondition(operation.id, condition.id, { passMissingKey: checked })} />
                    <Text size='small'>{t('字段缺失时通过')}</Text>
                  </Space>
                </div>
              </div>
            )})}
          </div>
        );
      })}
      <Button size='small' icon={<IconPlus />} onClick={() => setOperations((items) => [...items, defaultOperation(kind)])}>
        {t('新增规则')}
      </Button>
    </div>
  );
}

function errorNeedsKey(source) {
  return ['req_header', 'req_query', 'req_body', 'resp_header'].includes(source);
}

function errorScopes(source) {
  if (source === 'req_header') return ['request_header'];
  if (source === 'req_query') return ['request_query'];
  if (source === 'req_body') return ['request_body'];
  if (source === 'resp_header') return ['response_header'];
  return ['context'];
}

function normalizeErrorCondition(condition = {}) {
  const op = REQUEST_OPS.some((item) => item.value === (condition.op || condition.mode)) ? condition.op || condition.mode : 'eq';
  return {
    id: nextId('ec'),
    source: ERROR_SOURCES.some((item) => item.value === condition.source) ? condition.source : 'status',
    key: String(condition.path || condition.key || ''),
    op,
    valueText: SCRIPT_OPS.has(op)
      ? String(condition.script || condition.expr || condition.value || '')
      : LIST_OPS.has(op)
        ? ''
        : valueToText(condition.value),
    valueList: listFromValue(condition.value),
  };
}

function normalizeErrorRule(rule = {}) {
  return {
    id: nextId('er'),
    logic: String(rule.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND',
    message: String(rule.message || ''),
    statusCode: valueToText(rule.status_code ?? rule.status),
    headersText: valueToText(rule.headers ?? rule.response_headers ?? { 'Content-Type': 'application/json' }),
    conditions: Array.isArray(rule.conditions) ? rule.conditions.map(normalizeErrorCondition) : [],
  };
}

function defaultErrorRule() {
  return normalizeErrorRule({
    logic: 'AND',
    conditions: [
      { source: 'upstream_status', op: 'eq', value: 429 },
      { source: 'req_body', path: 'stream', op: 'eq', value: false },
    ],
    message: '{req.body.model} Resource exhausted',
    status_code: 429,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildErrorConfig(rules) {
  return {
    rules: rules.map((rule) => {
      const item = {
        logic: rule.logic,
        conditions: rule.conditions.map((condition) => {
          if (condition.op === 'expr') return { op: 'expr', expr: condition.valueText.trim() };
          if (condition.op === 'js') return { op: 'js', script: condition.valueText.trim() };
          const next = { source: condition.source, op: condition.op };
          if (condition.source === 'req_body') next.path = condition.key.trim();
          else if (errorNeedsKey(condition.source)) next.key = condition.key.trim();
          if (!VALUELESS_OPS.has(condition.op)) {
            next.value = LIST_OPS.has(condition.op)
              ? condition.valueList.map((value) => value.trim()).filter(Boolean).map((value) => parseScalar(value))
              : parseScalar(condition.valueText, NUMBER_OPS.has(condition.op));
          }
          return next;
        }),
      };
      if (rule.message.trim()) item.message = rule.message;
      const code = Number(rule.statusCode);
      if (Number.isInteger(code) && code >= 100 && code <= 599) item.status_code = code;
      if (rule.headersText.trim()) {
        const headers = parseLooseValue(rule.headersText);
        if (headers && typeof headers === 'object' && !Array.isArray(headers)) item.headers = headers;
      }
      return item;
    }),
  };
}

function ErrorOverrideRulesEditor({ value, onSerializedChange }) {
  const { t } = useTranslation();
  const [rules, setRules] = useState([defaultErrorRule()]);

  useEffect(() => {
    if (!value || !value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) setRules(parsed.length ? parsed.map(normalizeErrorRule) : [defaultErrorRule()]);
      else if (Array.isArray(parsed.rules)) setRules(parsed.rules.length ? parsed.rules.map(normalizeErrorRule) : [defaultErrorRule()]);
      else setRules([normalizeErrorRule(parsed)]);
    } catch {
      // keep template
    }
  }, [value]);

  useEffect(() => {
    onSerializedChange(pretty(buildErrorConfig(rules)));
  }, [rules, onSerializedChange]);

  const patchRule = (id, patch) => {
    setRules((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };
  const patchCondition = (ruleId, conditionId, patch) => {
    setRules((items) => items.map((rule) => {
      if (rule.id !== ruleId) return rule;
      return {
        ...rule,
        conditions: rule.conditions.map((condition) => condition.id === conditionId ? { ...condition, ...patch } : condition),
      };
    }));
  };

  return (
    <div className='space-y-3'>
      {rules.map((rule, index) => (
        <div key={rule.id} className='rounded-xl p-3 space-y-3' style={{ border: '1px solid var(--semi-color-fill-2)' }}>
          <div className='flex items-center justify-between gap-2'>
            <Tag color='blue'>{t('规则')} {index + 1}</Tag>
            <Button icon={<IconDelete />} theme='borderless' disabled={rules.length <= 1} onClick={() => setRules((items) => items.filter((item) => item.id !== rule.id))} />
          </div>
          <TextArea autosize value={rule.message} placeholder={t('错误消息模板，例如 {req.body.model} Resource exhausted')} onChange={(next) => patchRule(rule.id, { message: next })} />
          <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
            <Input value={rule.statusCode} placeholder={t('复写状态码')} onChange={(next) => patchRule(rule.id, { statusCode: next })} />
            <TextArea autosize value={rule.headersText} placeholder={t('响应头 JSON')} onChange={(next) => patchRule(rule.id, { headersText: next })} />
          </div>
          <Space wrap>
            <Select value={rule.logic} optionList={[{ label: 'AND', value: 'AND' }, { label: 'OR', value: 'OR' }]} onChange={(next) => patchRule(rule.id, { logic: next === 'OR' ? 'OR' : 'AND' })} style={{ width: 100 }} />
            <Text type='tertiary' size='small'>{t('规则条件')}</Text>
            <Button size='small' icon={<IconPlus />} onClick={() => patchRule(rule.id, { conditions: [...rule.conditions, normalizeErrorCondition({ source: 'status', op: 'eq', value: 429 })] })}>
              {t('新增条件')}
            </Button>
          </Space>
          {rule.conditions.map((condition) => {
            const isScriptCondition = SCRIPT_OPS.has(condition.op);
            const showKey = !isScriptCondition && errorNeedsKey(condition.source);
            const showValue = !VALUELESS_OPS.has(condition.op);
            const showList = LIST_OPS.has(condition.op);
            const list = condition.valueList.length ? condition.valueList : [''];
            return (
              <div key={condition.id} className='space-y-2'>
                <div className='grid grid-cols-1 md:grid-cols-[150px_1fr_130px_auto] gap-2'>
                  {isScriptCondition ? (
                    <div className='h-8 flex items-center rounded px-3 text-xs text-gray-500' style={{ backgroundColor: 'var(--semi-color-fill-0)' }}>
                      {t('脚本条件')}
                    </div>
                  ) : (
                    <Select
                      value={condition.source}
                      optionList={ERROR_SOURCES.map((item) => ({ ...item, label: t(item.label) }))}
                      onChange={(next) => {
                        const source = String(next || 'status');
                        patchCondition(rule.id, condition.id, { source, key: errorNeedsKey(source) ? condition.key : '' });
                      }}
                    />
                  )}
                  {showKey ? (
                    <FieldPathSelect value={condition.key} onChange={(next) => patchCondition(rule.id, condition.id, { key: next })} scopes={errorScopes(condition.source)} placeholder={t('选择或输入字段路径')} />
                  ) : (
                    <div className='h-8 flex items-center rounded px-3 text-xs text-gray-500' style={{ backgroundColor: 'var(--semi-color-fill-0)' }}>{isScriptCondition ? t('可使用 response.status_code 或 get("req.body.stream")') : t('内置值')}</div>
                  )}
                  <Select value={condition.op} optionList={REQUEST_OPS.map((item) => ({ ...item, label: t(item.label) }))} onChange={(next) => patchCondition(rule.id, condition.id, { op: String(next || 'eq') })} />
                  <Button icon={<IconDelete />} theme='borderless' onClick={() => patchRule(rule.id, { conditions: rule.conditions.filter((item) => item.id !== condition.id) })} />
                </div>
                {showValue && (isScriptCondition ? (
                  <TextArea
                    autosize
                    value={condition.valueText}
                    placeholder={condition.op === 'js' ? `return response.status_code === 429 && get('req.body.stream') === false;` : `response.status_code == 429 && get('req.body.stream') == false`}
                    onChange={(next) => patchCondition(rule.id, condition.id, { valueText: next })}
                  />
                ) : showList ? (
                  <div className='space-y-2'>
                    {list.map((item, itemIndex) => (
                      <Input
                        key={itemIndex}
                        value={item}
                        placeholder={t('值')}
                        onChange={(next) => {
                          const nextList = [...list];
                          nextList[itemIndex] = next;
                          patchCondition(rule.id, condition.id, { valueList: nextList });
                        }}
                      />
                    ))}
                    <Button size='small' icon={<IconPlus />} onClick={() => patchCondition(rule.id, condition.id, { valueList: [...list, ''] })}>{t('新增值')}</Button>
                  </div>
                ) : (
                  <Input value={condition.valueText} placeholder={t('值')} onChange={(next) => patchCondition(rule.id, condition.id, { valueText: next })} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
      <Button size='small' icon={<IconPlus />} onClick={() => setRules((items) => [...items, defaultErrorRule()])}>
        {t('新增规则')}
      </Button>
    </div>
  );
}

function ResponseHeaderRulesEditor({ value, onSerializedChange }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('simple');
  const [entries, setEntries] = useState([{ id: nextId('hdr'), name: 'Content-Type', valueText: 'application/json' }]);
  const [operationsValue, setOperationsValue] = useState(value || '');
  const [operationsInitialValue, setOperationsInitialValue] = useState(value || '');

  useEffect(() => {
    if (!value || !value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed.operations)) {
        setMode('operations');
        setOperationsValue(value);
        setOperationsInitialValue(value);
      } else {
        setMode('simple');
        setEntries(Object.entries(parsed).map(([name, val]) => ({ id: nextId('hdr'), name, valueText: valueToText(val) })));
      }
    } catch {
      // keep template
    }
  }, [value]);

  useEffect(() => {
    if (mode === 'operations') {
      onSerializedChange(operationsValue);
      return;
    }
    const payload = {};
    entries.forEach((entry) => {
      const name = entry.name.trim();
      if (name) payload[name] = parseLooseValue(entry.valueText);
    });
    onSerializedChange(pretty(payload));
  }, [mode, entries, operationsValue, onSerializedChange]);

  const patchEntry = (id, patch) => {
    setEntries((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  return (
    <div className='space-y-3'>
      <Space wrap>
        <Select
          value={mode}
          optionList={[
            { label: t('普通响应头键值'), value: 'simple' },
            { label: t('条件 operations'), value: 'operations' },
          ]}
          onChange={(next) => {
            const nextMode = next === 'operations' ? 'operations' : 'simple';
            if (nextMode === 'operations' && !operationsInitialValue.trim()) {
              setOperationsInitialValue(pretty(buildOperationConfig([defaultOperation('response_header_override')])));
            }
            setMode(nextMode);
          }}
          style={{ width: 180 }}
        />
        <Text type='tertiary' size='small'>
          {mode === 'simple' ? t('直接覆盖响应头') : t('需要条件判断时使用 operations')}
        </Text>
      </Space>
      {mode === 'simple' ? (
        <div className='space-y-2'>
          {entries.map((entry) => (
            <div key={entry.id} className='grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2'>
              <FieldPathSelect value={entry.name} onChange={(next) => patchEntry(entry.id, { name: next })} scopes={['response_header']} placeholder={t('选择或输入响应头名称')} />
              <Input value={entry.valueText} placeholder={t('响应头值，输入 null 表示删除')} onChange={(next) => patchEntry(entry.id, { valueText: next })} />
              <Button icon={<IconDelete />} theme='borderless' disabled={entries.length <= 1} onClick={() => setEntries((items) => items.filter((item) => item.id !== entry.id))} />
            </div>
          ))}
          <Button size='small' icon={<IconPlus />} onClick={() => setEntries((items) => [...items, { id: nextId('hdr'), name: '', valueText: '' }])}>
            {t('新增响应头')}
          </Button>
        </div>
      ) : (
        <OperationsRulesEditor kind='response_header_override' value={operationsInitialValue} onSerializedChange={setOperationsValue} />
      )}
    </div>
  );
}

function EditorBody({ kind, value, onSerializedChange }) {
  if (kind === 'request_match') return <RequestMatchRulesEditor value={value || ''} onSerializedChange={onSerializedChange} />;
  if (kind === 'error_override') return <ErrorOverrideRulesEditor value={value || ''} onSerializedChange={onSerializedChange} />;
  if (kind === 'response_header_override') return <ResponseHeaderRulesEditor value={value || ''} onSerializedChange={onSerializedChange} />;
  return <OperationsRulesEditor kind={kind} value={value || ''} onSerializedChange={onSerializedChange} />;
}

function RuleAdvancedEditorSideSheet({ visible, kind, value, onCancel, onSave }) {
  const { t } = useTranslation();
  const [serialized, setSerialized] = useState(value || '');
  const [title, description] = KIND_META[kind] || KIND_META.param_override;

  useEffect(() => {
    if (visible) setSerialized(value || '');
  }, [visible, value, kind]);

  return (
    <SideSheet
      title={
        <div>
          <Title heading={5} className='!mb-1'>{t(title)}</Title>
          <Text type='tertiary' size='small'>{t(description)}</Text>
        </div>
      }
      visible={visible}
      onCancel={onCancel}
      placement='right'
      width='min(980px, calc(100vw - 720px))'
      style={{ minWidth: 620, maxWidth: '100vw' }}
      footer={
        <div className='flex justify-between w-full'>
          <Button theme='borderless' onClick={() => onSave('')}>
            {t('清空')}
          </Button>
          <Space>
            <Button onClick={onCancel}>{t('取消')}</Button>
            <Button type='primary' icon={<IconSave />} onClick={() => onSave(serialized)}>
              {t('保存')}
            </Button>
          </Space>
        </div>
      }
    >
      <div className='grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4'>
        <div className='space-y-4'>
          <EditorBody kind={kind} value={value || ''} onSerializedChange={setSerialized} />
          <div>
            <Space>
              <IconCode />
              <Text type='tertiary' size='small'>{t('生成的 JSON')}</Text>
            </Space>
            <pre
              className='mt-2 rounded-xl p-3 text-xs whitespace-pre-wrap break-all overflow-auto'
              style={{
                maxHeight: 260,
                border: '1px solid var(--semi-color-fill-2)',
                backgroundColor: 'var(--semi-color-fill-0)',
              }}
            >
              {serialized || '{}'}
            </pre>
          </div>
        </div>
        <FieldCatalogPanel />
      </div>
    </SideSheet>
  );
}

export default RuleAdvancedEditorSideSheet;
