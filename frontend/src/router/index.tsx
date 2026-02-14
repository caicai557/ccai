import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import Dashboard from '../pages/Dashboard';
import Accounts from '../pages/Accounts';
import Targets from '../pages/Targets';
import Templates from '../pages/Templates';
import Tasks from '../pages/Tasks';
import Logs from '../pages/Logs';
import Settings from '../pages/Settings';

/**
 * 应用路由配置
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'accounts',
        element: <Accounts />,
      },
      {
        path: 'targets',
        element: <Targets />,
      },
      {
        path: 'templates',
        element: <Templates />,
      },
      {
        path: 'tasks',
        element: <Tasks />,
      },
      {
        path: 'logs',
        element: <Logs />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  },
]);
