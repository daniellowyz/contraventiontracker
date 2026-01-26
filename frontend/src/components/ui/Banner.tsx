interface BannerProps {
  message?: string;
}

export const Banner = ({
  message = "This is an exploratory prototype that was built as part of OGP's Hack for Public Good."
}: BannerProps) => {
  return (
    <div
      id="banner"
      className="bg-amber-50 border-b border-amber-200"
      aria-label="Banner notification"
    >
      <div className="px-3 lg:container lg:mx-auto lg:px-6">
        <div className="flex items-center gap-2 py-2 text-[11px]">
          <span className="text-amber-700 font-medium">Note:</span>
          <span className="text-amber-600">{message}</span>
        </div>
      </div>
    </div>
  );
};

export default Banner;
