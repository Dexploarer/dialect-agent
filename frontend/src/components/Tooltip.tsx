import { useState } from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

export default function Tooltip({
  content,
  position = 'top',
  className = '',
}: {
  content: string;
  position?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const pos =
    position === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 -mb-2'
      : position === 'right'
      ? 'left-full top-1/2 -translate-y-1/2 ml-2'
      : position === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 mt-2'
      : 'right-full top-1/2 -translate-y-1/2 -mr-2';

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Help"
      >
        <InformationCircleIcon className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="tooltip"
          className={`absolute z-20 px-2 py-1 text-xs rounded bg-gray-900 text-white whitespace-pre-wrap pointer-events-none shadow ${pos}`}
        >
          {content}
        </div>
      )}
    </span>
  );
}

