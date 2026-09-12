import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Alert,
    Badge,
    Card,
    Col,
    Empty,
    Flex,
    Progress,
    Row,
    Skeleton,
    Statistic,
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface IForecastProject {
    id: string;
    name: string;
    color_code: string;
    client_name: string | null;
    budget: number;
    currency: string;
    actual_cost: number;
    remaining_budget: number;
    completion_pct: number;
    logged_hours: number;
    estimated_hours: number;
    daily_burn_rate: number;
    days_remaining_at_rate: number | null;
    estimated_total_cost: number;
    projected_overrun: number;
    start_date: string;
    end_date: string;
}

interface IForecastTotals {
    total_budget: number;
    total_actual: number;
    total_remaining: number;
    total_estimated: number;
    total_overrun: number;
}

interface IForecastResponse {
    projects: IForecastProject[];
    totals: IForecastTotals;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (value: number, currency: string = 'USD'): string =>
    `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        notation: 'compact',
    }).format(value)}`;

const fmtFull = (value: number, currency: string = 'USD'): string =>
    `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)}`;

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
    title: string;
    value: string;
    valueColor: string;
    loading: boolean;
    sign?: string;
    tooltip?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, valueColor, loading, sign, tooltip }) => (
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
            {sign ?? ''}{value}
        </div>
    </Card>
);

// ─── Page ────────────────────────────────────────────────────────────────────

