import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Avatar,
    Card,
    Col,
    Empty,
    Flex,
    Row,
    Skeleton,
    Statistic,
    Table,
    Typography,
    Progress,
    Tag,
    theme,
} from '@/shared/antd-imports';
import type { ColumnsType } from 'antd/es/table';
import { financeOverviewApiService } from '@/api/finance-overview/finance-overview.api.service';

const { Text } = Typography;

// ─── Types ───────────────────────────────────────────────────────────────────

interface UtilizationMember {
    member_id: string;
    member_name: string;
    avatar_url: string | null;
    job_title: string | null;
    total_hours: number;
    billable_hours: number;
    non_billable_hours: number;
    billable_pct: number;
    project_count: number;
    total_cost: number;
    total_logged_seconds: number;
    billable_seconds: number;
    non_billable_seconds: number;
}

interface UtilizationTotals {
    total_hours: number;
    billable_hours: number;
    non_billable_hours: number;
    billable_pct: number;
    total_cost: number;
    member_count: number;
}

interface UtilizationData {
    members: UtilizationMember[];
    totals: UtilizationTotals;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtHours = (v: number): string =>
    `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v)}h`;

const fmtCompact = (v: number): string =>
    new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

const billableRateColor = (pct: number): string => {
    if (pct >= 70) return '#52c41a';
    if (pct >= 50) return '#faad14';
    return '#ff4d4f';
};

const AVATAR_COLORS = [
    '#1890ff', '#52c41a', '#722ed1', '#eb2f96', '#fa8c16',
    '#13c2c2', '#2f54eb', '#faad14', '#a0d911', '#f5222d',
];

const avatarColor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// ─── Page ────────────────────────────────────────────────────────────────────

export const FinanceUtilizationPage: React.FC = () => {
    const { t } = useTranslation('finance-utilization');
    const { token } = theme.useToken();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<UtilizationData | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        financeOverviewApiService.getUtilization()
            .then(res => {
                if (!cancelled && res.done) {
                    setData(res.body as UtilizationData);
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const totals = data?.totals;
    const members = data?.members ?? [];

    // ── Table columns ─────────────────────────────────────────────────────
    const columns: ColumnsType<UtilizationMember> = [
        {
            title: t('table.member', { defaultValue: 'Member' }),
            key: 'member',
            width: 220,
            render: (_: unknown, record) => (
                <Flex align="center" gap={10} style={{ minWidth: 0 }}>
                    <Avatar
                        size={28}
                        src={record.avatar_url || undefined}
                        style={{
                            backgroundColor: record.avatar_url ? undefined : avatarColor(record.member_name),
                            flexShrink: 0,
                            fontSize: 13,
                        }}
                    >
                        {record.member_name?.charAt(0)?.toUpperCase()}
                    </Avatar>
                    <Text style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170, display: 'block' }}>
                        {record.member_name}
                    </Text>
                </Flex>
            ),
        },
        {
            title: t('table.jobTitle', { defaultValue: 'Job Title' }),
            dataIndex: 'job_title',
            key: 'job_title',
            width: 150,
            render: (v: string | null) =>
                v
                    ? <Text style={{ fontSize: 13 }}>{v}</Text>
                    : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
        },
        {
            title: t('table.totalHours', { defaultValue: 'Total Hours' }),
            dataIndex: 'total_hours',
            key: 'total_hours',
            width: 120,
            align: 'right',
            render: (v: number) => fmtHours(v),
            sorter: (a, b) => a.total_hours - b.total_hours,
        },
        {
            title: t('table.billableHours', { defaultValue: 'Billable Hours' }),
            dataIndex: 'billable_hours',
            key: 'billable_hours',
            width: 130,
            align: 'right',
            render: (v: number) => <Text strong style={{ color: '#52c41a' }}>{fmtHours(v)}</Text>,
            sorter: (a, b) => a.billable_hours - b.billable_hours,
        },
        {
            title: t('table.nonBillableHours', { defaultValue: 'Non-Billable Hours' }),
            dataIndex: 'non_billable_hours',
            key: 'non_billable_hours',
            width: 150,
            align: 'right',
            render: (v: number) => <Text type="secondary">{fmtHours(v)}</Text>,
            sorter: (a, b) => a.non_billable_hours - b.non_billable_hours,
        },
        {
            title: t('table.billablePct', { defaultValue: 'Billable %' }),
            dataIndex: 'billable_pct',
            key: 'billable_pct',
            width: 160,
            render: (pct: number) => (
                <Flex align="center" gap={8}>
                    <Progress
                        percent={Math.round(pct)}
                        size="small"
                        strokeColor={billableRateColor(pct)}
                        showInfo={false}
                        style={{ flex: 1, margin: 0 }}
                    />
                    <Text style={{ fontSize: 12, minWidth: 36, textAlign: 'right', color: billableRateColor(pct) }}>
                        {Math.round(pct)}%
                    </Text>
                </Flex>
            ),
            sorter: (a, b) => a.billable_pct - b.billable_pct,
        },
        {
            title: t('table.projects', { defaultValue: 'Projects' }),
            dataIndex: 'project_count',
            key: 'project_count',
            width: 100,
            align: 'center',
            render: (v: number) => <Tag>{v}</Tag>,
            sorter: (a, b) => a.project_count - b.project_count,
        },
        {
            title: t('table.cost', { defaultValue: 'Cost' }),
            dataIndex: 'total_cost',
            key: 'total_cost',
            width: 120,
            align: 'right',
            render: (v: number) => <Text strong>{fmtCompact(v)}</Text>,
            sorter: (a, b) => a.total_cost - b.total_cost,
        },
    ];

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <Flex vertical gap={16}>
            {/* Page header */}
            <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    {t('pageTitle', { defaultValue: 'Team Utilization' })}
                </Typography.Title>
                <Text type="secondary" style={{ fontSize: 13, marginTop: 2, display: 'block' }}>
                    {t('pageSubTitle', { defaultValue: 'Monitor team member productivity and billable utilization' })}
                </Text>
            </div>

            {/* KPI Cards */}
            <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small" loading={loading} style={{ height: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('kpi.teamMembers', { defaultValue: 'Team Members' })}
                        </Text>
                        <Statistic
                            value={totals?.member_count ?? 0}
                            valueStyle={{ color: token.colorPrimary, fontSize: 20, fontWeight: 600 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small" loading={loading} style={{ height: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('kpi.totalLoggedHours', { defaultValue: 'Total Logged Hours' })}
                        </Text>
                        <Statistic
                            value={totals?.total_hours ?? 0}
                            precision={1}
                            suffix="h"
                            valueStyle={{ color: '#722ed1', fontSize: 20, fontWeight: 600 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small" loading={loading} style={{ height: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('kpi.billableRate', { defaultValue: 'Billable Rate' })}
                        </Text>
                        <Statistic
                            value={totals?.billable_pct ?? 0}
                            precision={0}
                            suffix="%"
                            valueStyle={{
                                color: billableRateColor(totals?.billable_pct ?? 0),
                                fontSize: 20,
                                fontWeight: 600,
                            }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small" loading={loading} style={{ height: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('kpi.totalLaborCost', { defaultValue: 'Total Labor Cost' })}
                        </Text>
                        <Statistic
                            value={totals?.total_cost ?? 0}
                            formatter={v => fmtCompact(Number(v))}
                            valueStyle={{ color: '#52c41a', fontSize: 20, fontWeight: 600 }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Members Table */}
            <Card
                title={
                    <Text strong style={{ fontSize: 15 }}>
                        {t('tableCard.title', { defaultValue: 'Team Members' })}
                    </Text>
                }
                styles={{ header: { padding: '12px 24px', minHeight: 56 } }}
            >
                {loading ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                ) : members.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('emptyState', { defaultValue: 'No utilization data available' })}
                    />
                ) : (
                    <Table<UtilizationMember>
                        rowKey="member_id"
                        dataSource={members}
                        columns={columns}
                        size="small"
                        pagination={{
                            defaultPageSize: 10,
                            pageSizeOptions: ['5', '10', '20', '50'],
                            showSizeChanger: true,
                            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
                        }}
                        scroll={{ x: 1050 }}
                    />
                )}
            </Card>
        </Flex>
    );
};

export default FinanceUtilizationPage;
