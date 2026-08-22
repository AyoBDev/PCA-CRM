import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { EmployeeAttentionProvider } from './hooks/useEmployeeAttention';
import { TooltipProvider } from './components/common/Tooltip';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <EmployeeAttentionProvider>
                        <TooltipProvider>
                            <App />
                        </TooltipProvider>
                    </EmployeeAttentionProvider>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
