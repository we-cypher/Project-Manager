import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Flex, Input, Switch, Table, Typography, message } from '@/shared/antd-imports';
import type { TableProps } from '@/shared/antd-imports';
import { SearchOutlined } from '@/shared/antd-imports';
import { useTranslation } from 'react-i18next';

import {
  IProofReaderAccessMember,
  proofReaderApiService,
} from '@/api/proof-reader/proof-reader.api.service';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';

const ProofReaderAccessSettings = () => {
  const { t } = useTranslation('settings/proof-reader-access');
  useDocumentTitle(t('pageTitle', { defaultValue: 'Proof Reader access' }));

  const [members, setMembers] = useState<IProofReaderAccessMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const response = await proofReaderApiService.getAccessMembers();
      if (!response.done) {
        setHasError(true);
        return;
      }
      setMembers(response.body || []);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const toggleAccess = async (member: IProofReaderAccessMember, granted: boolean) => {
    const nextIds = members
      .filter(item => !item.always_allowed)
      .filter(item => (item.user_id === member.user_id ? granted : item.granted))
      .map(item => item.user_id);

    setSavingUserId(member.user_id);
    try {
      const response = await proofReaderApiService.updateAccess(nextIds);
      if (!response.done) {
        message.error(t('saveError', { defaultValue: 'Could not update Proof Reader access.' }));
        return;
      }
      setMembers(response.body || []);
    } catch {
      message.error(t('saveError', { defaultValue: 'Could not update Proof Reader access.' }));
    } finally {
      setSavingUserId(null);
    }
  };

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return members;
    return members.filter(member =>
      [member.name, member.email, member.role_name].some(value => value?.toLowerCase().includes(query))
    );
  }, [members, searchQuery]);

  const columns: TableProps<IProofReaderAccessMember>['columns'] = [
    {
      title: t('nameColumn', { defaultValue: 'Name' }),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('emailColumn', { defaultValue: 'Email' }),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('roleColumn', { defaultValue: 'Role' }),
      dataIndex: 'role_name',
      key: 'role_name',
    },
    {
      title: t('accessColumn', { defaultValue: 'Proof Reader access' }),
      key: 'granted',
      width: 180,
      render: (_value, member) => (
        <Switch
          checked={member.always_allowed || member.granted}
          disabled={member.always_allowed || savingUserId === member.user_id}
          loading={savingUserId === member.user_id}
          aria-label={t('accessSwitchLabel', {
            defaultValue: 'Proof Reader access for {{name}}',
            name: member.name,
          })}
          onChange={checked => {
            void toggleAccess(member, checked);
          }}
        />
      ),
    },
  ];

  return (
    <Card style={{ width: '100%' }}>
      <Flex vertical gap={16}>
        <Flex justify="space-between" gap={16} wrap="wrap">
          <Flex vertical gap={4} style={{ maxWidth: 640 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {t('pageTitle', { defaultValue: 'Proof Reader access' })}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t('description', {
                defaultValue:
                  'Owners and admins always see Proof Reader. Turn it on for other people who should review creatives.',
              })}
            </Typography.Text>
          </Flex>
          <Input
            allowClear
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder={t('searchPlaceholder', { defaultValue: 'Search people' })}
            prefix={<SearchOutlined />}
            style={{ maxWidth: 280 }}
            aria-label={t('searchPlaceholder', { defaultValue: 'Search people' })}
          />
        </Flex>

        {hasError ? (
          <Flex vertical gap={12} align="flex-start">
            <Typography.Text type="danger">
              {t('loadError', { defaultValue: 'Could not load Proof Reader access.' })}
            </Typography.Text>
            <Button onClick={() => void loadMembers()}>{t('retry', { defaultValue: 'Retry' })}</Button>
          </Flex>
        ) : (
          <Table<IProofReaderAccessMember>
            rowKey="user_id"
            columns={columns}
            dataSource={filteredMembers}
            loading={isLoading}
            pagination={false}
            locale={{
              emptyText: t('empty', { defaultValue: 'No team members found.' }),
            }}
          />
        )}
      </Flex>
    </Card>
  );
};

export default ProofReaderAccessSettings;
