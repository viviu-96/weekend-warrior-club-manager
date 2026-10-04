import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppDataProvider } from './hooks/useAppData';
import { FeedbackProvider } from './hooks/useFeedback';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Không tìm thấy phần tử #root.');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <FeedbackProvider>
          <AppDataProvider>
            <App />
          </AppDataProvider>
        </FeedbackProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
