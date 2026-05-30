import Header from "@/components/header";

export default function ChromeLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="grid h-full grid-rows-[auto_1fr]">
			<Header />
			{children}
		</div>
	);
}
