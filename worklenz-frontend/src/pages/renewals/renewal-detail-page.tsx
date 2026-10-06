import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  DatePicker,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Col,
  Select,
  Space,
  Table,
  Typography,
  message,
} from '@/shared/antd-imports';
import type { Dayjs } from '@/shared/antd-imports';
import WorklenzPageHeader from '@/components/common/WorklenzPageHeader';
import { websitesApiService } from '@/api/websites/websites.api.service';
import { IWebsiteFilters, IWebsitePayload, RenewalItem } from '@/types/websites/website.types';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';

function formatMonthDayYear(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function apiError(error: unknown, fallback: string): string {
  const messageText = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return messageText || fallback;
}

interface FormValues extends IWebsitePayload {
  domain_expiry?: string | null;
  hosting_expiry?: string | null;
}

const RenewalDetailPage = () => {
  const { t } = useTranslation('renewals');
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const [renewForm] = Form.useForm<{ item: RenewalItem; new_expiry: Dayjs; note?: string }>();
  const [filters, setFilters] = useState<IWebsiteFilters>({ clients: [], projects: [], providers: [], dns_managers: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [history, setHistory] = useState<NonNullable<Awaited<ReturnType<typeof websitesApiService.getById>>['body']>['renewals']>([]);
  const [tasks, setTasks] = useState<NonNullable<Awaited<ReturnType<typeof websitesApiService.getById>>['body']>['tasks']>([]);
  const [archived, setArchived] = useState(false);
  const clientId = Form.useWatch('client_id', form);

  useDocumentTitle(isNew ? t('addWebsite', { defaultValue: 'Add website' }) : t('editWebsite', { defaultValue: 'Website' }));

  const projects = useMemo(
    () => filters.projects.filter(project => !clientId || !project.client_id || project.client_id === clientId),
    [filters.projects, clientId]
  );

  useEffect(() => {
    void websitesApiService.filters().then(res => {
      if (res.done && res.body) setFilters(res.body);
    });
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    void websitesApiService.getById(id)
      .then(res => {
        if (!res.done || !res.body) return;
        form.setFieldsValue(res.body);
        setHistory(res.body.renewals || []);
        setTasks(res.body.tasks || []);
        setArchived(res.body.status === 'archived');
      })
      .catch(error => message.error(apiError(error, t('loadFailed', { defaultValue: 'Could not load websites' }))))
      .finally(() => setLoading(false));
  }, [form, id, isNew, t]);

  const onFinish = async (values: FormValues) => {
    setSaving(true);
    const payload: IWebsitePayload = {
      ...values,
      client_id: values.client_id || null,
      project_id: values.project_id || null,
      domain_expiry: values.domain_expiry || null,
      hosting_expiry: values.hosting_expiry || null,
    };
    try {
      const res = isNew
        ? await websitesApiService.create(payload)
        : await websitesApiService.update(id as string, payload);
      if (res.done && res.body) {
        message.success(t('saved', { defaultValue: 'Saved' }));
        navigate(`/renewals/${res.body.id}`);
      }
    } catch (error) {
      message.error(apiError(error, t('saveFailed', { defaultValue: 'Could not save website' })));
    } finally {
      setSaving(false);
    }
  };

  const markRenewed = async () => {
    const values = await renewForm.validateFields();
    if (!id) return;
    try {
      const res = await websitesApiService.renew(id, {
        item: values.item,
        new_expiry: values.new_expiry.format('YYYY-MM-DD'),
        note: values.note,
      });
      if (res.done && res.body) {
        message.success(t('renewed', { defaultValue: 'Renewal recorded' }));
        form.setFieldsValue(res.body);
        setHistory(res.body.renewals || []);
        setTasks(res.body.tasks || []);
        setRenewOpen(false);
        renewForm.resetFields();
      }
    } catch (error) {
      message.error(apiError(error, t('renewFailed', { defaultValue: 'Could not record renewal' })));
    }
  };

  const archiveOrRestore = async () => {
    if (!id) return;
    try {
      const res = archived ? await websitesApiService.restore(id) : await websitesApiService.archive(id);
      if (res.done && res.body) {
        message.success(archived ? t('restored', { defaultValue: 'Website restored' }) : t('archived', { defaultValue: 'Website archived' }));
        form.setFieldsValue(res.body);
        setArchived(res.body.status === 'archived');
      }
    } catch (error) {
      message.error(apiError(error, t('archiveFailed', { defaultValue: 'Could not archive website' })));
    }
  };

  return (
    <Flex vertical gap={16} style={{ padding: 24, maxWidth: 1120 }}>
      <WorklenzPageHeader
        title={isNew ? t('addWebsite', { defaultValue: 'Add website' }) : t('editWebsite', { defaultValue: 'Website' })}
        extra={
          <Space>
            <Button onClick={() => navigate('/renewals')}>{t('back', { defaultValue: 'Back' })}</Button>
            {!isNew && (
              <Button onClick={() => setRenewOpen(true)}>{t('markRenewed', { defaultValue: 'Mark as renewed' })}</Button>
            )}
            {!isNew && (
              <Popconfirm
                title={archived
                  ? t('restoreConfirm', { defaultValue: 'Restore this website?' })
                  : t('archiveConfirm', { defaultValue: 'Archive this website?' })}
                onConfirm={() => void archiveOrRestore()}
              >
                <Button>{archived ? t('restore', { defaultValue: 'Restore' }) : t('archive', { defaultValue: 'Archive' })}</Button>
              </Popconfirm>
            )}
          </Space>
        }
      />

      <Form
        form={form}
        layout="vertical"
        disabled={loading}
        initialValues={{ status: 'active', domain_managed_by: 'us', hosting_managed_by: 'us' }}
        onFinish={onFinish}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title={t('general', { defaultValue: 'General' })} style={{ height: '100%' }}>
              <Form.Item name="name" label={t('websiteName', { defaultValue: 'Website name' })} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="domain" label={t('domain', { defaultValue: 'Domain' })} rules={[{ required: true }]}>
                <Input placeholder="example.com" />
              </Form.Item>
              <Form.Item name="client_id" label={t('client', { defaultValue: 'Client' })}>
                <Select allowClear showSearch optionFilterProp="label" options={filters.clients.map(client => ({ value: client.id, label: client.name }))} />
              </Form.Item>
              <Form.Item name="project_id" label={t('project', { defaultValue: 'Project' })}>
                <Select allowClear showSearch optionFilterProp="label" options={projects.map(project => ({ value: project.id, label: project.name }))} />
              </Form.Item>
              <Form.Item name="status" label={t('status', { defaultValue: 'Status' })} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                <Select options={['active', 'suspended', 'expired', 'archived'].map(status => ({
                  value: status,
                  label: t(`status.${status}`, { defaultValue: status }),
                }))} />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={t('domainSection', { defaultValue: 'Domain' })} style={{ height: '100%' }}>
              <Form.Item name="domain_managed_by" label={t('managedBy', { defaultValue: 'Managed by' })} rules={[{ required: true }]}>
                <Select options={[
                  { value: 'us', label: t('managedUs', { defaultValue: 'Wecypher' }) },
                  { value: 'client', label: t('managedClient', { defaultValue: 'Client' }) },
                ]} />
              </Form.Item>
              <Form.Item name="domain_provider" label={t('registrar', { defaultValue: 'Registrar / provider' })}>
                <Input />
              </Form.Item>
              <Form.Item name="domain_account_email" label={t('accountEmail', { defaultValue: 'Registered account email' })}>
                <Input />
              </Form.Item>
              <Form.Item name="domain_expiry" label={t('expiryDate', { defaultValue: 'Expiry date' })} style={{ marginBottom: 0 }}>
                <Input type="date" />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={t('hostingSection', { defaultValue: 'Hosting' })} style={{ height: '100%' }}>
              <Form.Item name="hosting_managed_by" label={t('managedBy', { defaultValue: 'Managed by' })} rules={[{ required: true }]}>
                <Select options={[
                  { value: 'us', label: t('managedUs', { defaultValue: 'Wecypher' }) },
                  { value: 'client', label: t('managedClient', { defaultValue: 'Client' }) },
                ]} />
              </Form.Item>
              <Form.Item name="hosting_provider" label={t('hostingProvider', { defaultValue: 'Hosting provider' })}>
                <Input />
              </Form.Item>
              <Form.Item name="hosting_plan" label={t('plan', { defaultValue: 'Plan / server' })}>
                <Input />
              </Form.Item>
              <Form.Item name="hosting_expiry" label={t('expiryDate', { defaultValue: 'Expiry date' })} style={{ marginBottom: 0 }}>
                <Input type="date" />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={t('extras', { defaultValue: 'Extras' })} style={{ height: '100%' }}>
              <Form.Item name="dns_manager" label={t('dnsManager', { defaultValue: 'DNS manager' })}>
                <Input placeholder={t('dnsPlaceholder', { defaultValue: 'Cloudflare, registrar, hosting provider, or other' })} />
              </Form.Item>
              <Form.Item name="credentials_ref" label={t('credentialsRef', { defaultValue: 'Credentials location' })} extra={t('credentialsHelp', { defaultValue: 'Where the login lives. Do not store passwords here.' })}>
                <Input />
              </Form.Item>
              <Form.Item name="notes" label={t('notes', { defaultValue: 'Notes' })} style={{ marginBottom: 0 }}>
                <Input.TextArea rows={4} />
              </Form.Item>
            </Card>
          </Col>
        </Row>

        <Button type="primary" htmlType="submit" loading={saving} style={{ marginTop: 16 }}>
          {t('save', { defaultValue: 'Save' })}
        </Button>
      </Form>

      {!isNew && (
        <Card title={t('linkedTasks', { defaultValue: 'Renewal tasks' })}>
          {tasks && tasks.length > 0 ? (
            <Space direction="vertical">
              {tasks.map(task => (
                <Link key={task.task_id} to={`/projects/${task.project_id}?task=${task.task_id}`}>
                  {task.task_name} ({task.expiry_date})
                </Link>
              ))}
            </Space>
          ) : (
            <Typography.Text type="secondary">{t('noTasks', { defaultValue: 'No renewal task yet. One is created when the lead time in settings is reached.' })}</Typography.Text>
          )}
        </Card>
      )}

      {!isNew && (
        <Card title={t('history', { defaultValue: 'Renewal history' })}>
          <Table
            rowKey="id"
            pagination={false}
            dataSource={history}
            locale={{ emptyText: t('noHistory', { defaultValue: 'No renewals recorded' }) }}
            columns={[
              { title: t('item', { defaultValue: 'Item' }), dataIndex: 'item' },
              { title: t('previousExpiry', { defaultValue: 'Previous expiry' }), dataIndex: 'previous_expiry', render: value => formatMonthDayYear(value) },
              { title: t('newExpiry', { defaultValue: 'New expiry' }), dataIndex: 'new_expiry', render: value => formatMonthDayYear(value) },
              { title: t('renewedBy', { defaultValue: 'Renewed by' }), dataIndex: 'renewed_by_name', render: value => value || '—' },
              { title: t('renewedOn', { defaultValue: 'Renewed on' }), dataIndex: 'renewed_at', render: value => value ? new Date(value).toLocaleString() : '—' },
              { title: t('note', { defaultValue: 'Note' }), dataIndex: 'note', render: value => value || '—' },
            ]}
          />
        </Card>
      )}

      <Modal
        open={renewOpen}
        title={t('markRenewed', { defaultValue: 'Mark as renewed' })}
        onCancel={() => setRenewOpen(false)}
        onOk={() => void markRenewed()}
        okText={t('save', { defaultValue: 'Save' })}
      >
        <Form form={renewForm} layout="vertical">
          <Form.Item name="item" label={t('item', { defaultValue: 'Item' })} rules={[{ required: true }]}>
            <Select options={[
              { value: 'domain', label: t('domainSection', { defaultValue: 'Domain' }) },
              { value: 'hosting', label: t('hostingSection', { defaultValue: 'Hosting' }) },
            ]} />
          </Form.Item>
          <Form.Item name="new_expiry" label={t('newExpiry', { defaultValue: 'New expiry' })} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label={t('note', { defaultValue: 'Note' })}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
};

export default RenewalDetailPage;
