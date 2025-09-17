import { useState } from 'react';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline';

export default function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <button
      onClick={onCopy}
      title={copied ? 'Copied!' : 'Copy'}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className}`}
    >
      {copied ? (
        <CheckIcon className="w-3.5 h-3.5 text-green-600" />
      ) : (
        <ClipboardIcon className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
      )}
      <span className="text-gray-700 dark:text-gray-300">Copy</span>
    </button>
  );
}

