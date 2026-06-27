'use client';

import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface RoomCodeBadgeProps {
  code: string;
}

export function RoomCodeBadge({ code }: RoomCodeBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 bg-quizzy-card border border-quizzy-border rounded-xl px-4 py-2 shadow-card hover:shadow-card-hover transition-shadow group"
      title="Click to copy room code"
    >
      <span className="text-xs font-medium text-quizzy-muted uppercase tracking-widest">Room</span>
      <span className="text-lg font-bold tracking-widest text-quizzy-text font-mono">{code}</span>
      <span className="text-quizzy-subtle group-hover:text-quizzy-muted transition-colors">
        {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
      </span>
    </button>
  );
}
