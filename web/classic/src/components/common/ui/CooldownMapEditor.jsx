import React, { useState, useRef } from 'react';
import { Button, Input, InputNumber, Space } from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';

function mapToEntries(map) {
  if (!map || Object.keys(map).length === 0) return [];
  return Object.entries(map).map(([model, seconds]) => ({ model, seconds }));
}

function entriesToMap(entries) {
  const result = {};
  for (const entry of entries) {
    const key = (entry.model || '').trim();
    if (key) {
      result[key] = entry.seconds;
    }
  }
  return result;
}

export default function CooldownMapEditor({ value, onChange, keyPlaceholder, valuePlaceholder }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState(() => mapToEntries(value));
  const prevValueRef = useRef(value);

  // Sync from parent when value changes externally
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    const incoming = mapToEntries(value);
    if (!entries.some((e) => !(e.model || '').trim())) {
      setEntries(incoming);
    }
  }

  const updateEntry = (index, field, val) => {
    const next = [...entries];
    if (field === 'model') {
      next[index] = { ...next[index], model: val };
    } else {
      next[index] = { ...next[index], seconds: Number(val) || 0 };
    }
    setEntries(next);
    onChange(entriesToMap(next));
  };

  const removeEntry = (index) => {
    const next = entries.filter((_, i) => i !== index);
    setEntries(next);
    onChange(entriesToMap(next));
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, { model: '', seconds: 60 }]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map((entry, index) => (
        <Space key={index} align='center'>
          <Input
            style={{ width: 200 }}
            placeholder={keyPlaceholder || t('模型名称')}
            value={entry.model}
            onChange={(val) => updateEntry(index, 'model', val)}
          />
          <InputNumber
            style={{ width: 100 }}
            min={0}
            step={1}
            placeholder={valuePlaceholder || t('秒')}
            value={entry.seconds}
            onChange={(val) => updateEntry(index, 'seconds', val)}
          />
          <Button
            type='danger'
            theme='borderless'
            icon={<IconDelete />}
            onClick={() => removeEntry(index)}
          />
        </Space>
      ))}
      <Button
        icon={<IconPlus />}
        theme='light'
        size='small'
        onClick={addEntry}
        style={{ width: 'fit-content' }}
      >
        {t('添加覆盖')}
      </Button>
    </div>
  );
}
