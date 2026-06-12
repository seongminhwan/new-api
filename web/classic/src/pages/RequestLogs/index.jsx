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
import {
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconDelete,
  IconRefresh,
  IconSearch,
  IconSetting,
} from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { API, copy, showError, showSuccess } from '../../helpers';

const { Text } = Typography;

const defaultFilters = {
  model: '',
  request_id: '',
  token_name: '',
  channel_id: '',
  token_id: '',
  status_code: '',
};

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDuration = (value) => {
  const ms = Number(value || 0);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
};

const formatTime = (value) => {
  if (!value) return '-';
  return new Date(Number(value) * 1000).toLocaleString();
};

const statusColor = (status) => {
  if (!status) return 'grey';
  if (status >= 500) return 'red';
  if (status >= 400) return 'orange';
  return 'green';
};

const compactParams = (params) => {
  const result = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) {
      result[key] = value;
    }
  });
  return result;
};

const headersToText = (headers) => {
  try {
    return JSON.stringify(headers || {}, null, 2);
  } catch (error) {
    return '{}';
  }
};

const copyText = async (text, message) => {
  await copy(text || '');
  showSuccess(message);
};

function BodyBlock({ title, message, t }) {
  const headers = headersToText(message?.headers);
  const body = message?.body || '';
  return (
    <div className='mb-5'>
      <div className='flex items-center justify-between mb-2 gap-2 flex-wrap'>
        <Space>
          <Text strong>{title}</Text>
          {message?.status ? (
            <Tag color={statusColor(message.status)}>{message.status}</Tag>
          ) : null}
          <Tag>{formatBytes(message?.body_size)}</Tag>
          {message?.body_truncated ? (
            <Tag color='orange'>{t('已截断')}</Tag>
          ) : null}
        </Space>
        <Space>
          <Button
            size='small'
            onClick={() => copyText(headers, t('响应头已复制'))}
          >
            {t('复制头')}
          </Button>
          <Button
            size='small'
            disabled={!body}
            onClick={() => copyText(body, t('Body 已复制'))}
          >
            {t('复制 Body')}
          </Button>
        </Space>
      </div>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <pre className='bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs overflow-auto max-h-72 whitespace-pre-wrap'>
            {headers}
          </pre>
        </Col>
        <Col xs={24} md={12}>
          <pre className='bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs overflow-auto max-h-72 whitespace-pre-wrap'>
            {body || t('空 Body')}
          </pre>
        </Col>
      </Row>
    </div>
  );
}

