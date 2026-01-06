interface BannerProps {
  message?: string;
}

export const Banner = ({ 
  message = "This is an exploratory prototype that was built as part of OGP's Hack for Public Good."
}: BannerProps) => {
  return (
    <div
      id="banner"
      className="bg-orange-50 text-[0.6875rem] text-[#474747] lg:text-sm shadow-lg"
      aria-label="Banner notification"
    >
      <div className="px-3 lg:container lg:mx-auto lg:px-6">
        <div className="flex items-center py-3">
          <div>
            <strong>Disclaimer:</strong> {message}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Banner;

