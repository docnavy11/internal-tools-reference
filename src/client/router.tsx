import { createBrowserRouter } from 'react-router';
import { StatusPage } from './pages/status';

// Every feature adds its routes here with one import line. See docs/recipes/add-entity.md.
export const router = createBrowserRouter([{ path: '/', element: <StatusPage /> }]);
