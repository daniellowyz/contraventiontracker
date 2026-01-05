export function Footer() {
  return (
    <footer className="bg-neutral-800 px-4 py-10 text-white lg:px-32">
      <div className="flex flex-col gap-8">
        <p className="text-2xl font-bold">Contravention Tracker</p>
        <div className="flex flex-col">
          <p className="text-gray-300">Traffic Safety Management System</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            href="https://www.tech.gov.sg/contact-us/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Contact Us
          </a>
          <a
            href="https://www.tech.gov.sg/report-vulnerability/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Report Vulnerability
          </a>
          <a
            href="https://www.tech.gov.sg/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Privacy Statement
          </a>
          <a
            href="https://www.tech.gov.sg/terms-of-use/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Terms of Use
          </a>
        </div>
        <hr className="border-gray-600" />
        <p className="self-end text-sm text-gray-400">
          &copy; {new Date().getFullYear()} Government Technology Agency of Singapore
        </p>
      </div>
    </footer>
  );
}
