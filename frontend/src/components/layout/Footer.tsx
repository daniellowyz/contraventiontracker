export function Footer() {
  return (
    <footer className="bg-white border-t border-stone-200 px-4 py-8 text-stone-500 lg:px-24">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-6 h-6" />
          <span className="text-sm font-medium text-stone-700">Contravention Tracker</span>
        </div>
        <div className="flex flex-wrap gap-5 text-[12px]">
          <a
            href="https://www.tech.gov.sg/contact-us/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-500 hover:text-stone-900 transition-colors"
          >
            Contact
          </a>
          <a
            href="https://www.tech.gov.sg/report-vulnerability/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-500 hover:text-stone-900 transition-colors"
          >
            Report Vulnerability
          </a>
          <a
            href="https://www.tech.gov.sg/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-500 hover:text-stone-900 transition-colors"
          >
            Privacy
          </a>
          <a
            href="https://www.tech.gov.sg/terms-of-use/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-500 hover:text-stone-900 transition-colors"
          >
            Terms
          </a>
        </div>
        <hr className="border-stone-200" />
        <p className="text-[11px] text-stone-400">
          &copy; {new Date().getFullYear()} Government Technology Agency of Singapore
        </p>
      </div>
    </footer>
  );
}
