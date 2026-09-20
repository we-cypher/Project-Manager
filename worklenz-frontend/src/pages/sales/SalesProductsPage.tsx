import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Flex,
  Input,
  Select,
  Space,
  Typography,
  message,
} from '@/shared/antd-imports';
import { PlusOutlined } from '@/shared/antd-imports';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import { salesApiService } from '@/api/sales/sales.api.service';
import type { ISalesOnboardingStep, ISalesProduct } from '@/types/sales/sales.types';

const { Text, Title, Paragraph } = Typography;

export const SalesProductsPage = () => {
  const { t } = useTranslation('sales');
  useDocumentTitle(t('products', { defaultValue: 'Products' }));

  const [products, setProducts] = useState<ISalesProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ISalesProduct>>({});

  const load = useCallback(async () => {
    try {
      const res = await salesApiService.getProducts();
      if (res.done) {
        const list = res.body || [];
        setProducts(list);
        setDrafts(
          list.reduce<Record<string, ISalesProduct>>((acc, product) => {
            acc[product.id] = {
              ...product,
              onboarding_steps: product.onboarding_steps || [],
            };
            return acc;
          }, {})
        );
      } else {
        message.error(res.message || t('loadError', { defaultValue: 'Could not load products' }));
      }
    } catch {
      message.error(t('loadError', { defaultValue: 'Could not load products. Run the Sales SQL in psql if tables are missing.' }));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = (productId: string, patch: Partial<ISalesProduct>) => {
    setDrafts(prev => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
  };

  const updateStep = (productId: string, index: number, patch: Partial<ISalesOnboardingStep>) => {
    const current = drafts[productId];
    if (!current) return;
    const steps = [...(current.onboarding_steps || [])];
    steps[index] = { ...steps[index], ...patch };
    updateDraft(productId, { onboarding_steps: steps });
  };

  const addStep = (productId: string) => {
    const current = drafts[productId];
    if (!current) return;
    updateDraft(productId, {
      onboarding_steps: [...(current.onboarding_steps || []), { title: '', activity_type: 'task' }],
    });
  };

  const removeStep = (productId: string, index: number) => {
    const current = drafts[productId];
    if (!current) return;
    updateDraft(productId, {
      onboarding_steps: (current.onboarding_steps || []).filter((_, stepIndex) => stepIndex !== index),
    });
  };

  const saveProduct = async (productId: string) => {
    const draft = drafts[productId];
    if (!draft?.name.trim()) {
      message.error(t('dealNameRequired', { defaultValue: 'Name is required' }));
      return;
    }
    const nameRes = await salesApiService.updateProduct(productId, { name: draft.name.trim(), kind: draft.kind });
    const stepsRes = await salesApiService.replaceOnboardingSteps(
      productId,
      (draft.onboarding_steps || []).filter(step => step.title.trim())
    );
    if (nameRes.done && stepsRes.done) {
      message.success(t('saved', { defaultValue: 'Saved' }));
      void load();
    } else {
      message.error(nameRes.message || stepsRes.message || t('loadError', { defaultValue: 'Could not save' }));
    }
  };

  return (
    <Flex vertical gap={16}>
      <div>
        <Title level={4} style={{ margin: 0 }}>
          {t('products', { defaultValue: 'Products' })}
        </Title>
        <Paragraph type="secondary">
          {t('productsHint', {
            defaultValue: 'Each SaaS product has its own onboarding checklist. Won deals copy these steps.',
          })}
        </Paragraph>
      </div>

      {products.map(product => {
        const draft = drafts[product.id] || product;
        return (
          <Card key={product.id} style={{ borderRadius: 8 }}>
            <Flex vertical gap={12}>
              <Flex gap={12} wrap="wrap">
                <Input
                  value={draft.name}
                  onChange={event => updateDraft(product.id, { name: event.target.value })}
                  style={{ maxWidth: 280 }}
                />
                <TagLikeKind kind={draft.kind} t={t} />
              </Flex>
              <Text strong>{t('onboardingSteps', { defaultValue: 'Onboarding steps' })}</Text>
              {(draft.onboarding_steps || []).map((step, index) => (
                <Space key={`${product.id}-${index}`} wrap>
                  <Input
                    value={step.title}
                    placeholder={t('activityTitle', { defaultValue: 'Title' })}
                    style={{ width: 280 }}
                    onChange={event => updateStep(product.id, index, { title: event.target.value })}
                  />
                  <Select
                    value={step.activity_type}
                    style={{ width: 140 }}
                    onChange={value => updateStep(product.id, index, { activity_type: value })}
                    options={[
                      { value: 'meeting', label: t('meeting', { defaultValue: 'Meeting' }) },
                      { value: 'task', label: t('task', { defaultValue: 'Task' }) },
                    ]}
                  />
                  <Button onClick={() => removeStep(product.id, index)}>
                    {t('delete', { defaultValue: 'Delete' })}
                  </Button>
                </Space>
              ))}
              <Flex gap={8}>
                <Button icon={<PlusOutlined />} onClick={() => addStep(product.id)}>
                  {t('addStep', { defaultValue: 'Add step' })}
                </Button>
                <Button type="primary" onClick={() => void saveProduct(product.id)}>
                  {t('save', { defaultValue: 'Save' })}
                </Button>
              </Flex>
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
};

const TagLikeKind = ({
  kind,
  t,
}: {
  kind: string;
  t: (key: string, options: { defaultValue: string }) => string;
}) => (
  <Text type="secondary">{kind === 'saas' ? t('saas', { defaultValue: 'SaaS' }) : t('service', { defaultValue: 'Service' })}</Text>
);

export default SalesProductsPage;
