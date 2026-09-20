import { DatePicker, Form, Input, InputNumber, Select } from '@/shared/antd-imports';
import type { FormInstance } from 'antd/es/form';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { IClient } from '@/types/client.types';
import type { ISalesOwner, ISalesProduct, SalesDealType } from '@/types/sales/sales.types';
import { SALES_SOURCES } from '@/types/sales/sales.types';

interface DealEditorFormProps {
  form: FormInstance;
  products: ISalesProduct[];
  owners: ISalesOwner[];
  clients: IClient[];
  dealType: SalesDealType;
  onDealTypeChange: (value: SalesDealType) => void;
  defaultCurrency?: string;
}

export const DealEditorForm = ({
  form,
  products,
  owners,
  clients,
  dealType,
  onDealTypeChange,
  defaultCurrency = 'INR',
}: DealEditorFormProps) => {
  const { t } = useTranslation('sales');
  const saasProducts = products.filter(product => product.kind === 'saas');
  const serviceProducts = products.filter(product => product.kind === 'service');
  const productOptions = dealType === 'saas' ? saasProducts : serviceProducts;

  return (
    <Form form={form} layout="vertical">
      <Form.Item
        name="name"
        label={t('dealName', { defaultValue: 'Deal name' })}
        rules={[{ required: true, message: t('dealNameRequired', { defaultValue: 'Deal name is required' }) }]}
      >
        <Input />
      </Form.Item>
      <Form.Item name="deal_type" label={t('dealType', { defaultValue: 'Type' })} initialValue="service">
        <Select
          onChange={value => onDealTypeChange(value as SalesDealType)}
          options={[
            { value: 'service', label: t('service', { defaultValue: 'Service' }) },
            { value: 'saas', label: t('saas', { defaultValue: 'SaaS' }) },
          ]}
        />
      </Form.Item>
      <Form.Item
        name="product_id"
        label={t('product', { defaultValue: 'Product' })}
        rules={
          dealType === 'saas'
            ? [{ required: true, message: t('productRequired', { defaultValue: 'Select a product for SaaS deals' }) }]
            : []
        }
      >
        <Select
          allowClear={dealType !== 'saas'}
          options={productOptions.map(product => ({ value: product.id, label: product.name }))}
        />
      </Form.Item>
      <Form.Item name="source" label={t('source', { defaultValue: 'Source' })} initialValue="other">
        <Select
          options={SALES_SOURCES.map(source => ({
            value: source,
            label: t(`sources.${source}`, { defaultValue: source }),
          }))}
        />
      </Form.Item>
      <Form.Item name="client_id" label={t('client', { defaultValue: 'Client' })}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          options={clients
            .filter((client): client is IClient & { id: string; name: string } => Boolean(client.id && client.name))
            .map(client => ({ value: client.id, label: client.name }))}
        />
      </Form.Item>
      <Form.Item name="contact_name" label={t('contactName', { defaultValue: 'Contact name' })}>
        <Input />
      </Form.Item>
      <Form.Item name="contact_email" label={t('contactEmail', { defaultValue: 'Email' })}>
        <Input type="email" />
      </Form.Item>
      <Form.Item name="contact_phone" label={t('contactPhone', { defaultValue: 'Phone' })}>
        <Input />
      </Form.Item>
      <Form.Item name="budget" label={t('budget', { defaultValue: 'Budget' })}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="amount" label={t('amount', { defaultValue: 'Amount' })}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="currency" label={t('currency', { defaultValue: 'Currency' })} initialValue={defaultCurrency}>
        <Input maxLength={10} />
      </Form.Item>
      <Form.Item name="owner_id" label={t('owner', { defaultValue: 'Owner' })}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          options={owners.map(owner => ({ value: owner.id, label: owner.name }))}
        />
      </Form.Item>
      <Form.Item
        name="expected_close_date"
        label={t('expectedClose', { defaultValue: 'Expected close' })}
        getValueProps={value => ({ value: value ? dayjs(value) : null })}
        normalize={value => (value ? dayjs(value).format('YYYY-MM-DD') : null)}
      >
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="notes" label={t('notes', { defaultValue: 'Notes' })}>
        <Input.TextArea rows={3} />
      </Form.Item>
    </Form>
  );
};
