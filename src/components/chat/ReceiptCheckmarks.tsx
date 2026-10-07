import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { MessageDeliveryStatus } from '../../types/chat';

interface ReceiptCheckmarksProps {
  status: MessageDeliveryStatus;
  readCount?: number;
  totalRecipients?: number;
  className?: string;
}

export const ReceiptCheckmarks: React.FC<ReceiptCheckmarksProps> = ({
  status,
  readCount = 0,
  totalRecipients = 0,
  className = '',
}) => {
  if (status === 'sending') {
    return (
      <span
        role="img"
        aria-label="Sending message"
        title="Sending..."
        className={`inline-flex items-center text-neutral-400 ${className}`}
      >
        <Clock className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
        <span className="sr-only">Sending message</span>
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span
        role="img"
        aria-label="Failed to deliver message. Click to retry."
        title="Failed to deliver. Click to retry."
        className={`inline-flex items-center text-rose-400 ${className}`}
      >
        <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="sr-only">Failed to deliver message</span>
      </span>
    );
  }

  if (status === 'read') {
    const desc = totalRecipients > 1 ? `Read by ${readCount} of ${totalRecipients} members` : 'Read';
    return (
      <span
        role="img"
        aria-label={desc}
        title={desc}
        className={`inline-flex items-center text-sky-400 ${className}`}
      >
        <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="sr-only">{desc}</span>
      </span>
    );
  }

  if (status === 'delivered') {
    return (
      <span
        role="img"
        aria-label="Delivered to recipient device"
        title="Delivered to recipient device"
        className={`inline-flex items-center text-neutral-400 ${className}`}
      >
        <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="sr-only">Delivered</span>
      </span>
    );
  }

  if (status === 'sent') {
    return (
      <span
        role="img"
        aria-label="Sent to server"
        title="Sent to server"
        className={`inline-flex items-center text-neutral-400 ${className}`}
      >
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="sr-only">Sent to server</span>
      </span>
    );
  }

  // Fallback (default sent status)
  return (
    <span
      role="img"
      aria-label="Sent"
      title="Sent"
      className={`inline-flex items-center text-neutral-400 ${className}`}
    >
      <Check className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="sr-only">Sent</span>
    </span>
  );
};
