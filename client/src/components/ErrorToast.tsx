import { useEffect } from 'react';

interface Props {
  message: string;
  onClose: () => void;
}

export function ErrorToast({ message, onClose }: Props) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        right: '20px',
        background: '#e74c3c',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '10px',
        fontSize: '14px',
        textAlign: 'center',
        zIndex: 200,
        cursor: 'pointer',
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
}
