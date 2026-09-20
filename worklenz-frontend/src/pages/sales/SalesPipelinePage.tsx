import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
  message,
  theme,
} from '@/shared/antd-imports';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined } from '@/shared/antd-imports';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import { clientsApiService } from '@/api/clients/clients.api.service';
import { salesApiService } from '@/api/sales/sales.api.service';
import type { IClient } from '@/types/client.types';
import {
  ISalesDeal,
  ISalesDealPayload,
  ISalesOwner,
  ISalesProduct,
  SALES_STAGES,
  SalesDealStage,
  SalesDealType,
} from '@/types/sales/sales.types';
import { DealEditorForm } from './DealEditorForm';
import { formatMoney, STAGE_COLORS } from './sales.constants';
import { useOrgCurrency } from '@/hooks/useOrgCurrency';

const { Text, Title } = Typography;

export const SalesPipelinePage = () => {
  const { t } = useTranslation('sales');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  useDocumentTitle(t('title', { defaultValue: 'Sales' }));

  const [deals, setDeals] = useState<ISalesDeal[]>([]);
  const [products, setProducts] = useState<ISalesProduct[]>([]);
  const [owners, setOwners] = useState<ISalesOwner[]>([]);
  const [clients, setClients] = useState<IClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dealTypeFilter, setDealTypeFilter] = useState<string>('');
  const [productFilter, setProductFilter] = useState<string>('');
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dealType, setDealType] = useState<SalesDealType>('service');
  const [form] = Form.useForm();
  const orgCurrency = useOrgCurrency();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsRes, productsRes, ownersRes, clientsRes] = await Promise.all([
        salesApiService.getDeals({
          search,
          deal_type: dealTypeFilter,
          product_id: productFilter,
        }),
        salesApiService.getProducts(),
        salesApiService.getOwners(),
        clientsApiService.getClientsLookup(),
      ]);
      if (dealsRes.done) setDeals(dealsRes.body || []);
      if (productsRes.done) setProducts(productsRes.body || []);
      if (ownersRes.done) setOwners(ownersRes.body || []);
      if (clientsRes.done) setClients(clientsRes.body || []);
      if (!dealsRes.done) {
        message.error(dealsRes.message || t('loadError', { defaultValue: 'Could not load sales data.' }));
      }
    } catch {
      message.error(t('loadError', { defaultValue: 'Could not load sales data. Run the Sales SQL in psql if tables are missing.' }));
    } finally {
      setLoading(false);
    }
  }, [dealTypeFilter, productFilter, search, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    return SALES_STAGES.reduce<Record<SalesDealStage, ISalesDeal[]>>((acc, stage) => {
      acc[stage] = deals.filter(deal => deal.stage === stage);
      return acc;
    }, {
      new: [],
      contacted: [],
      qualified: [],
      proposal: [],
      won: [],
      lost: [],
    });
  }, [deals]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ deal_type: 'service', source: 'other', currency: orgCurrency, budget: 0, amount: 0 });
    setDealType('service');
    setModalOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload: ISalesDealPayload = {
        ...values,
        budget: Number(values.budget || 0),
        amount: Number(values.amount || 0),
      };
      const res = await salesApiService.createDeal(payload);
      if (res.done && res.body) {
        message.success(t('created', { defaultValue: 'Deal created' }));
        setModalOpen(false);
        navigate(`/sales/${res.body.id}`);
      } else {
        message.error(res.message || t('loadError', { defaultValue: 'Could not save deal' }));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = async (dealId: string, stage: SalesDealStage) => {
    const current = deals.find(deal => deal.id === dealId);
    if (!current || current.stage === stage) return;
    setDeals(prev => prev.map(deal => (deal.id === dealId ? { ...deal, stage } : deal)));
    const res = await salesApiService.updateDealStage(dealId, stage);
    if (!res.done) {
      message.error(res.message || t('loadError', { defaultValue: 'Could not update stage' }));
      void load();
    } else if (res.body) {
      setDeals(prev => prev.map(deal => (deal.id === dealId ? res.body : deal)));
    }
  };

  const columns: ColumnsType<ISalesDeal> = [
    {
      title: t('dealName', { defaultValue: 'Deal name' }),
      dataIndex: 'name',
      render: (name: string, record) => (
        <Button type="link" onClick={() => navigate(`/sales/${record.id}`)} style={{ padding: 0 }}>
          {name}
        </Button>
      ),
    },
    {
      title: t('dealType', { defaultValue: 'Type' }),
      dataIndex: 'deal_type',
      render: (value: string) => t(value, { defaultValue: value }),
    },
    {
      title: t('product', { defaultValue: 'Product' }),
      dataIndex: 'product_name',
    },
    {
      title: t('client', { defaultValue: 'Client' }),
      dataIndex: 'client_name',
    },
    {
      title: t('source', { defaultValue: 'Source' }),
      dataIndex: 'source',
      render: (value: string) => t(`sources.${value}`, { defaultValue: value }),
    },
    {
      title: t('budget', { defaultValue: 'Budget' }),
      render: (_, record) => formatMoney(record.budget, record.currency || 'USD'),
    },
    {
      title: t('amount', { defaultValue: 'Amount' }),
      render: (_, record) => formatMoney(record.amount, record.currency || 'USD'),
    },
    {
      title: t('owner', { defaultValue: 'Owner' }),
      dataIndex: 'owner_name',
    },
    {
      title: t('stage', { defaultValue: 'Stage' }),
      dataIndex: 'stage',
      render: (stage: SalesDealStage) => (
        <Tag color={STAGE_COLORS[stage]}>{t(`stages.${stage}`, { defaultValue: stage })}</Tag>
      ),
    },
    {
      title: t('nextFollowUp', { defaultValue: 'Next follow-up' }),
      render: (_, record) => record.next_due_title || '—',
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
        <Title level={4} style={{ margin: 0 }}>
          {t('title', { defaultValue: 'Sales' })}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('newDeal', { defaultValue: 'New deal' })}
        </Button>
      </Flex>

      <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('searchDeals', { defaultValue: 'Search deals' })}
            style={{ width: 240 }}
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
          />
          <Select
            allowClear
            placeholder={t('allTypes', { defaultValue: 'All types' })}
            style={{ width: 140 }}
            value={dealTypeFilter || undefined}
            onChange={value => setDealTypeFilter(value || '')}
            options={[
              { value: 'service', label: t('service', { defaultValue: 'Service' }) },
              { value: 'saas', label: t('saas', { defaultValue: 'SaaS' }) },
            ]}
          />
          <Select
            allowClear
            placeholder={t('allProducts', { defaultValue: 'All products' })}
            style={{ width: 180 }}
            value={productFilter || undefined}
            onChange={value => setProductFilter(value || '')}
            options={products.map(product => ({ value: product.id, label: product.name }))}
          />
        </Space>
        <Segmented
          value={view}
          onChange={value => setView(value as 'pipeline' | 'list')}
          options={[
            { label: t('pipeline', { defaultValue: 'Pipeline' }), value: 'pipeline' },
            { label: t('list', { defaultValue: 'List' }), value: 'list' },
          ]}
        />
      </Flex>

      {view === 'list' ? (
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={deals}
          pagination={false}
          locale={{ emptyText: <Empty description={t('emptyList', { defaultValue: 'No deals yet.' })} /> }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))',
            gap: 12,
            overflowX: 'auto',
          }}
        >
          {SALES_STAGES.map(stage => (
            <div
              key={stage}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                const dealId = event.dataTransfer.getData('text/plain');
                if (dealId) void handleDrop(dealId, stage);
              }}
              style={{
                minHeight: 360,
                borderRadius: 8,
                background: token.colorFillQuaternary,
                padding: 8,
              }}
            >
              <Flex justify="space-between" align="center" style={{ marginBottom: 8, padding: '4px 4px 0' }}>
                <Text strong style={{ color: STAGE_COLORS[stage] }}>
                  {t(`stages.${stage}`, { defaultValue: stage })}
                </Text>
                <Tag>{grouped[stage].length}</Tag>
              </Flex>
              <Flex vertical gap={8}>
                {grouped[stage].length === 0 && (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('emptyPipeline', { defaultValue: 'No deals in this stage' })} />
                )}
                {grouped[stage].map(deal => (
                  <Card
                    key={deal.id}
                    size="small"
                    hoverable
                    draggable
                    onDragStart={event => event.dataTransfer.setData('text/plain', deal.id)}
                    onClick={() => navigate(`/sales/${deal.id}`)}
                    style={{ borderRadius: 8 }}
                  >
                    <Text strong>{deal.name}</Text>
                    <div>
                      <Text type="secondary">
                        {deal.client_name || deal.contact_name || t(deal.deal_type, { defaultValue: deal.deal_type })}
                      </Text>
                    </div>
                    <Flex justify="space-between" style={{ marginTop: 8 }}>
                      <Text>{formatMoney(deal.amount, deal.currency || 'USD')}</Text>
                      {deal.product_name ? <Tag>{deal.product_name}</Tag> : null}
                    </Flex>
                    {deal.next_due_title ? (
                      <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                        {deal.next_due_title}
                      </Text>
                    ) : null}
                  </Card>
                ))}
              </Flex>
            </div>
          ))}
        </div>
      )}

      <Modal
        title={t('newDeal', { defaultValue: 'New deal' })}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleCreate()}
        confirmLoading={saving}
        okText={t('create', { defaultValue: 'Create' })}
        cancelText={t('cancel', { defaultValue: 'Cancel' })}
        destroyOnClose
      >
        <DealEditorForm
          form={form}
          products={products}
          owners={owners}
          clients={clients}
          dealType={dealType}
          onDealTypeChange={setDealType}
          defaultCurrency={orgCurrency}
        />
      </Modal>
    </Flex>
  );
};

export default SalesPipelinePage;
