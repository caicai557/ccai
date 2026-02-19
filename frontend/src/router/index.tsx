import { lazy, Suspense } from 'react';
import type { ReactElement } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import Loading from '../components/Common/Loading';

const App = lazy(() => import('../App'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Accounts = lazy(() => import('../pages/Accounts'));
const Targets = lazy(() => import('../pages/Targets'));
const Templates = lazy(() => import('../pages/Templates'));
const Tasks = lazy(() => import('../pages/Tasks'));
const Logs = lazy(() => import('../pages/Logs'));
const Settings = lazy(() => import('../pages/Settings'));

const withSuspense = (element: ReactElement) => (
  <Suspense fallback={<Loading tip="页面加载中..." />}>{element}</Suspense>
);

/**
 * 应用路由配置
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: withSuspense(<App />),
    children: [
      {
        index: true,
        element: withSuspense(<Dashboard />),
      },
      {
        path: 'accounts',
        element: withSuspense(<Accounts />),
      },
      {
        path: 'targets',
        element: withSuspense(<Targets />),
      },
      {
        path: 'templates',
        element: withSuspense(<Templates />),
      },
      {
        path: 'tasks',
        element: withSuspense(<Tasks />),
      },
      {
        path: 'logs',
        element: withSuspense(<Logs />),
      },
      {
        path: 'settings',
        element: withSuspense(<Settings />),
      },
    ],
  },
]);
