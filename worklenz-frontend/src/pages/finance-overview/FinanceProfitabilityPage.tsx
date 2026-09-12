import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Card,
    Col,
    Empty,
    Flex,
    Row,
    Skeleton,
    Table,
    Tag,
    Tooltip,
    Typography,
    theme,
    InfoCircleOutlined,
} from '@/shared/antd-imports';
import type { ColumnsType } from 'antd/es/table';
import { financeOverviewApiService } from '@/api/finance-overview/finance-overview.api.service';

const { Text } = Typography;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProfitProject {
    id: string;
    name: string;
    color_code: string;
    client_name: string | null;
    revenue: number;
    currency: string;
    fixed_cost: number;
    time_based_cost: number;
    total_cost: number;
    profit: number;
    margin_pct: number;
}

interface ProfitTotals {
    total_revenue: number;
    total_cost: number;
    total_profit: number;
    margin_pct: number;
}

interface ProfitResponse {
    projects: ProfitProject[];
    totals: ProfitTotals;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (value: number): string =>
    new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);

const fmtFull = (value: number): string =>
    new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);

const marginColor = (pct: number): string => {
    if (pct >= 30) return 'green';
    if (pct >= 10) return 'blue';
    if (pct >= 0) return 'orange';
    return 'red';
};

// ─── KPI Card ───────────────────────────────────────────────────────────────

