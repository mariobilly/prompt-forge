"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Forge" },
  { href: "/profiles", label: "Models" },
  { href: "/library", label: "Library" },
  { href: "/about", label: "About" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-0.5">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-md px-2.5 py-1 text-[13px] transition-colors ${active ? "bg-hover text-text" : "text-muted hover:bg-panel-2 hover:text-text"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