function DetailModal({ visible, entry, loading, onCancel, t }) {
  const overview = useMemo(() => {
    if (!entry) return [];
    return [
      { key: t('请求 ID'), value: entry.request_id || '-' },
      { key: t('上游请求 ID'), value: entry.upstream_request_id || '-' },
      {
        key: t('路径'),
        value: `${entry.method || ''} ${entry.path || ''}${entry.query ? `?${entry.query}` : ''}`,
      },
      { key: t('模型'), value: entry.model || '-' },
      { key: t('上游模型'), value: entry.upstream_model || '-' },
      { key: t('用户'), value: entry.username || entry.user_id || '-' },
      { key: t('分组'), value: entry.group || '-' },
      { key: t('令牌'), value: entry.token_name || entry.token_id || '-' },
      { key: t('渠道'), value: entry.channel_name || entry.channel_id || '-' },
      { key: t('耗时'), value: formatDuration(entry.duration_ms) },
      { key: t('状态码'), value: entry.status_code || '-' },
      {
        key: t('使用渠道'),
        value: (entry.used_channels || []).join(', ') || '-',
      },
      { key: t('错误'), value: entry.error || '-' },
    ];
  }, [entry, t]);

  return (
    <Modal
      title={t('请求日志详情')}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={1000}
      bodyStyle={{ maxHeight: '75vh', overflow: 'auto' }}
    >
      <Spin spinning={loading}>
        {entry ? (
          <Tabs type='line' defaultActiveKey='overview'>
            <Tabs.TabPane tab={t('概览')} itemKey='overview'>
              <Descriptions data={overview} />
            </Tabs.TabPane>
            <Tabs.TabPane tab={t('客户端请求')} itemKey='client_request'>
              <BodyBlock
                title={t('客户端请求')}
                message={entry.client_request}
                t={t}
              />
            </Tabs.TabPane>
            <Tabs.TabPane tab={t('上游请求')} itemKey='upstream'>
              {(entry.upstream_attempts || []).length === 0 ? (
                <div className='text-center text-gray-500 py-8'>
                  {t('未捕获上游请求')}
                </div>
              ) : (
                (entry.upstream_attempts || []).map((attempt) => (
                  <Card
                    key={attempt.index}
                    size='small'
                    className='mb-4'
                    title={
                      <Space>
                        <Tag color='blue'>
                          {t('尝试')} {attempt.index}
                        </Tag>
                        <Tag color={statusColor(attempt.response?.status)}>
                          {attempt.response?.status || attempt.error || '-'}
                        </Tag>
                        <Text type='tertiary'>
                          {attempt.channel_name || attempt.channel_id || '-'}
                        </Text>
                        <Text type='tertiary'>
                          {formatDuration(attempt.duration_ms)}
                        </Text>
                      </Space>
                    }
                  >
                    {attempt.error ? (
                      <pre className='bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap'>
                        {attempt.error}
                      </pre>
                    ) : null}
                    <BodyBlock
                      title={t('上游请求')}
                      message={attempt.request}
                      t={t}
                    />
                    <BodyBlock
                      title={t('上游响应')}
                      message={attempt.response}
                      t={t}
                    />
                  </Card>
                ))
              )}
            </Tabs.TabPane>
            <Tabs.TabPane tab={t('客户端响应')} itemKey='client_response'>
              <BodyBlock
                title={t('客户端响应')}
                message={entry.client_response}
                t={t}
              />
            </Tabs.TabPane>
            <Tabs.TabPane tab='JSON' itemKey='json'>
              <div className='text-right mb-2'>
                <Button
                  size='small'
                  onClick={() =>
                    copyText(JSON.stringify(entry, null, 2), t('JSON 已复制'))
                  }
                >
                  {t('复制 JSON')}
                </Button>
              </div>
              <pre className='bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap'>
                {JSON.stringify(entry, null, 2)}
              </pre>
            </Tabs.TabPane>
          </Tabs>
        ) : null}
      </Spin>
    </Modal>
  );
}

function RequestLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/request-logs/', {
        params: compactParams({
          p: page,
          page_size: pageSize,
          ...appliedFilters,
        }),
      });
      if (res.data.success) {
        setLogs(res.data.data?.items || []);
        setTotal(res.data.data?.total || 0);
      } else {
        showError(res.data.message || t('加载失败'));
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, pageSize, appliedFilters]);

  const openDetail = async (id) => {
    setDetailVisible(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await API.get(`/api/request-logs/${id}`);
      if (res.data.success) {
        setDetail(res.data.data);
      } else {
        showError(res.data.message || t('加载失败'));
      }
    } catch (error) {
      showError(error);
    } finally {
      setDetailLoading(false);
    }
  };

  const clearLogs = () => {
    Modal.confirm({
      title: t('清空请求日志'),
      content: t('确认清空所有请求日志吗？'),
      onOk: async () => {
        const res = await API.delete('/api/request-logs/');
        if (res.data.success) {
          showSuccess(t('清空成功'));
          setPage(1);
          loadLogs();
        } else {
          showError(res.data.message || t('清空失败'));
        }
      },
    });
  };

  const columns = [
    {
      title: t('时间'),
      dataIndex: 'created_at',
      width: 190,
      render: (value, record) => (
        <div>
          <div>{formatTime(value)}</div>
          <Text type='tertiary' size='small'>
            {record.request_id || record.upstream_request_id || record.id}
          </Text>
        </div>
      ),
    },
    {
      title: t('模型'),
      dataIndex: 'model',
      render: (value, record) => (
        <Space vertical align='start' spacing={2}>
          <Text>{value || '-'}</Text>
          <Tag size='small'>{record.stream ? t('流式') : t('非流式')}</Tag>
        </Space>
      ),
    },
    {
      title: t('渠道'),
      dataIndex: 'channel_name',
      render: (value, record) => value || record.channel_id || '-',
    },
    {
      title: t('令牌'),
      dataIndex: 'token_name',
      render: (value, record) => value || record.token_id || '-',
    },
    {
      title: t('状态码'),
      dataIndex: 'status_code',
      render: (value) => <Tag color={statusColor(value)}>{value || '-'}</Tag>,
    },
    {
      title: t('耗时'),
      dataIndex: 'duration_ms',
      render: (value) => formatDuration(value),
    },
    {
      title: t('大小'),
      dataIndex: 'approx_bytes',
      render: (value, record) => (
        <Space>
          <span>{formatBytes(value)}</span>
          {record.truncated ? <Tag color='orange'>{t('截断')}</Tag> : null}
        </Space>
      ),
    },
    {
      title: t('操作'),
      dataIndex: 'id',
      fixed: 'right',
      render: (id) => (
        <Button size='small' onClick={() => openDetail(id)}>
          {t('详情')}
        </Button>
      ),
    },
  ];

  const patchFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className='mt-[60px] px-2'>
      <Card
        title={
          <div className='flex items-center justify-between gap-2 flex-wrap'>
            <span>{t('请求日志')}</span>
            <Space>
              <Link to='/console/request-log-settings'>
                <Button icon={<IconSetting />}>{t('配置请求日志')}</Button>
              </Link>
              <Button icon={<IconRefresh />} onClick={loadLogs}>
                {t('刷新')}
              </Button>
              <Button type='danger' icon={<IconDelete />} onClick={clearLogs}>
                {t('清空')}
              </Button>
            </Space>
          </div>
        }
        bordered
      >
        <Row gutter={[12, 12]} className='mb-3'>
          <Col xs={24} md={4}>
            <Input
              placeholder={t('模型')}
              value={filters.model}
              onChange={(value) => patchFilter('model', value)}
            />
          </Col>
          <Col xs={24} md={5}>
            <Input
              placeholder={t('请求 ID')}
              value={filters.request_id}
              onChange={(value) => patchFilter('request_id', value)}
            />
          </Col>
          <Col xs={24} md={4}>
            <Input
              placeholder={t('令牌名称')}
              value={filters.token_name}
              onChange={(value) => patchFilter('token_name', value)}
            />
          </Col>
          <Col xs={24} md={3}>
            <Input
              placeholder={t('渠道 ID')}
              value={filters.channel_id}
              onChange={(value) => patchFilter('channel_id', value)}
            />
          </Col>
          <Col xs={24} md={3}>
            <Input
              placeholder={t('令牌 ID')}
              value={filters.token_id}
              onChange={(value) => patchFilter('token_id', value)}
            />
          </Col>
          <Col xs={24} md={3}>
            <Input
              placeholder={t('状态码')}
              value={filters.status_code}
              onChange={(value) => patchFilter('status_code', value)}
            />
          </Col>
          <Col xs={24} md={2}>
            <Button
              block
              theme='solid'
              type='primary'
              icon={<IconSearch />}
              onClick={() => {
                setPage(1);
                setAppliedFilters(filters);
              }}
            >
              {t('筛选')}
            </Button>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={logs}
          rowKey='id'
          loading={loading}
          size='small'
          scroll={{ x: 'max-content' }}
          pagination={{
            currentPage: page,
            pageSize,
            total,
            pageSizeOptions: [10, 20, 50, 100],
            showSizeChanger: true,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
        />
      </Card>

      <DetailModal
        visible={detailVisible}
        entry={detail}
        loading={detailLoading}
        onCancel={() => setDetailVisible(false)}
        t={t}
      />
    </div>
  );
}

export default RequestLogs;