interface KpiCardProps {
    title: string;
    value: string;
    valueColor: string;
    loading: boolean;
    sign?: string;
    suffix?: string;
    tooltip?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, valueColor, loading, sign, suffix, tooltip }) => (
    <Card size="small" loading={loading} style={{ height: '100%' }}>
        <Flex align="center" gap={4} style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
            {tooltip && (
                <Tooltip title={tooltip}>
                    <InfoCircleOutlined style={{ fontSize: 11, color: '#faad14', cursor: 'pointer' }} />
                </Tooltip>
            )}
        </Flex>
        <div style={{ fontSize: 20, fontWeight: 600, color: valueColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sign ?? ''}{value}{suffix ?? ''}
        </div>
    </Card>
);

// ─── Page ───────────────────────────────────────────────────────────────────

export const FinanceProfitabilityPage: React.FC = () => {
    const { t } = useTranslation('finance-profitability');
    const { token } = theme.useToken();

    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<ProfitProject[]>([]);
    const [totals, setTotals] = useState<ProfitTotals | null>(null);

    useEffect(() => {
        setLoading(true);
        financeOverviewApiService.getProfitability()
            .then(res => {
                if (res.done && res.body) {
                    const data = res.body as ProfitResponse;
                    setProjects(data.projects ?? []);
                    setTotals(data.totals ?? null);
                }
            })
            .catch(() => { /* handled by empty state */ })
            .finally(() => setLoading(false));
    }, []);

    const profit = totals?.total_profit ?? 0;

    const columns: ColumnsType<ProfitProject> = useMemo(() => [
        {
            title: t('table.project', { defaultValue: 'Project' }),
            dataIndex: 'name',
            key: 'name',
            width: 200,
            render: (name: string, record) => (
                <Flex align="center" gap={8} style={{ minWidth: 0 }}>
                    <span style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                        backgroundColor: record.color_code || token.colorPrimary, flexShrink: 0,
                    }} />
                    <Tooltip title={name}>
                        <Text style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170, display: 'block' }}>
                            {name}
                        </Text>
                    </Tooltip>
                </Flex>
            ),
        },
        {
            title: t('table.client', { defaultValue: 'Client' }),
            dataIndex: 'client_name',
            key: 'client_name',
            width: 130,
            render: (v: string | null) =>
                v ? (
                    <Tooltip title={v}>
                        <Text style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110, display: 'block' }}>
                            {v}
                        </Text>
                    </Tooltip>
                ) : <Text type="secondary">—</Text>,
        },
        {
            title: t('table.revenue', { defaultValue: 'Revenue (Budget)' }),
            dataIndex: 'revenue',
            key: 'revenue',
            width: 140,
            render: (v: number) =>
                v > 0
                    ? <Text>{fmtFull(v)}</Text>
                    : <Text type="secondary" style={{ fontSize: 12 }}>{t('noBudgetSet', { defaultValue: 'No budget set' })}</Text>,
        },
        {
            title: t('table.cost', { defaultValue: 'Cost' }),
            dataIndex: 'total_cost',
            key: 'total_cost',
            width: 120,
            render: (v: number) => <Text>{fmtFull(v)}</Text>,
        },
        {
            title: t('table.profit', { defaultValue: 'Profit' }),
            dataIndex: 'profit',
            key: 'profit',
            width: 130,
            render: (v: number) => {
                const color = v < 0 ? '#ff4d4f' : v > 0 ? '#52c41a' : token.colorTextSecondary;
                const sign = v < 0 ? '- ' : v > 0 ? '+ ' : '';
                return (
                    <Text strong style={{ color, fontWeight: 600 }}>
                        {sign}{fmtFull(Math.abs(v))}
                    </Text>
                );
            },
        },
        {
            title: t('table.margin', { defaultValue: 'Margin %' }),
            dataIndex: 'margin_pct',
            key: 'margin_pct',
            width: 110,
            render: (pct: number) => (
                <Tag color={marginColor(pct)} style={{ fontWeight: 500 }}>
                    {pct >= 0 ? '+' : ''}{pct}%
                </Tag>
            ),
        },
    ], [t, token]);

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <Flex vertical gap={16}>

            {/* Page header */}
            <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    {t('pageTitle', { defaultValue: 'Profitability' })}
                </Typography.Title>
                <Text type="secondary" style={{ fontSize: 13, marginTop: 2, display: 'block' }}>
                    {t('pageSubTitle', { defaultValue: 'Analyze project profitability and margins across your portfolio.' })}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block', fontStyle: 'italic' }}>
                    <InfoCircleOutlined style={{ marginRight: 4 }} />
                    {t('revenueNote', { defaultValue: 'Revenue is calculated from project budgets. Set project budgets to see profitability data.' })}
                </Text>
            </div>

            {/* KPI Cards */}
            {loading ? (
                <Row gutter={[12, 12]}>
                    {[1, 2, 3, 4].map(i => (
                        <Col xs={24} sm={12} lg={6} key={i}>
                            <Card size="small"><Skeleton active paragraph={{ rows: 1 }} /></Card>
                        </Col>
                    ))}
                </Row>
            ) : (
                <Row gutter={[12, 12]}>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.totalRevenue', { defaultValue: 'Total Revenue' })}
                            value={totals ? fmt(totals.total_revenue) : '—'}
                            valueColor={token.colorPrimary}
                            loading={false}
                            tooltip={t('kpi.revenueTooltip', { defaultValue: 'Sum of all project budgets' })}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.totalCost', { defaultValue: 'Total Cost' })}
                            value={totals ? fmt(totals.total_cost) : '—'}
                            valueColor="#faad14"
                            loading={false}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.totalProfit', { defaultValue: 'Total Profit' })}
                            value={totals ? fmt(Math.abs(profit)) : '—'}
                            sign={profit < 0 ? '- ' : profit > 0 ? '+ ' : ''}
                            valueColor={profit < 0 ? '#ff4d4f' : profit > 0 ? '#52c41a' : token.colorTextSecondary}
                            loading={false}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.overallMargin', { defaultValue: 'Overall Margin' })}
                            value={totals ? String(totals.margin_pct) : '0'}
                            suffix="%"
                            valueColor={totals && totals.margin_pct >= 0 ? '#52c41a' : '#ff4d4f'}
                            loading={false}
                        />
                    </Col>
                </Row>
            )}

            {/* Table */}
            <Card
                title={
                    <Text strong style={{ fontSize: 15 }}>
                        {t('tableTitle', { defaultValue: 'Project Profitability' })}
                    </Text>
                }
                styles={{ header: { padding: '12px 24px', minHeight: 56 } }}
            >
                {loading ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                ) : projects.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('emptyState', { defaultValue: 'No profitability data available. Set project budgets to see profitability metrics.' })}
                    />
                ) : (
                    <Table<ProfitProject>
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
                        scroll={{ x: 850 }}
                    />
                )}
            </Card>

        </Flex>
    );
};

export default FinanceProfitabilityPage;
