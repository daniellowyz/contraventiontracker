import Link from "next/link";
import { Separator } from "./separator";

const Footer = () => {
	return (
		<div className="flex flex-col gap-8 bg-neutral-800 px-4 py-10 text-white lg:px-32">
			<p className="text-3xl font-bold">Where's the Food</p>
			<div className="flex flex-col">
				<p>Bringing Bytes to Bites</p>
			</div>
			<div className="flex gap-4 text-sm">
				<Link href="https://www.tech.gov.sg/contact-us/">Contact Us</Link>
				<Link href="https://www.tech.gov.sg/report-vulnerability/">
					Report Vulnerability
				</Link>
				<Link href="https://www.tech.gov.sg/privacy/">Privacy Statement</Link>
				<Link href="https://www.tech.gov.sg/terms-of-use/">Terms of Use</Link>
			</div>
			<Separator />
			<p className="self-end text-sm">
				© 2025 Government Technology Agency of Singapore | GovTech
			</p>
		</div>
	);
};

export default Footer;
