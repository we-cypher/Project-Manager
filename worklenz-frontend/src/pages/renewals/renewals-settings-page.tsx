import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Flex, Form, InputNumber, Select, Typography, message } from '@/shared/antd-imports';
import WorklenzPageHeader from '@/components/common/WorklenzPageHeader';
import { websitesApiService } from '@/api/websites/websites.api.service';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';

function apiError(error: unknown, fallback: string): string {
  const messageText = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return messageText || fallback;
}

const RenewalsSettingsPage = () => {
  const { t } = useTranslation('renewals');
  const navigate = useNavigate();
  const [form] = Form.useForm<{ task_lead_days: number; intervals_days: string[] }>();
  const [saving, setSaving] = useState(false);
  useDocumentTitle(t('settingsTitle', { defaultValue: 'Renewal settings' }));

  useEffect(() => {
    void websitesApiService.getSettings().then(res => {
      if (!res.done || !res.body) return;
      form.setFieldsValue({
        task_lead_days: res.body.task_lead_days,
        intervals_days: (res.body.intervals_days || []).map(String),
      });
    }).catch(error => message.error(apiError(error, t('loadFailed', { defaultValue: 'Could not load websites' }))));
  }, [form, t]);

  const onFinish = async (values: { task_lead_days: number; intervals_days: string[] }) => {
    setSaving(true);
    try {
      const intervals = values.intervals_days.map(value => Number(value)).filter(value => Number.isInteger(value));
      const res = await websitesApiService.updateSettings({
        task_lead_days: values.task_lead_days,
        intervals_days: intervals,
      });
      if (res.done) message.success(t('saved', { defaultValue: 'Saved' }));
    } catch (error) {
      message.error(apiError(error, t('saveFailed', { defaultValue: 'Could not save website' })));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex vertical gap={16} style={{ padding: 24, maxWidth: 720 }}>
      <WorklenzPageHeader
        title={t('settingsTitle', { defaultValue: 'Renewal settings' })}
        extra={<Button onClick={() => navigate('/renewals')}>{t('back', { defaultValue: 'Back' })}</Button>}
      />
      <Card>
        <Typography.Paragraph type="secondary">
          {t('settingsHelp', { defaultValue: 'Reminders go to Owner and Admin users. A task is created once per expiry, with the expiry date as the due date.' })}
        </Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ task_lead_days: 30, intervals_days: ['60', '30', '14', '7', '1', '0'] }}>
          <Form.Item
            name="task_lead_days"
            label={t('leadDays', { defaultValue: 'Create a task this many days before expiry' })}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={365} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            name="intervals_days"
            label={t('reminderDays', { defaultValue: 'Send a reminder this many days before expiry' })}
            extra={t('reminderDaysHelp', { defaultValue: 'Use 0 for the expiry day. Separate from the task lead time.' })}
            rules={[{ required: true }]}
          >
            <Select mode="tags" tokenSeparators={[',']} options={[60, 30, 14, 7, 1, 0].map(day => ({ value: String(day), label: String(day) }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>{t('save', { defaultValue: 'Save' })}</Button>
        </Form>
      </Card>
    </Flex>
  );
};

export default RenewalsSettingsPage;
