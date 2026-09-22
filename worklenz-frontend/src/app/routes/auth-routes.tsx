import { lazy, Suspense } from 'react';
import AuthLayout from '@/layouts/AuthLayout';
import { Navigate, useSearchParams } from 'react-router-dom';
import { SuspenseFallback } from '@/components/suspense-fallback/suspense-fallback';
import ChunkErrorHandler from '@/utils/chunk-error-handler';
import { isPublicSignupDisabled } from '@/shared/public-signup';

// Lazy load auth page components for better code splitting with chunk error handling
const LoginPage = lazy(
  ChunkErrorHandler.wrapLazyImport(() => import('@/pages/auth/LoginPage'), 'LoginPage')
);
const SignupPage = lazy(
  ChunkErrorHandler.wrapLazyImport(() => import('@/pages/auth/SignupPage'), 'SignupPage')
);
const ForgotPasswordPage = lazy(
  ChunkErrorHandler.wrapLazyImport(
    () => import('@/pages/auth/ForgotPasswordPage'),
    'ForgotPasswordPage'
  )
);
const LoggingOutPage = lazy(
  ChunkErrorHandler.wrapLazyImport(() => import('@/pages/auth/LoggingOutPage'), 'LoggingOutPage')
);
const AuthenticatingPage = lazy(
  ChunkErrorHandler.wrapLazyImport(
    () => import('@/pages/auth/AuthenticatingPage'),
    'AuthenticatingPage'
  )
);
const VerifyResetEmailPage = lazy(
  ChunkErrorHandler.wrapLazyImport(
    () => import('@/pages/auth/VerifyResetEmailPage'),
    'VerifyResetEmailPage'
  )
);
const ResetPasswordRedirect = lazy(
  ChunkErrorHandler.wrapLazyImport(
    () => import('@/pages/auth/ResetPasswordRedirect'),
    'ResetPasswordRedirect'
  )
);

const InviteOnlySignupPage = () => {
  const [searchParams] = useSearchParams();
  const hasInvite = Boolean(searchParams.get('team') && searchParams.get('user'));

  if (isPublicSignupDisabled() && !hasInvite) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <Suspense fallback={<SuspenseFallback />}>
      <SignupPage />
    </Suspense>
  );
};

const authRoutes = [
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      {
        path: '',
        element: <Navigate to="login" replace />,
      },
      {
        path: 'login',
        element: (
          <Suspense fallback={<SuspenseFallback />}>
            <LoginPage />
          </Suspense>
        ),
      },
      {
        path: 'signup',
        element: <InviteOnlySignupPage />,
      },
      {
        path: 'forgot-password',
        element: (
          <Suspense fallback={<SuspenseFallback />}>
            <ForgotPasswordPage />
          </Suspense>
        ),
      },
      {
        path: 'logging-out',
        element: (
          <Suspense fallback={<SuspenseFallback />}>
            <LoggingOutPage />
          </Suspense>
        ),
      },
      {
        path: 'authenticating',
        element: (
          <Suspense fallback={<SuspenseFallback />}>
            <AuthenticatingPage />
          </Suspense>
        ),
      },
      {
        path: 'verify-reset-email/:user/:hash',
        element: (
          <Suspense fallback={<SuspenseFallback />}>
            <VerifyResetEmailPage />
          </Suspense>
        ),
      },
      {
        path: 'reset-password',
        element: (
          <Suspense fallback={<SuspenseFallback />}>
            <ResetPasswordRedirect />
          </Suspense>
        ),
      },
    ],
  },
];

export default authRoutes;
