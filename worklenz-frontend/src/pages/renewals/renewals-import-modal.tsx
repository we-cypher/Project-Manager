import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import { Alert, Button, Modal, Space, Typography, Upload, message } from '@/shared/antd-imports';
import { websitesApiService } from '@/api/websites/websites.api.service';
import { IWebsiteImportFailure } from '@/types/websites/website.types';

interface RenewalsImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

function apiError(error: unknown, fallback: string): string {
  const messageText = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return messageText || fallback;
}

export const RenewalsImportModal = ({ open, onClose, onImported }: RenewalsImportModalProps) => {
  const { t } = useTranslation('renewals');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [failed, setFailed] = useState<IWebsiteImportFailure[]>([]);

  const reset = () => {
    setRows([]);
    setFileName('');
    setFailed([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const importFile = async () => {
    setImporting(true);
    setFailed([]);
    try {
      const res = await websitesApiService.importRows(rows);
      if (!res.done || !res.body) return;
      setFailed(res.body.failed || []);
      const created = res.body.created || 0;
      const updated = res.body.updated || 0;
      if (created > 0 || updated > 0) {
        message.success(t('importFinished', {
          created,
          updated,
          defaultValue: '{{created}} added, {{updated}} updated',
        }));
        onImported();
      }
      if (!res.body.failed?.length) close();
    } catch (error) {
      message.error(apiError(error, t('importFailed', { defaultValue: 'Could not import websites' })));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('importTitle', { defaultValue: 'Import websites' })}
      onCancel={close}
      okText={t('importAction', { defaultValue: 'Import' })}
      okButtonProps={{ disabled: rows.length === 0, loading: importing }}
      onOk={() => void importFile()}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t('importHelp', {
            defaultValue: 'Use the template. Managed by is wecypher or client. Dates are YYYY-MM-DD. A blank client is allowed. A domain that already exists is updated.',
          })}
        </Typography.Paragraph>
        <Button href="/renewals-websites-template.csv" download="renewals-websites-template.csv">
          {t('downloadTemplate', { defaultValue: 'Download CSV template' })}
        </Button>
        <Upload
          accept=".csv,text/csv"
          maxCount={1}
          showUploadList={false}
          beforeUpload={file => {
            const reader = new FileReader();
            reader.onload = () => {
              const parsed = Papa.parse<Record<string, string>>(String(reader.result || ''), {
                header: true,
                skipEmptyLines: true,
              });
              const nextRows = (parsed.data || []).filter(row => Object.values(row).some(value => String(value || '').trim()));
              setRows(nextRows);
              setFileName(file.name);
              setFailed([]);
              if (!nextRows.length) {
                message.error(t('importEmpty', { defaultValue: 'The CSV has no websites' }));
              }
            };
            reader.readAsText(file);
            return false;
          }}
        >
          <Button>{t('chooseCsv', { defaultValue: 'Choose CSV' })}</Button>
        </Upload>
        {fileName && (
          <Typography.Text type="secondary">
            {t('importReady', {
              fileName,
              count: rows.length,
              defaultValue: '{{fileName}}: {{count}} rows ready',
            })}
          </Typography.Text>
        )}
        {failed.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={t('importRowErrors', { defaultValue: 'Some rows were not imported' })}
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {failed.slice(0, 8).map(item => (
                  <li key={`${item.row}-${item.domain}`}>
                    {t('importRowError', {
                      row: item.row,
                      domain: item.domain || '—',
                      message: item.message,
                      defaultValue: 'Row {{row}} ({{domain}}): {{message}}',
                    })}
                  </li>
                ))}
              </ul>
            }
          />
        )}
      </Space>
    </Modal>
  );
};
