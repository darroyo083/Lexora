import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Landing from './landing/Landing';
import './index.css';

const isDemo = window.location.pathname.startsWith('/demo');
document.documentElement.dataset.surface = isDemo ? 'reader' : 'landing';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDemo ? <App /> : <Landing />}
  </StrictMode>
);
