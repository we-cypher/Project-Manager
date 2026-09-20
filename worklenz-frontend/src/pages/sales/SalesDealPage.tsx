import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Timeline,
  Typography,
  message,
  theme,
} from '@/shared/antd-imports';
import { ArrowLeftOutlined, PlusOutlined } from '@/shared/antd-imports';
import dayjs from 'dayjs';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import { useAuthService } from '@/hooks/useAuth';
import { clientsApiService } from '@/api/clients/clients.api.service';
import { salesApiService } from '@/api/sales/sales.api.service';
import type { IClient } from '@/types/client.types';
import {
  ISalesActivity,
  ISalesDeal,
  ISalesDealPayload,
  ISalesOwner,
  ISalesProduct,
  ISalesProjectLookup,
  SalesActivityType,
  SalesDealType,
} from '@/types/sales/sales.types';
import { DealEditorForm } from './DealEditorForm';
import { formatMoney, STAGE_COLORS } from './sales.constants';
import { useOrgCurrency } from '@/hooks/useOrgCurrency';

const { Text, Title } = Typography;

export const SalesDealPage = () => {
  const { dealId } = useParams<{ dealId: string }>();
  const { t } = useTranslation('sales');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const authService = useAuthService();
  const canDelete = authService.isOwnerOrAdmin();
  const orgCurrency = useOrgCurrency();

  const [deal, setDeal] = useState<ISalesDeal | null>(null);
  const [activities, setActivities] = useState<ISalesActivity[]>([]);
  const [products, setProducts] = useState<ISalesProduct[]>([]);
  const [owners, setOwners] = useState<ISalesOwner[]>([]);
  const [clients, setClients] = useState<IClient[]>([]);
  const [projects, setProjects] = useState<ISalesProjectLookup[]>([]);
  const [dealType, setDealType] = useState<SalesDealType>('service');
  const [saving, setSaving] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityType, setActivityType] = useState<SalesActivityType>('task');
  const [lostReason, setLostReason] = useState('');
  const [linkProjectId, setLinkProjectId] = useState<string>();
  const [form] = Form.useForm();
  const [activityForm] = Form.useForm();

  useDocumentTitle(deal?.name || t('title', { defaultValue: 'Sales' }));

  const load = useCallback(async () => {
    if (!dealId) return;
    try {
      const [dealRes, activitiesRes, productsRes, ownersRes, clientsRes, projectsRes] = await Promise.all([
        salesApiService.getDeal(dealId),
        salesApiService.getActivities(dealId),
        salesApiService.getProducts(),
        salesApiService.getOwners(),
        clientsApiService.getClientsLookup(),
        salesApiService.getProjectsLookup(),
      ]);
      if (!dealRes.done || !dealRes.body) {
        message.error(dealRes.message || t('loadError', { defaultValue: 'Could not load deal' }));
        navigate('/sales');
        return;
      }
      setDeal(dealRes.body);
      setDealType(dealRes.body.deal_type);
      form.setFieldsValue(dealRes.body);
      if (activitiesRes.done) setActivities(activitiesRes.body || []);
      if (productsRes.done) setProducts(productsRes.body || []);
      if (ownersRes.done) setOwners(ownersRes.body || []);
      if (clientsRes.done) setClients(clientsRes.body || []);
      if (projectsRes.done) setProjects(projectsRes.body || []);
    } catch {
      message.error(t('loadError', { defaultValue: 'Could not load deal' }));
    }
  }, [dealId, form, navigate, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!dealId) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload: ISalesDealPayload = {
        ...values,
        budget: Number(values.budget || 0),
        amount: Number(values.amount || 0),
      };
      const res = await salesApiService.updateDeal(dealId, payload);
      if (res.done && res.body) {
        setDeal(res.body);
        message.success(t('saved', { defaultValue: 'Saved' }));
      } else {
        message.error(res.message || t('loadError', { defaultValue: 'Could not save' }));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleWon = async () => {
    if (!dealId) return;
    const res = await salesApiService.updateDealStage(dealId, 'won');
    if (res.done && res.body) {
      setDeal(res.body);
      void load();
      message.success(t('stages.won', { defaultValue: 'Won' }));
    } else {
      message.error(res.message || t('loadError', { defaultValue: 'Could not update stage' }));
    }
  };

  const handleLost = async () => {
    if (!dealId || !lostReason.trim()) {
      message.error(t('lostReasonRequired', { defaultValue: 'Add a short reason' }));
      return;
    }
    const res = await salesApiService.updateDealStage(dealId, 'lost', lostReason.trim());
    if (res.done && res.body) {
      setDeal(res.body);
      setLostOpen(false);
      setLostReason('');
    } else {
      message.error(res.message || t('loadError', { defaultValue: 'Could not update stage' }));
    }
  };

  const handleCreateProject = async () => {
    if (!dealId) return;
    const res = await salesApiService.createProject(dealId, deal?.name);
    if (res.done && res.body?.deal) {
      setDeal(res.body.deal);
      message.success(t('projectCreated', { defaultValue: 'Project created' }));
    } else {
      message.error(res.message || t('loadError', { defaultValue: 'Could not create project' }));
    }
  };

  const handleLinkProject = async () => {
    if (!dealId || !linkProjectId) return;
    const res = await salesApiService.linkProject(dealId, linkProjectId);
    if (res.done && res.body) {
      setDeal(res.body);
      setLinkOpen(false);
      message.success(t('projectLinked', { defaultValue: 'Project linked' }));
    } else {
      message.error(res.message || t('loadError', { defaultValue: 'Could not link project' }));
    }
  };

  const handleOnboarding = async () => {
    if (!dealId) return;
    const res = await salesApiService.applyOnboarding(dealId);
    if (res.done) {
      message.success(t('onboardingAdded', { defaultValue: 'Onboarding steps added' }));
      void load();
    } else {
      message.error(res.message || t('loadError', { defaultValue: 'Could not add onboarding' }));
    }
  };

  const handleAddActivity = async () => {
    if (!dealId) return;
    const values = await activityForm.validateFields();
    const res = await salesApiService.createActivity(dealId, {
      type: activityType,
      title: values.title,
      description: values.description,
      due_at: values.due_at ? dayjs(values.due_at).toISOString() : null,
      assigned_to: values.assigned_to,
    });
    if (res.done) {
      message.success(t('activityAdded', { defaultValue: 'Follow-up added' }));
      setActivityOpen(false);
      activityForm.resetFields();
      void load();
    } else {
      message.error(res.message || t('loadError', { defaultValue: 'Could not add follow-up' }));
    }
  };

  const toggleComplete = async (activity: ISalesActivity, completed: boolean) => {
    const res = await salesApiService.updateActivity(activity.id, { completed });
    if (res.done) void load();
  };

  const handleDelete = async () => {
    if (!dealId) return;
    const res = await salesApiService.deleteDeal(dealId);
    if (res.done) {
      message.success(t('deleted', { defaultValue: 'Deal deleted' }));
      navigate('/sales');
    } else {
      message.error(res.message || t('loadError', { defaultValue: 'Could not delete' }));
    }
  };

  const openActivity = (type: SalesActivityType) => {
    setActivityType(type);
    activityForm.resetFields();
    activityForm.setFieldsValue({ assigned_to: deal?.owner_id });
    setActivityOpen(true);
  };

  if (!deal) return null;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales')}>
            {t('backToSales', { defaultValue: 'Back to Sales' })}
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            {deal.name}
          </Title>
          <Tag color={STAGE_COLORS[deal.stage]}>{t(`stages.${deal.stage}`, { defaultValue: deal.stage })}</Tag>
        </Space>
        <Space wrap>
          {deal.stage !== 'won' && (
            <Button type="primary" onClick={() => void handleWon()}>
              {t('won', { defaultValue: 'Mark won' })}
            </Button>
          )}
          {deal.stage !== 'lost' && (
            <Button danger onClick={() => setLostOpen(true)}>
              {t('lost', { defaultValue: 'Mark lost' })}
            </Button>
          )}
          {deal.deal_type === 'service' && !deal.project_id && (
            <>
              <Button onClick={() => void handleCreateProject()}>
                {t('createProject', { defaultValue: 'Create project' })}
              </Button>
              <Button onClick={() => setLinkOpen(true)}>
                {t('linkProject', { defaultValue: 'Link project' })}
              </Button>
            </>
          )}
          {deal.project_id && (
            <Button type="link" onClick={() => navigate(`/projects/${deal.project_id}?tab=board&pinned_tab=board`)}>
              {t('openProject', { defaultValue: 'Open project' })}
            </Button>
          )}
          {deal.deal_type === 'saas' && !deal.onboarding_applied && (
            <Button onClick={() => void handleOnboarding()}>
              {t('applyOnboarding', { defaultValue: 'Add onboarding steps' })}
            </Button>
          )}
          {canDelete && (
            <Button
              danger
              onClick={() => {
                Modal.confirm({
                  title: t('deleteDealConfirm', { defaultValue: 'Delete this deal?' }),
                  onOk: () => handleDelete(),
                });
              }}
            >
              {t('delete', { defaultValue: 'Delete' })}
            </Button>
          )}
        </Space>
      </Flex>

      <Flex gap={16} wrap="wrap" align="flex-start">
        <Card style={{ flex: '1 1 420px', borderRadius: 8 }}>
          <DealEditorForm
            form={form}
            products={products}
            owners={owners}
            clients={clients}
            dealType={dealType}
            onDealTypeChange={setDealType}
            defaultCurrency={orgCurrency}
          />
          <Flex justify="space-between" align="center">
            <Text type="secondary">
              {t('amount', { defaultValue: 'Amount' })}: {formatMoney(deal.amount, deal.currency || orgCurrency)}
            </Text>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              {t('save', { defaultValue: 'Save' })}
            </Button>
          </Flex>
        </Card>

        <Card
          style={{ flex: '1 1 420px', borderRadius: 8, background: token.colorBgContainer }}
          title={t('activities', { defaultValue: 'Follow-ups' })}
          extra={
            <Space wrap>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openActivity('call')}>
                {t('logCall', { defaultValue: 'Log call' })}
              </Button>
              <Button size="small" onClick={() => openActivity('meeting')}>
                {t('addMeeting', { defaultValue: 'Add meeting' })}
              </Button>
              <Button size="small" onClick={() => openActivity('task')}>
                {t('addTask', { defaultValue: 'Add task' })}
              </Button>
              <Button size="small" onClick={() => openActivity('reminder')}>
                {t('setReminder', { defaultValue: 'Set reminder' })}
              </Button>
              <Button size="small" onClick={() => openActivity('note')}>
                {t('addNote', { defaultValue: 'Add note' })}
              </Button>
            </Space>
          }
        >
          {activities.length === 0 ? (
            <Empty description={t('noActivities', { defaultValue: 'No follow-ups yet.' })} />
          ) : (
            <Timeline
              items={activities.map(activity => ({
                color: activity.completed_at ? 'green' : 'blue',
                children: (
                  <Flex gap={8} align="flex-start">
                    <Checkbox
                      checked={!!activity.completed_at}
                      onChange={event => void toggleComplete(activity, event.target.checked)}
                    />
                    <div>
                      <Text delete={!!activity.completed_at} strong>
                        {activity.title}
                      </Text>
                      <div>
                        <Tag>{t(`activityTypes.${activity.type}`, { defaultValue: activity.type })}</Tag>
                        {activity.due_at ? <Text type="secondary">{dayjs(activity.due_at).format('MMM D, YYYY HH:mm')}</Text> : null}
                      </div>
                      {activity.assigned_to_name ? (
                        <Text type="secondary">{activity.assigned_to_name}</Text>
                      ) : null}
                    </div>
                  </Flex>
                ),
              }))}
            />
          )}
        </Card>
      </Flex>

      <Modal
        title={t('lost', { defaultValue: 'Mark lost' })}
        open={lostOpen}
        onCancel={() => setLostOpen(false)}
        onOk={() => void handleLost()}
        okText={t('lost', { defaultValue: 'Mark lost' })}
      >
        <Input.TextArea
          rows={3}
          value={lostReason}
          onChange={event => setLostReason(event.target.value)}
          placeholder={t('lostReason', { defaultValue: 'Lost reason' })}
        />
      </Modal>

      <Modal
        title={t('linkProject', { defaultValue: 'Link project' })}
        open={linkOpen}
        onCancel={() => setLinkOpen(false)}
        onOk={() => void handleLinkProject()}
      >
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          placeholder={t('selectProject', { defaultValue: 'Select a project' })}
          value={linkProjectId}
          onChange={setLinkProjectId}
          options={projects.map(project => ({ value: project.id, label: project.name }))}
        />
      </Modal>

      <Modal
        title={t(`activityTypes.${activityType}`, { defaultValue: activityType })}
        open={activityOpen}
        onCancel={() => setActivityOpen(false)}
        onOk={() => void handleAddActivity()}
        okText={t('create', { defaultValue: 'Create' })}
      >
        <Form form={activityForm} layout="vertical">
          <Form.Item name="type" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="title"
            label={t('activityTitle', { defaultValue: 'Title' })}
            rules={[{ required: true, message: t('dealNameRequired', { defaultValue: 'Title is required' }) }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="due_at" label={t('dueDate', { defaultValue: 'Due date' })}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="assigned_to" label={t('owner', { defaultValue: 'Owner' })}>
            <Select
              allowClear
              options={owners.map(owner => ({ value: owner.id, label: owner.name }))}
            />
          </Form.Item>
          <Form.Item name="description" label={t('notes', { defaultValue: 'Notes' })}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SalesDealPage;