export const FinanceForecastsPage = () => {
    const { t } = useTranslation('finance-forecasts');
    const { token } = theme.useToken();

    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<IForecastProject[]>([]);
    const [totals, setTotals] = useState<IForecastTotals | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        financeOverviewApiService.getForecasts()
            .then(res => {
                if (cancelled) return;
                if (res.done && res.body) {
                    const data = res.body as IForecastResponse;
                    setProjects(data.projects ?? []);
                    setTotals(data.totals ?? null);
                }
            })
            .catch(() => { /* handled by empty state */ })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // ── Table columns ─────────────────────────────────────────────────────
    const columns: ColumnsType<IForecastProject> = [
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
            title: t('table.budget', { defaultValue: 'Budget' }),
            dataIndex: 'budget',
            key: 'budget',
            width: 140,
            render: (v: number, record) =>
                v > 0
                    ? fmtFull(v, record.currency)
                    : <Text type="secondary" style={{ fontSize: 12 }}>{t('noBudgetSet', { defaultValue: 'No budget set' })}</Text>,
        },
        {
            title: t('table.spent', { defaultValue: 'Spent' }),
            dataIndex: 'actual_cost',
            key: 'actual_cost',
            width: 130,
            render: (v: number, record) => fmtFull(v, record.currency),
        },
        {
            title: t('table.dailyBurnRate', { defaultValue: 'Daily Burn Rate' }),
            dataIndex: 'daily_burn_rate',
            key: 'daily_burn_rate',
            width: 150,
            render: (v: number, record) => (
                <Text>{fmtFull(v, record.currency)}{t('table.perDay', { defaultValue: '/day' })}</Text>
            ),
        },
        {
            title: t('table.completion', { defaultValue: 'Completion %' }),
            dataIndex: 'completion_pct',
            key: 'completion_pct',
            width: 150,
            render: (v: number) => (
                <Progress
                    percent={Math.round(v)}
                    size="small"
                    strokeColor={v >= 100 ? token.colorSuccess : v >= 70 ? token.colorPrimary : token.colorWarning}
                />
            ),
        },
        {
            title: t('table.estTotalCost', { defaultValue: 'Est. Total Cost' }),
            dataIndex: 'estimated_total_cost',
            key: 'estimated_total_cost',
            width: 150,
            render: (v: number, record) => {
                const isOverBudget = record.budget > 0 && v > record.budget;
                return (
                    <Text style={{ color: isOverBudget ? token.colorError : token.colorText, fontWeight: isOverBudget ? 600 : 400 }}>
                        {fmtFull(v, record.currency)}
                    </Text>
                );
            },
        },
        {
            title: t('table.projectedOverrun', { defaultValue: 'Projected Overrun' }),
            dataIndex: 'projected_overrun',
            key: 'projected_overrun',
            width: 160,
            render: (v: number, record) => {
                if (record.budget === 0) return <Text type="secondary">—</Text>;
                const isOver = v > 0;
                const isUnder = v < 0;
                return (
                    <Tag
                        color={isOver ? 'error' : isUnder ? 'success' : 'default'}
                        style={{ fontWeight: 600 }}
                    >
                        {isOver ? '+' : ''}{fmtFull(v, record.currency)}
                    </Tag>
                );
            },
        },
        {
            title: t('table.daysRemaining', { defaultValue: 'Days Remaining' }),
            dataIndex: 'days_remaining_at_rate',
            key: 'days_remaining_at_rate',
            width: 140,
            render: (v: number | null) =>
                v !== null
                    ? <Text>{Math.round(v)} {t('table.days', { defaultValue: 'days' })}</Text>
                    : <Text type="secondary">{t('table.notAvailable', { defaultValue: 'N/A' })}</Text>,
        },
    ];

    // ── Render ────────────────────────────────────────────────────────────
    const overrun = totals?.total_overrun ?? 0;
    const isOverBudget = overrun > 0;
    const isUnderBudget = overrun < 0;

    return (
        <Flex vertical gap={16}>

            {/* Page header */}
            <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    {t('pageTitle', { defaultValue: 'Financial Forecasts' })}
                </Typography.Title>
                <Text type="secondary" style={{ fontSize: 13, marginTop: 2, display: 'block' }}>
                    {t('pageSubTitle', { defaultValue: 'Projected costs and budget forecasts based on current burn rates' })}
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
                            title={t('kpi.totalBudget', { defaultValue: 'Total Budget' })}
                            value={totals ? fmt(totals.total_budget) : '—'}
                            valueColor={token.colorPrimary}
                            loading={false}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.totalSpent', { defaultValue: 'Total Spent' })}
                            value={totals ? fmt(totals.total_actual) : '—'}
                            valueColor='#52c41a'
                            loading={false}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.remainingBudget', { defaultValue: 'Remaining Budget' })}
                            value={totals ? fmt(totals.total_remaining) : '—'}
                            valueColor={token.colorWarningText ?? '#faad14'}
                            loading={false}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.projectedOverrun', { defaultValue: 'Projected Overrun' })}
                            value={totals ? fmt(Math.abs(overrun)) : '—'}
                            sign={isOverBudget ? '+' : isUnderBudget ? '-' : ''}
                            valueColor={isOverBudget ? token.colorError : isUnderBudget ? token.colorSuccess : token.colorTextSecondary}
                            loading={false}
                            tooltip={t('kpi.projectedOverrunTooltip', { defaultValue: 'Positive means over budget, negative means under budget' })}
                        />
                    </Col>
                </Row>
            )}

            {/* Info alert */}
            <Alert
                type="info"
                showIcon
                message={t('forecastInfo', { defaultValue: 'Forecasts are based on current burn rates and task completion percentages. Set project budgets for accurate projections.' })}
            />

            {/* Data table */}
            {loading ? (
                <Card size="small"><Skeleton active paragraph={{ rows: 8 }} /></Card>
            ) : projects.length === 0 ? (
                <Card size="small">
                    <Empty description={t('noData', { defaultValue: 'No forecast data available' })} />
                </Card>
            ) : (
                <Card
                    title={<Text strong style={{ fontSize: 15 }}>{t('tableTitle', { defaultValue: 'Project Forecasts' })}</Text>}
                    styles={{ header: { padding: '12px 24px', minHeight: 56 } }}
                    size="small"
                >
                    <Table<IForecastProject>
                        rowKey="id"
                        dataSource={projects}
                        columns={columns}
                        size="small"
                        pagination={{
                            defaultPageSize: 10,
                            pageSizeOptions: ['5', '10', '20', '50'],
                            showSizeChanger: true,
                            showTotal: (total, range) => `${range[0]}–${range[1]} ${t('table.of', { defaultValue: 'of' })} ${total}`,
                        }}
                        scroll={{ x: 1200 }}
                    />
                </Card>
            )}

        </Flex>
    );
};

export default FinanceForecastsPage;
