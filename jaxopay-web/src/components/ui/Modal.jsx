import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw]',
};

const Modal = ({ isOpen, onClose, title, size = 'md', children, footer }) => {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose?.();
      }}
    >
      {/* Backdrop — fully opaque to prevent background text bleed-through */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Content */}
      <div
        className={`relative w-full ${sizeClasses[size]} max-h-[90vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl ring-1 ring-border/50`}
        style={{
          backgroundColor: 'hsl(var(--card))',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px hsl(var(--border) / 0.3)',
        }}
      >
        {/* Header */}
        {title && (
          <div
            className="flex items-center justify-between px-6 py-4 border-b shrink-0"
            style={{
              borderColor: 'hsl(var(--border))',
              backgroundColor: 'hsl(var(--card))',
            }}
          >
            <h2 className="text-lg font-semibold font-heading text-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Close button when no title */}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Body — solid background to prevent any bleed-through */}
        <div
          className="flex-1 overflow-y-auto p-6"
          style={{ backgroundColor: 'hsl(var(--card))' }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="px-6 py-4 border-t shrink-0"
            style={{
              borderColor: 'hsl(var(--border))',
              backgroundColor: 'hsl(var(--card))',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
