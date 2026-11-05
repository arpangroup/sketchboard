import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { pwa } from './pwa/pwa';
import App from './ui/App';
import './styles/app.css';

pwa.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
