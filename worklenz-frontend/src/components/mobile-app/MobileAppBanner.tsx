import { useState, useCallback } from 'react';
import { Alert, Button, Space } from '@/shared/antd-imports';
import { CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthService } from '@/hooks/useAuth';
import { profileSettingsApiService } from '@/api/settings/profile/profile-settings.api.service';
import { setSession } from '@/utils/session-helper';
import MobileAppModal from './MobileAppModal';

export const MobileAppBanner = () => {
  return null;
};
