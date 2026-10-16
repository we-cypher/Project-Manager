import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Flex, Form, Input, Typography, message } from '@/shared/antd-imports';

import WorklenzPageHeader from '@/components/common/WorklenzPageHeader';
import { proofReaderApiService } from '@/api/proof-reader/proof-reader.api.service';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';

function apiError(error: unknown, fallback: string): string {
  const messageText = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return messageText || fallback;
}

const ProofReaderSettingsPage = () => {
  const { t } = useTranslation('proof-reader');
  const navigate = useNavigate();
  const [form] = Form.useForm<{ main_prompt: string }>();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  useDocumentTitle(t('settingsTitle', { defaultValue: 'Proof Reader settings' }));

  const loadSettings = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const response = await proofReaderApiService.getSettings();
      if (!response.done || !response.body) {
        setHasError(true);
        return;
      }
      form.setFieldsValue({ main_prompt: response.body.main_prompt });
    } catch (error) {
      setHasError(true);
      message.error(
        apiError(error, t('settingsLoadFailed', { defaultValue: 'Could not load the prompt.' }))
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, [form]);

  const onFinish = async (values: { main_prompt: string }) => {
    setIsSaving(true);
    try {
      const response = await proofReaderApiService.updateSettings(values.main_prompt);
      if (response.done) message.success(t('saved', { defaultValue: 'Saved' }));
    } catch (error) {
      message.error(apiError(error, t('saveFailed', { defaultValue: 'Could not save the prompt.' })));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Flex vertical gap={16} style={{ padding: 24, maxWidth: 720 }}>
      <WorklenzPageHeader
        title={t('settingsTitle', { defaultValue: 'Proof Reader settings' })}
        extra={
          <Button onClick={() => navigate('/proof-reader')}>
            {t('back', { defaultValue: 'Back' })}
          </Button>
        }
      />
      <Card loading={isLoading}>
        {hasError ? (
          <Flex vertical gap={12} align="flex-start">
            <Typography.Text type="danger">
              {t('settingsLoadFailed', { defaultValue: 'Could not load the prompt.' })}
            </Typography.Text>
            <Button onClick={() => void loadSettings()}>{t('retry', { defaultValue: 'Retry' })}</Button>
          </Flex>
        ) : (
          <>
            <Typography.Paragraph type="secondary">
              {t('settingsHelp', {
                defaultValue:
                  'This prompt is sent with every creative, along with the active sub-prompts.',
              })}
            </Typography.Paragraph>
            <Form form={form} layout="vertical" onFinish={onFinish}>
              <Form.Item
                name="main_prompt"
                label={t('mainPrompt', { defaultValue: 'Main prompt' })}
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: t('mainPromptRequired', { defaultValue: 'Enter the main prompt' }),
                  },
                ]}
              >
                <Input.TextArea rows={8} maxLength={8000} />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={isSaving}>
                {t('save', { defaultValue: 'Save' })}
              </Button>
            </Form>
          </>
        )}
      </Card>
    </Flex>
  );
};

export default ProofReaderSettingsPage;
