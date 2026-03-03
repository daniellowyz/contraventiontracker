import { useState, useEffect } from 'react';

const SESSION_KEY = 'hfpg_disclaimer_acknowledged';

export function DisclaimerModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show modal if not yet acknowledged this session
    if (!sessionStorage.getItem(SESSION_KEY)) {
      setShow(true);
    }
  }, []);

  // Block ESC key
  useEffect(() => {
    if (!show) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [show]);

  const handleAcknowledge = () => {
    sessionStorage.setItem(SESSION_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      // Do NOT close on overlay click
    >
      <div
        className="bg-white w-full max-w-lg mx-4 p-8 shadow-xl"
        style={{ borderRadius: '8px' }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="disclaimer-title"
        aria-describedby="disclaimer-body"
      >
        <h2
          id="disclaimer-title"
          className="text-lg font-semibold text-gray-900 mb-4"
        >
          Before you proceed
        </h2>

        <p
          id="disclaimer-body"
          className="text-sm text-gray-600 leading-relaxed mb-6"
        >
          This is an experimental prototype built during OGP's{' '}
          <a
            href="https://www.hack.gov.sg/about-hfpg/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            Hack for Public Good
          </a>
          . It is available for testing and feedback purposes only. It may change
          or be discontinued without notice as we learn what works best.
        </p>

        <button
          onClick={handleAcknowledge}
          className="w-full bg-black text-white font-medium py-3 px-6 hover:bg-gray-800 transition-colors"
          style={{ borderRadius: '6px', fontSize: '14px' }}
          autoFocus
        >
          I understand
        </button>
      </div>
    </div>
  );
}

export default DisclaimerModal;
