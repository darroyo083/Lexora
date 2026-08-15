import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Landing from './landing/Landing';
import { resolveRoute } from './routing';
import './index.css';

const initialRoute = resolveRoute(window.location.pathname);
if (initialRoute.replace) {
  window.history.replaceState({}, '', initialRoute.pathname);
}
document.documentElement.dataset.surface = initialRoute.surface;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {initialRoute.surface === 'reader' ? <App /> : <Landing />}
  </StrictMode>
);
