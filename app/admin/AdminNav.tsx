import Link from "next/link";
import { adminLogout } from "@/app/actions/admin";

const links = [
  { href: "/admin/upload", label: "대진표 업로드" },
  { href: "/admin/teams", label: "팀 코드" },
  { href: "/admin/standings", label: "그룹 순위·대진 생성" },
  { href: "/admin/matches", label: "경기 현황" },
  { href: "/admin/tournaments", label: "대회 관리" },
];

export default function AdminNav() {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4">
      <div className="flex gap-4 text-sm font-medium text-neutral-600">
        {links.map((link) => (
          <Link key={link.href} href={link.href} replace className="hover:text-neutral-900">
            {link.label}
          </Link>
        ))}
      </div>
      <form action={adminLogout}>
        <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
          로그아웃
        </button>
      </form>
    </nav>
  );
}
