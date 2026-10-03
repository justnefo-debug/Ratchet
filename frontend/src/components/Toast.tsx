import React from 'react';
import { Check, Info, AlertTriangle } from 'lucide-react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'info' | 'warning';
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-fixed-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-item toast-${toast.type || 'success'}`}
          onClick={() => onDismiss(toast.id)}
        >
          {toast.type === 'warning' ? (
            <AlertTriangle size={15} />
          ) : toast.type === 'info' ? (
            <Info size={15} />
          ) : (
            <Check size={15} strokeWidth={2.8} />
          )}
          <span className="toast-text">{toast.text}</span>
        </div>
      ))}
    </div>
  );
};
