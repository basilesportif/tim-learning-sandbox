import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import './index.css';
import App from './App.jsx';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
    ) : (
      <div className="config-shell">
        <main className="config-card">
          <p className="eyebrow">vocab</p>
          <h1>Missing Clerk Configuration</h1>
          <p>
            Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> before starting the app.
          </p>
        </main>
      </div>
    )}
  </StrictMode>
);
