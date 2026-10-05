import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Flex,
  Input,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from '@/shared/antd-imports';
import { PlusOutlined, SettingOutlined } from '@/shared/antd-imports';
import WorklenzPageHeader from '@/components/common/WorklenzPageHeader';
import { websitesApiService } from '@/api/websites/websites.api.service';
import { DEFAULT_PAGE_SIZE } from '@/shared/constants';
import { IWebsiteFilters, IWebsiteListItem, IWebsiteSummary } from '@/types/websites/website.types';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';

const emptySummary: IWebsiteSummary = {
  total: 0,
  expiring_30: 0,
  expired: 0,
  expiring_10: 0,
  both_us: 0,
  hosting_us: 0,
  domain_us: 0,
  client_managed: 0,
};

function daysColor(days: number | null): 'error' | 'warning' | 'gold' | 'success' | undefined {
  if (days == null) return undefined;
  if (days < 7) return 'error';
  if (days < 30) return 'warning';
  if (days < 60) return 'gold';
  return 'success';
}

function apiError(error: unknown, fallback: string): string {
  const messageText = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return messageText || fallback;
}

const RenewalsPage = () => {
  const { t } = useTranslation('renewals');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useDocumentTitle(t('title', { defaultValue: 'Renewals' }));

  const [rows, setRows] = useState<IWebsiteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<IWebsiteSummary>(emptySummary);
  const [filters, setFilters] = useState<IWebsiteFilters>({ clients: [], projects: [], providers: [], dns_managers: [] });
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');

  const query = useMemo(() => ({
    index: Number(searchParams.get('page') || 1),
    size: DEFAULT_PAGE_SIZE,
    field: searchParams.get('field') || 'nearest_expiry',
    order: (searchParams.get('order') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
    search: searchParams.get('search') || '',
    management: searchParams.get('management') || 'all',
    expiry: searchParams.get('expiry') || 'any',
    client_id: searchParams.get('client_id') || '',
    provider: searchParams.get('provider') || '',
    dns_manager: searchParams.get('dns_manager') || '',
    status: searchParams.get('status') || '',
    include_archived: searchParams.get('include_archived') === 'true',
  }), [searchParams]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all' || value === 'any') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cards, lookups] = await Promise.all([
        websitesApiService.list(query),
        websitesApiService.summary(),
        websitesApiService.filters(),
      ]);
      if (list.done && list.body) {
        setRows(list.body.data || []);
        setTotal(list.body.total || 0);
      }
      if (cards.done && cards.body) setSummary(cards.body);
      if (lookups.done && lookups.body) setFilters(lookups.body);
    } catch (error) {
      message.error(apiError(error, t('loadFailed', { defaultValue: 'Could not load websites' })));
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((searchParams.get('search') || '') !== searchInput) setParam('search', searchInput);
    }, 300);
    return () => window.clearTimeout(handle);
    // setParam closes over the latest search params on each keystroke via searchInput only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const managedLabel = (value: string) =>
    value === 'us' ? t('managedUs', { defaultValue: 'Us' }) : t('managedClient', { defaultValue: 'Client' });

  const archive = async (id: string) => {
    try {
      const res = await websitesApiService.archive(id);
      if (res.done) {
        message.success(t('archived', { defaultValue: 'Website archived' }));
        void load();
      }
    } catch (error) {
      message.error(apiError(error, t('archiveFailed', { defaultValue: 'Could not archive website' })));
    }
  };

  return (
    <Flex vertical gap={16} style={{ padding: 24 }}>
      <WorklenzPageHeader
        title={t('title', { defaultValue: 'Renewals' })}
        extra={
          <Space>
            <Button icon={<SettingOutlined />} onClick={() => navigate('/renewals/settings')}>
              {t('settings', { defaultValue: 'Settings' })}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/renewals/new')}>
              {t('addWebsite', { defaultValue: 'Add website' })}
            </Button>
          </Space>
        }
      />

      <Flex gap={12} wrap="wrap">
        {[
          { key: 'total', label: t('total', { defaultValue: 'Total websites' }), value: summary.total },
          { key: 'expiring30', label: t('expiring30', { defaultValue: 'Expiring in 30 days' }), value: summary.expiring_30 },
          { key: 'expired', label: t('expired', { defaultValue: 'Expired' }), value: summary.expired },
          { key: 'expiring10', label: t('expiring10', { defaultValue: 'Expiring in 10 days' }), value: summary.expiring_10 },
        ].map(card => (
          <Card key={card.key} style={{ flex: '1 1 180px' }}>
            <Statistic title={card.label} value={card.value} />
          </Card>
        ))}
      </Flex>

      <Flex gap={8} wrap="wrap">
          <Input.Search
            allowClear
            style={{ width: 280 }}
            placeholder={t('searchPlaceholder', { defaultValue: 'Search name, domain, or client' })}
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
          />
          <Select
            allowClear
            style={{ minWidth: 220 }}
            placeholder={t('managedByFilter', { defaultValue: 'Domain and hosting' })}
            value={query.management === 'all' ? undefined : query.management}
            onChange={value => setParam('management', value || '')}
            options={[
              { value: 'both_us', label: t('bothUs', { defaultValue: 'Domain and hosting with us' }) },
              { value: 'hosting_us', label: t('hostingUs', { defaultValue: 'Hosting only with us' }) },
              { value: 'domain_us', label: t('domainUs', { defaultValue: 'Domain only with us' }) },
              { value: 'client', label: t('clientManaged', { defaultValue: 'Client managed' }) },
            ]}
          />
          <Select
            allowClear
            style={{ minWidth: 200 }}
            placeholder={t('anyExpiry', { defaultValue: 'Any expiry' })}
            value={query.expiry === 'any' ? undefined : query.expiry}
            onChange={value => setParam('expiry', value || '')}
            options={[
              { value: '7', label: t('within7', { defaultValue: 'Expiring in 7 days' }) },
              { value: '10', label: t('within10', { defaultValue: 'Expiring in 10 days' }) },
              { value: '30', label: t('within30', { defaultValue: 'Expiring in 30 days' }) },
              { value: '60', label: t('within60', { defaultValue: 'Expiring in 60 days' }) },
              { value: 'expired', label: t('expired', { defaultValue: 'Expired' }) },
            ]}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 180 }}
            placeholder={t('client', { defaultValue: 'Client' })}
            value={query.client_id || undefined}
            onChange={value => setParam('client_id', value || '')}
            options={filters.clients.map(client => ({ value: client.id, label: client.name }))}
          />
          <Select
            allowClear
            style={{ minWidth: 180 }}
            placeholder={t('provider', { defaultValue: 'Provider' })}
            value={query.provider || undefined}
            onChange={value => setParam('provider', value || '')}
            options={filters.providers.map(provider => ({ value: provider, label: provider }))}
          />
          <Select
            allowClear
            style={{ minWidth: 180 }}
            placeholder={t('dnsManager', { defaultValue: 'DNS manager' })}
            value={query.dns_manager || undefined}
            onChange={value => setParam('dns_manager', value || '')}
            options={filters.dns_managers.map(name => ({ value: name, label: name }))}
          />
          <Select
            allowClear
            style={{ minWidth: 160 }}
            placeholder={t('status', { defaultValue: 'Status' })}
            value={query.status || undefined}
            onChange={value => setParam('status', value || '')}
            options={['active', 'suspended', 'expired', 'archived'].map(status => ({
              value: status,
              label: t(`status.${status}`, { defaultValue: status }),
            }))}
          />
      </Flex>

      <Table<IWebsiteListItem>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1100 }}
        onRow={record => ({ onClick: () => navigate(`/renewals/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: query.index,
          pageSize: query.size,
          total,
          showSizeChanger: false,
          onChange: page => {
            const next = new URLSearchParams(searchParams);
            next.set('page', String(page));
            setSearchParams(next);
          },
        }}
        onChange={(_pagination, _filters, sorter) => {
          const sort = Array.isArray(sorter) ? sorter[0] : sorter;
          if (!sort?.field || !sort.order) return;
          const next = new URLSearchParams(searchParams);
          next.set('field', String(sort.field));
          next.set('order', sort.order === 'descend' ? 'desc' : 'asc');
          setSearchParams(next);
        }}
        columns={[
          { title: t('website', { defaultValue: 'Website' }), dataIndex: 'name', sorter: true, render: (_value, record) => (
            <div>
              <Typography.Text strong>{record.name}</Typography.Text>
              <div><Typography.Text type="secondary">{record.domain}</Typography.Text></div>
            </div>
          ) },
          { title: t('client', { defaultValue: 'Client' }), dataIndex: 'client_name', sorter: true },
          { title: t('domainManagedBy', { defaultValue: 'Domain managed by' }), dataIndex: 'domain_managed_by', sorter: true, render: managedLabel },
          { title: t('domainExpiry', { defaultValue: 'Domain expiry' }), dataIndex: 'domain_expiry', sorter: true, render: value => value || '—' },
          { title: t('hostingManagedBy', { defaultValue: 'Hosting managed by' }), dataIndex: 'hosting_managed_by', sorter: true, render: managedLabel },
          { title: t('hostingProvider', { defaultValue: 'Hosting provider' }), dataIndex: 'hosting_provider', sorter: true, render: value => value || '—' },
          { title: t('hostingExpiry', { defaultValue: 'Hosting expiry' }), dataIndex: 'hosting_expiry', sorter: true, render: value => value || '—' },
          { title: t('dnsManager', { defaultValue: 'DNS manager' }), dataIndex: 'dns_manager', sorter: true, render: value => value || '—' },
          { title: t('status', { defaultValue: 'Status' }), dataIndex: 'status', sorter: true, render: value => t(`status.${value}`, { defaultValue: value }) },
          { title: t('daysRemaining', { defaultValue: 'Days remaining' }), dataIndex: 'days_remaining', sorter: true, render: (value: number | null) => (
            value == null ? '—' : <Tag color={daysColor(value)}>{value}</Tag>
          ) },
          { title: t('actions', { defaultValue: 'Actions' }), key: 'actions', render: (_value, record) => (
            <Popconfirm
              title={t('archiveConfirm', { defaultValue: 'Archive this website?' })}
              onConfirm={event => {
                event?.stopPropagation();
                void archive(record.id);
              }}
              onCancel={event => event?.stopPropagation()}
            >
              <Button size="small" onClick={event => event.stopPropagation()}>
                {t('archive', { defaultValue: 'Archive' })}
              </Button>
            </Popconfirm>
          ) },
        ]}
      />
    </Flex>
  );
};

export default RenewalsPage;
