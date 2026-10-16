import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
  theme,
} from '@/shared/antd-imports';
import { DeleteOutlined, EditOutlined, PictureOutlined, PlusOutlined, SettingOutlined } from '@/shared/antd-imports';
import type { TableProps, UploadProps } from '@/shared/antd-imports';

import WorklenzPageHeader from '@/components/common/WorklenzPageHeader';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import { useAuthService } from '@/hooks/useAuth';
import {
  IProofReaderReview,
  IProofReaderResult,
  IProofReaderSubPrompt,
  proofReaderApiService,
} from '@/api/proof-reader/proof-reader.api.service';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function apiError(error: unknown, fallback: string): string {
  const messageText = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return messageText || fallback;
}

const CreativeThumb = ({ reviewId, fileName }: { reviewId: string; fileName: string }) => {
  const { t } = useTranslation('proof-reader');
  const { token } = theme.useToken();
  const [src, setSrc] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    void proofReaderApiService
      .getReviewImage(reviewId)
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reviewId]);

  const label = src
    ? t('thumbnailAlt', { defaultValue: 'Uploaded creative {{name}}', name: fileName })
    : t('imageUnavailable', { defaultValue: 'Image could not be loaded' });

  return (
    <>
      <button
        type="button"
        aria-label={label}
        disabled={!src}
        onClick={() => setIsOpen(true)}
        style={{
          width: 40,
          height: 40,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadius,
          background: token.colorFillQuaternary,
          cursor: src ? 'pointer' : 'default',
        }}
      >
        {src ? (
          <img alt="" src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <PictureOutlined style={{ color: token.colorTextSecondary }} />
        )}
      </button>
      <Modal
        open={isOpen}
        footer={null}
        width={720}
        title={fileName}
        onCancel={() => setIsOpen(false)}
      >
        {src ? (
          <img
            alt=""
            src={src}
            style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }}
          />
        ) : null}
      </Modal>
    </>
  );
};

