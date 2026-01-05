import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	navigationMenuTriggerStyle,
} from "@components/ui/navigation-menu";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import logo from "public/logo.webp";
import React from "react";
import { cn } from "~/lib/utils";
import { auth } from "~/server/auth";
import { NestedRoute, Route, routes } from "~/utils/route";
import { NavbarLabel, NavbarLink } from "./navbar-link";
import { NavbarLoginButton } from "./navbar-login-button";
import { NavbarSidebar } from "./navbar-sidebar";
import { env } from "~/env";

export interface NavbarProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
	selector?: Route;
}

const navbarRoutes: () => (Route | NestedRoute)[] = () => [routes.menu, routes.comparison];
// routes.chatbot, routes.catererDirectory
const publicNavbarRoutes: (Route | NestedRoute)[] = [];

const Navbar = React.forwardRef<HTMLDivElement, NavbarProps>(
	async ({ selector, ...props }, ref) => {
		const session = await auth();

		const isActiveUser = session?.user.activated;

		return (
			<div
				className="flex h-16 items-center justify-between border-b-2 border-orange-400 px-4 py-4 lg:px-32"
				{...props}
				ref={ref}
			>
				<NavbarSidebar
					navbarRoutes={navbarRoutes()}
					publicNavbarRoutes={publicNavbarRoutes}
				/>
				<div className="flex items-center gap-4 h-[90%]">
					<Image
						src={logo}
						alt="Logo"
						className="h-15.5 w-18 hover:cursor-pointer"
						onClick={async () => {
							"use server";

							redirect(
								isActiveUser
									? routes.menu.link
									: routes.anonDashboard.link,
							);
						}}
					/>
				</div>
				<div className="flex items-center gap-4">
					<NavigationMenu className="hidden w-0 md:block md:w-auto">
						<NavigationMenuList key="navbar-list">
							{(isActiveUser ? navbarRoutes() : publicNavbarRoutes).map(
								(route) => {
									if ("routes" in route) {
										if (route.auth && route.auth(session?.user!) === false) {
											return null;
										}

										return (
											<NavigationMenuItem key={route.label}>
												<NavbarLabel
													label={route.label}
													link={route.link ?? ""}
												/>
												<NavigationMenuContent>
													<div className="flex flex-col items-center w-auto min-w-0">
														{route.routes.map((nestedRoute) =>
															nestedRoute.auth &&
															nestedRoute.auth(session?.user!) ===
																false ? null : (
																<NavigationMenuLink
																	key={nestedRoute.link}
																	className={cn(
																		navigationMenuTriggerStyle(),
																		"w-full rounded-none text-nowrap",
																	)}
																	asChild
																>
																	<Link href={nestedRoute.link}>
																		{nestedRoute.label}
																	</Link>
																</NavigationMenuLink>
															),
														)}
													</div>
												</NavigationMenuContent>
											</NavigationMenuItem>
										);
									}

									if (route.auth && route.auth(session?.user!) === false) {
										return null;
									}

									return (
										<NavigationMenuItem key={route.label}>
											<NavbarLink link={route.link} label={route.label ?? ""} />
										</NavigationMenuItem>
									);
								},
							)}
						</NavigationMenuList>
					</NavigationMenu>
					<NavbarLoginButton />
				</div>
			</div>
		);
	},
);

Navbar.displayName = "Navbar";

const ListItem = React.forwardRef<
	React.ElementRef<"a">,
	React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
	return (
		<li>
			<NavigationMenuLink asChild>
				<a
					ref={ref}
					className={cn(
						"hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground block space-y-1 rounded-md p-3 leading-none no-underline outline-hidden transition-colors select-none",
						className,
					)}
					{...props}
				>
					<div className="text-sm leading-none font-medium">{title}</div>
					<p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
						{children}
					</p>
				</a>
			</NavigationMenuLink>
		</li>
	);
});
ListItem.displayName = "ListItem";

export { Navbar };
