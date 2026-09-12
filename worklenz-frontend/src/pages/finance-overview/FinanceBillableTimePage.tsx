import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
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
    Badge,
    theme,
} from '@/shared/antd-imports';
import type { ColumnsType } from 'antd/es/table';
import { financeOverviewApiService } from '@/api/finance-overview/finance-overview.api.service';

const { Text } = Typography;

// ─── Types ───────────────────────────────────────────────────────────────────

interface BillableProject {
    id: string;
    name: string;
    color_code: string;
    currency: string;
    billable_hours: number;
    non_billable_hours: number;
    total_hours: number;
    billable_pct: number;
    billable_cost: number;
    non_billable_cost: number;
    billable_seconds: number;
    non_billable_seconds: number;
    total_seconds: number;
}

interface BillableTotals {
    billable_hours: number;
    non_billable_hours: number;
    total_hours: number;
    billable_pct: number;
    billable_cost: number;
    non_billable_cost: number;
}

interface BillableTimeData {
    projects: BillableProject[];
    totals: BillableTotals;
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

// ─── Page ────────────────────────────────────────────────────────────────────

export const FinanceBillableTimePage: React.FC = () => {
    const { t } = useTranslation('finance-billable-time');
    const { token } = theme.useToken();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<BillableTimeData | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        financeOverviewApiService.getBillableTime()
            .then(res => {
                if (!cancelled && res.done) {
                    setData(res.body as BillableTimeData);
                }
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const totals = data?.totals;
    const projects = data?.projects ?? [];

    // ── Table columns ─────────────────────────────────────────────────────
    const columns: ColumnsType<BillableProject> = [
        {
            title: t('table.project', { defaultValue: 'Project' }),
            dataIndex: 'name',
            key: 'name',
            width: 220,
            render: (name: string, record) => (
                <Flex align="center" gap={8} style={{ minWidth: 0 }}>
                    <span style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                        backgroundColor: record.color_code || token.colorPrimary, flexShrink: 0,
                    }} />
                    <Text style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190, display: 'block' }}>
                        {name}
                    </Text>
                </Flex>
            ),
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
            title: t('table.totalHours', { defaultValue: 'Total Hours' }),
            dataIndex: 'total_hours',
            key: 'total_hours',
            width: 120,
            align: 'right',
            render: (v: number) => fmtHours(v),
            sorter: (a, b) => a.total_hours - b.total_hours,
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
                        strokeColor="#52c41a"
                        showInfo={false}
                        style={{ flex: 1, margin: 0 }}
                    />
                    <Text style={{ fontSize: 12, minWidth: 36, textAlign: 'right' }}>{Math.round(pct)}%</Text>
                </Flex>
            ),
            sorter: (a, b) => a.billable_pct - b.billable_pct,
        },
        {
            title: t('table.billableCost', { defaultValue: 'Billable Cost' }),
            dataIndex: 'billable_cost',
            key: 'billable_cost',
            width: 130,
            align: 'right',
            render: (v: number, record) => (
                <Text strong>{record.currency?.toUpperCase() || 'USD'} {fmtCompact(v)}</Text>
            ),
            sorter: (a, b) => a.billable_cost - b.billable_cost,
        },
    ];

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <Flex vertical gap={16}>
            {/* Page header */}
            <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    {t('pageTitle', { defaultValue: 'Billable Time' })}
                </Typography.Title>
                <Text type="secondary" style={{ fontSize: 13, marginTop: 2, display: 'block' }}>
                    {t('pageSubTitle', { defaultValue: 'Track billable and non-billable hours across projects' })}
                </Text>
            </div>

            {/* KPI Cards */}
            <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small" loading={loading} style={{ height: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('kpi.totalHours', { defaultValue: 'Total Hours' })}
                        </Text>
                        <Statistic
                            value={totals?.total_hours ?? 0}
                            precision={1}
                            suffix="h"
                            valueStyle={{ color: token.colorPrimary, fontSize: 20, fontWeight: 600 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small" loading={loading} style={{ height: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('kpi.billableHours', { defaultValue: 'Billable Hours' })}
                        </Text>
                        <Statistic
                            value={totals?.billable_hours ?? 0}
                            precision={1}
                            suffix="h"
                            valueStyle={{ color: '#52c41a', fontSize: 20, fontWeight: 600 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card size="small" loading={loading} style={{ height: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('kpi.nonBillableHours', { defaultValue: 'Non-Billable Hours' })}
                        </Text>
                        <Statistic
                            value={totals?.non_billable_hours ?? 0}
                            precision={1}
                            suffix="h"
                            valueStyle={{ color: '#faad14', fontSize: 20, fontWeight: 600 }}
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
            </Row>

            {/* Cost Breakdown */}
            <Card size="small" loading={loading}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    {t('costBreakdown.title', { defaultValue: 'Cost Breakdown' })}
                </Text>
                <Flex gap={24} align="center" wrap="wrap">
                    <Flex align="center" gap={8}>
                        <Badge color="#52c41a" />
                        <Text style={{ fontSize: 13 }}>
                            {t('costBreakdown.billable', { defaultValue: 'Billable' })}:
                        </Text>
                        <Text strong style={{ fontSize: 16, color: '#52c41a' }}>
                            {fmtCompact(totals?.billable_cost ?? 0)}
                        </Text>
                    </Flex>
                    <Flex align="center" gap={8}>
                        <Badge color="#faad14" />
                        <Text style={{ fontSize: 13 }}>
                            {t('costBreakdown.nonBillable', { defaultValue: 'Non-Billable' })}:
                        </Text>
                        <Text strong style={{ fontSize: 16, color: '#faad14' }}>
                            {fmtCompact(totals?.non_billable_cost ?? 0)}
                        </Text>
                    </Flex>
                    {totals && (totals.billable_cost + totals.non_billable_cost) > 0 && (
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <Flex style={{ height: 12, borderRadius: 6, overflow: 'hidden' }}>
                                <div style={{
                                    width: `${(totals.billable_cost / (totals.billable_cost + totals.non_billable_cost)) * 100}%`,
                                    backgroundColor: '#52c41a',
                                    transition: 'width 0.3s',
                                }} />
                                <div style={{
                                    flex: 1,
                                    backgroundColor: '#faad14',
                                    transition: 'width 0.3s',
                                }} />
                            </Flex>
                        </div>
                    )}
                </Flex>
            </Card>

            {/* Projects Table */}
            <Card
                title={
                    <Text strong style={{ fontSize: 15 }}>
                        {t('tableCard.title', { defaultValue: 'Projects' })}
                    </Text>
                }
                styles={{ header: { padding: '12px 24px', minHeight: 56 } }}
            >
                {loading ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                ) : projects.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('emptyState', { defaultValue: 'No billable time data available' })}
                    />
                ) : (
                    <Table<BillableProject>
                        rowKey="id"
                        dataSource={projects}
                        columns={columns}
                        size="small"
                        pagination={{
                            defaultPageSize: 10,
                            pageSizeOptions: ['5', '10', '20', '50'],
                            showSizeChanger: true,
                            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
                        }}
                        scroll={{ x: 900 }}
                    />
                )}
            </Card>
        </Flex>
    );
};

export default FinanceBillableTimePage;
