import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Card,
    Col,
    Empty,
    Flex,
    Progress,
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

interface BudgetProject {
    id: string;
    name: string;
    color_code: string;
    client_name: string | null;
    budget: number;
    currency: string;
    actual_cost: number;
    variance: number;
    utilization_pct: number;
    completion_pct: number;
    fixed_cost: number;
    time_based_cost: number;
    estimated_hours: number;
    logged_hours: number;
    total_tasks: number;
    completed_tasks: number;
    start_date: string | null;
    end_date: string | null;
}

interface BudgetTotals {
    total_budget: number;
    total_actual: number;
    total_variance: number;
    project_count: number;
    over_budget_count: number;
    on_track_count: number;
}

interface BudgetResponse {
    projects: BudgetProject[];
    totals: BudgetTotals;
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

const utilizationColor = (pct: number): string => {
    if (pct > 100) return '#ff4d4f';
    if (pct > 80) return '#faad14';
    return '#52c41a';
};

// ─── KPI Card ───────────────────────────────────────────────────────────────

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

// ─── Page ───────────────────────────────────────────────────────────────────

export const FinanceBudgetsPage: React.FC = () => {
    const { t } = useTranslation('finance-budgets');
    const { token } = theme.useToken();

    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<BudgetProject[]>([]);
    const [totals, setTotals] = useState<BudgetTotals | null>(null);

    useEffect(() => {
        setLoading(true);
        financeOverviewApiService.getBudgets()
            .then(res => {
                if (res.done && res.body) {
                    const data = res.body as BudgetResponse;
                    setProjects(data.projects ?? []);
                    setTotals(data.totals ?? null);
                }
            })
            .catch(() => { /* handled by empty state */ })
            .finally(() => setLoading(false));
    }, []);

    const variance = totals?.total_variance ?? 0;

    const columns: ColumnsType<BudgetProject> = useMemo(() => [
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
            width: 130,
            render: (v: number) =>
                v > 0
                    ? <Text>{fmtFull(v)}</Text>
                    : <Text type="secondary" style={{ fontSize: 12 }}>{t('noBudgetSet', { defaultValue: 'No budget set' })}</Text>,
        },
        {
            title: t('table.spent', { defaultValue: 'Spent' }),
            dataIndex: 'actual_cost',
            key: 'actual_cost',
            width: 120,
            render: (v: number) => <Text>{fmtFull(v)}</Text>,
        },
        {
            title: t('table.variance', { defaultValue: 'Variance' }),
            dataIndex: 'variance',
            key: 'variance',
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
            title: t('table.utilization', { defaultValue: 'Utilization' }),
            dataIndex: 'utilization_pct',
            key: 'utilization_pct',
            width: 160,
            render: (pct: number, record) => {
                if (record.budget === 0) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
                return (
                    <Flex align="center" gap={8}>
                        <Progress
                            percent={Math.min(pct, 100)}
                            size="small"
                            strokeColor={utilizationColor(pct)}
                            showInfo={false}
                            style={{ flex: 1, marginBottom: 0 }}
                        />
                        <Text style={{ color: utilizationColor(pct), fontSize: 13, fontWeight: 500, minWidth: 36 }}>
                            {pct}%
                        </Text>
                    </Flex>
                );
            },
        },
        {
            title: t('table.completion', { defaultValue: 'Completion' }),
            dataIndex: 'completion_pct',
            key: 'completion_pct',
            width: 110,
            render: (pct: number) => (
                <Tag color={pct >= 100 ? 'green' : pct >= 50 ? 'blue' : 'default'} style={{ fontWeight: 500 }}>
                    {pct}%
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
                    {t('pageTitle', { defaultValue: 'Budget Tracker' })}
                </Typography.Title>
                <Text type="secondary" style={{ fontSize: 13, marginTop: 2, display: 'block' }}>
                    {t('pageSubTitle', { defaultValue: 'Monitor project budgets, spending, and utilization across your portfolio.' })}
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
                            valueColor="#52c41a"
                            loading={false}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.totalVariance', { defaultValue: 'Total Variance' })}
                            value={totals ? fmt(Math.abs(variance)) : '—'}
                            sign={variance < 0 ? '- ' : variance > 0 ? '+ ' : ''}
                            valueColor={variance < 0 ? '#ff4d4f' : variance > 0 ? '#52c41a' : token.colorTextSecondary}
                            loading={false}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <KpiCard
                            title={t('kpi.overBudget', { defaultValue: 'Projects Over Budget' })}
                            value={totals ? String(totals.over_budget_count) : '0'}
                            valueColor={totals && totals.over_budget_count > 0 ? '#ff4d4f' : '#52c41a'}
                            loading={false}
                        />
                    </Col>
                </Row>
            )}

            {/* Table */}
            <Card
                title={
                    <Text strong style={{ fontSize: 15 }}>
                        {t('tableTitle', { defaultValue: 'Project Budgets' })}
                    </Text>
                }
                styles={{ header: { padding: '12px 24px', minHeight: 56 } }}
            >
                {loading ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                ) : projects.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('emptyState', { defaultValue: 'No budget data available. Set budgets on your projects to see data here.' })}
                    />
                ) : (
                    <Table<BudgetProject>
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

export default FinanceBudgetsPage;
