import { useState } from 'react';
import { X } from 'lucide-react';

export function Banner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      id="hackathon-banner"
      className="bg-black text-white flex items-center justify-between gap-3 px-4 lg:px-6"
      style={{ minHeight: '48px' }}
      role="banner"
    >
      <p className="flex-1 py-2" style={{ fontSize: '14px', lineHeight: '20px' }}>
        This is a prototype, available for testing and feedback purposes only.
        It may change or be discontinued without notice.{' '}
        <a
          href="https://www.hack.gov.sg/about-hfpg/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-300 transition-colors"
        >
          Learn more
        </a>
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 p-1 text-white/70 hover:text-white transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default Banner;