const ReviewsTab = () => {
  const { t } = useTranslation('proof-reader');
  const navigate = useNavigate();
  const isOwnerOrAdmin = useAuthService().isOwnerOrAdmin();
  const [reviews, setReviews] = useState<IProofReaderReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(true);

  const loadReviews = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const [reviewsResponse, settingsResponse] = await Promise.all([
        proofReaderApiService.getReviews(),
        proofReaderApiService.getSettings(),
      ]);
      if (!reviewsResponse.done || !settingsResponse.done) {
        setHasError(true);
        return;
      }
      setReviews(reviewsResponse.body || []);
      setHasPrompt(Boolean(settingsResponse.body?.main_prompt?.trim()));
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const uploadCreative: UploadProps['beforeUpload'] = file => {
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      message.error(
        t('invalidFile', { defaultValue: 'Upload a PNG, JPEG, WebP, or GIF up to 8 MB.' })
      );
      return Upload.LIST_IGNORE;
    }

    setIsUploading(true);
    void proofReaderApiService
      .createReview(file)
      .then(response => {
        if (!response.done || !response.body) {
          message.error(t('uploadError', { defaultValue: 'Could not review this creative.' }));
          return;
        }
        if (response.body.status === 'failed') {
          message.error(
            response.body.error_message ||
              t('uploadError', { defaultValue: 'Could not review this creative.' })
          );
        }
        return loadReviews();
      })
      .catch(error => {
        message.error(
          apiError(error, t('uploadError', { defaultValue: 'Could not review this creative.' }))
        );
      })
      .finally(() => {
        setIsUploading(false);
      });

    return false;
  };

  const statusLabel = (status: IProofReaderReview['status']) => {
    if (status === 'completed') return t('statusCompleted', { defaultValue: 'Completed' });
    if (status === 'failed') return t('statusFailed', { defaultValue: 'Failed' });
    return t('statusPending', { defaultValue: 'Pending' });
  };

  const noteColumns: TableProps<IProofReaderResult>['columns'] = [
    {
      title: t('checkColumn', { defaultValue: 'Check' }),
      dataIndex: 'label',
      key: 'label',
      width: 220,
    },
    {
      title: t('noteColumn', { defaultValue: 'Note' }),
      dataIndex: 'note',
      key: 'note',
    },
  ];

  const columns: TableProps<IProofReaderReview>['columns'] = [
    {
      title: t('fileColumn', { defaultValue: 'Creative' }),
      key: 'image',
      width: 88,
      render: (_value, record) =>
        record.image_url ? <CreativeThumb reviewId={record.id} fileName={record.file_name} /> : null,
    },
    {
      title: t('nameColumn', { defaultValue: 'File' }),
      dataIndex: 'file_name',
      key: 'file_name',
    },
    {
      title: t('byColumn', { defaultValue: 'Uploaded by' }),
      dataIndex: 'created_by_name',
      key: 'created_by_name',
    },
    {
      title: t('dateColumn', { defaultValue: 'Date' }),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: value => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('statusColumn', { defaultValue: 'Status' }),
      key: 'status',
      width: 220,
      render: (_value, record) => (
        <Flex vertical gap={4}>
          <Tag color={record.status === 'completed' ? 'success' : record.status === 'failed' ? 'error' : 'processing'}>
            {statusLabel(record.status)}
          </Tag>
          {record.status === 'failed' && record.error_message ? (
            <Typography.Text type="danger">{record.error_message}</Typography.Text>
          ) : null}
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={16}>
      {!hasPrompt && !isLoading ? (
        <Alert
          type="warning"
          showIcon
          message={t('promptMissing', {
            defaultValue: 'Add a main prompt in Proof Reader settings before uploading.',
          })}
          action={
            isOwnerOrAdmin ? (
              <Button size="small" onClick={() => navigate('/proof-reader/settings')}>
                {t('settings', { defaultValue: 'Settings' })}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <Flex justify="flex-end">
        <Upload
          accept={ACCEPTED_TYPES.join(',')}
          showUploadList={false}
          beforeUpload={uploadCreative}
          disabled={isUploading || !hasPrompt}
        >
          <Button type="primary" icon={<PlusOutlined />} loading={isUploading} disabled={!hasPrompt}>
            {t('upload', { defaultValue: 'Upload creative' })}
          </Button>
        </Upload>
      </Flex>

      {hasError ? (
        <Flex vertical gap={12} align="flex-start">
          <Typography.Text type="danger">
            {t('loadError', { defaultValue: 'Could not load reviews.' })}
          </Typography.Text>
          <Button onClick={() => void loadReviews()}>{t('retry', { defaultValue: 'Retry' })}</Button>
        </Flex>
      ) : (
        <Table<IProofReaderReview>
          rowKey="id"
          columns={columns}
          dataSource={reviews}
          loading={isLoading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: t('emptyReviews', {
              defaultValue: 'No reviews yet. Upload a creative to start.',
            }),
          }}
          expandable={{
            rowExpandable: record => record.results.length > 0,
            expandedRowRender: record => (
              <Table<IProofReaderResult>
                rowKey="id"
                size="small"
                columns={noteColumns}
                dataSource={record.results}
                pagination={false}
                locale={{
                  emptyText: t('emptyNotes', { defaultValue: 'No notes for this review.' }),
                }}
              />
            ),
          }}
        />
      )}
    </Flex>
  );
};

interface SubPromptFormValues {
  title: string;
  prompt: string;
}

const SubPromptsTab = () => {
  const { t } = useTranslation('proof-reader');
  const [form] = Form.useForm<SubPromptFormValues>();
  const [subPrompts, setSubPrompts] = useState<IProofReaderSubPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<IProofReaderSubPrompt | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadSubPrompts = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const response = await proofReaderApiService.getSubPrompts();
      if (!response.done) {
        setHasError(true);
        return;
      }
      setSubPrompts(response.body || []);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubPrompts();
  }, [loadSubPrompts]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEdit = (subPrompt: IProofReaderSubPrompt) => {
    setEditing(subPrompt);
    form.setFieldsValue({ title: subPrompt.title, prompt: subPrompt.prompt });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const saveSubPrompt = async (values: SubPromptFormValues) => {
    setIsSaving(true);
    try {
      const response = editing
        ? await proofReaderApiService.updateSubPrompt(editing.id, {
            title: values.title,
            prompt: values.prompt,
            is_active: editing.is_active,
          })
        : await proofReaderApiService.createSubPrompt(values);
      if (!response.done) {
        message.error(t('subPromptSaveError', { defaultValue: 'Could not save the sub-prompt.' }));
        return;
      }
      message.success(t('subPromptSaved', { defaultValue: 'Sub-prompt saved' }));
      closeModal();
      await loadSubPrompts();
    } catch (error) {
      message.error(
        apiError(error, t('subPromptSaveError', { defaultValue: 'Could not save the sub-prompt.' }))
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (subPrompt: IProofReaderSubPrompt, isActive: boolean) => {
    setSavingId(subPrompt.id);
    try {
      const response = await proofReaderApiService.updateSubPrompt(subPrompt.id, {
        title: subPrompt.title,
        prompt: subPrompt.prompt,
        is_active: isActive,
      });
      if (!response.done || !response.body) {
        message.error(t('subPromptSaveError', { defaultValue: 'Could not save the sub-prompt.' }));
        return;
      }
      setSubPrompts(current =>
        current.map(item => (item.id === subPrompt.id ? response.body || item : item))
      );
    } catch (error) {
      message.error(
        apiError(error, t('subPromptSaveError', { defaultValue: 'Could not save the sub-prompt.' }))
      );
    } finally {
      setSavingId(null);
    }
  };

  const deleteSubPrompt = async (subPrompt: IProofReaderSubPrompt) => {
    setSavingId(subPrompt.id);
    try {
      const response = await proofReaderApiService.deleteSubPrompt(subPrompt.id);
      if (!response.done) {
        message.error(
          t('subPromptDeleteError', { defaultValue: 'Could not delete the sub-prompt.' })
        );
        return;
      }
      message.success(t('subPromptDeleted', { defaultValue: 'Sub-prompt deleted' }));
      setSubPrompts(current => current.filter(item => item.id !== subPrompt.id));
    } catch (error) {
      message.error(
        apiError(error, t('subPromptDeleteError', { defaultValue: 'Could not delete the sub-prompt.' }))
      );
    } finally {
      setSavingId(null);
    }
  };

  const columns: TableProps<IProofReaderSubPrompt>['columns'] = [
    {
      title: t('subPromptTitle', { defaultValue: 'Title' }),
      dataIndex: 'title',
      key: 'title',
      width: 220,
    },
    {
      title: t('subPromptText', { defaultValue: 'Prompt' }),
      dataIndex: 'prompt',
      key: 'prompt',
    },
    {
      title: t('subPromptActive', { defaultValue: 'Active' }),
      key: 'is_active',
      width: 120,
      render: (_value, record) => (
        <Switch
          checked={record.is_active}
          loading={savingId === record.id}
          aria-label={t('activeSwitchLabel', {
            defaultValue: 'Use {{title}} when reviewing',
            title: record.title,
          })}
          onChange={checked => {
            void toggleActive(record, checked);
          }}
        />
      ),
    },
    {
      title: t('actionsColumn', { defaultValue: 'Actions' }),
      key: 'actions',
      width: 120,
      render: (_value, record) => (
        <Flex gap={8}>
          <Button
            aria-label={t('editSubPrompt', { defaultValue: 'Edit sub-prompt' })}
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title={t('deleteConfirm', { defaultValue: 'Delete this sub-prompt?' })}
            okText={t('deleteSubPrompt', { defaultValue: 'Delete' })}
            cancelText={t('cancel', { defaultValue: 'Cancel' })}
            onConfirm={() => deleteSubPrompt(record)}
          >
            <Button
              aria-label={t('deleteSubPrompt', { defaultValue: 'Delete' })}
              icon={<DeleteOutlined />}
              danger
            />
          </Popconfirm>
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex justify="flex-end">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('addSubPrompt', { defaultValue: 'Add sub-prompt' })}
        </Button>
      </Flex>

      {hasError ? (
        <Flex vertical gap={12} align="flex-start">
          <Typography.Text type="danger">
            {t('subPromptLoadError', { defaultValue: 'Could not load sub-prompts.' })}
          </Typography.Text>
          <Button onClick={() => void loadSubPrompts()}>
            {t('retry', { defaultValue: 'Retry' })}
          </Button>
        </Flex>
      ) : (
        <Table<IProofReaderSubPrompt>
          rowKey="id"
          columns={columns}
          dataSource={subPrompts}
          loading={isLoading}
          scroll={{ x: 720 }}
          pagination={false}
          locale={{
            emptyText: t('emptySubPrompts', {
              defaultValue:
                'No sub-prompts yet. Add checks the model should answer for every creative.',
            }),
          }}
        />
      )}

      <Modal
        title={
          editing
            ? t('editSubPrompt', { defaultValue: 'Edit sub-prompt' })
            : t('addSubPrompt', { defaultValue: 'Add sub-prompt' })
        }
        open={isModalOpen}
        onCancel={closeModal}
        okText={t('save', { defaultValue: 'Save' })}
        cancelText={t('cancel', { defaultValue: 'Cancel' })}
        confirmLoading={isSaving}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={saveSubPrompt}>
          <Form.Item
            name="title"
            label={t('subPromptTitle', { defaultValue: 'Title' })}
            rules={[{ required: true, message: t('titleRequired', { defaultValue: 'Enter a title' }) }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="prompt"
            label={t('subPromptText', { defaultValue: 'Prompt' })}
            rules={[{ required: true, message: t('promptRequired', { defaultValue: 'Enter a prompt' }) }]}
          >
            <Input.TextArea rows={4} maxLength={4000} />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
};

const ProofReaderPage = () => {
  const { t } = useTranslation('proof-reader');
  const navigate = useNavigate();
  const isOwnerOrAdmin = useAuthService().isOwnerOrAdmin();
  useDocumentTitle(t('pageTitle', { defaultValue: 'Proof Reader' }));

  return (
    <Flex vertical gap={16} style={{ padding: 24 }}>
      <WorklenzPageHeader
        title={t('pageTitle', { defaultValue: 'Proof Reader' })}
        extra={
          isOwnerOrAdmin ? (
            <Button icon={<SettingOutlined />} onClick={() => navigate('/proof-reader/settings')}>
              {t('settings', { defaultValue: 'Settings' })}
            </Button>
          ) : null
        }
      />
      <Tabs
        items={[
          {
            key: 'reviews',
            label: t('reviewsTab', { defaultValue: 'Reviews' }),
            children: <ReviewsTab />,
          },
          {
            key: 'sub-prompts',
            label: t('subPromptsTab', { defaultValue: 'Sub-prompts' }),
            children: <SubPromptsTab />,
          },
        ]}
      />
    </Flex>
  );
};

export default ProofReaderPage;
