import React from 'react'

type IconProps = React.SVGProps<SVGSVGElement> & { className?: string }

function base(props: IconProps, children: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const PlusIcon = (p: IconProps) => base(p, <path d="M12 5v14M5 12h14" />)
export const SearchIcon = (p: IconProps) =>
  base(p, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>)
export const XMarkIcon = (p: IconProps) => base(p, <path d="M6 6l12 12M18 6L6 18" />)
export const CheckIcon = (p: IconProps) => base(p, <path d="m5 12 5 5L20 7" />)
export const ChevronDownIcon = (p: IconProps) => base(p, <path d="m6 9 6 6 6-6" />)
export const ChevronRightIcon = (p: IconProps) => base(p, <path d="m9 6 6 6-6 6" />)
export const MenuIcon = (p: IconProps) => base(p, <path d="M4 6h16M4 12h16M4 18h16" />)
export const EllipsisIcon = (p: IconProps) => base(p, <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>)
export const TrashIcon = (p: IconProps) =>
  base(p, <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>)
export const ArchiveIcon = (p: IconProps) =>
  base(p, <><rect x="3" y="5" width="18" height="4" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>)
export const ArchiveBoxIcon = (p: IconProps) =>
  base(p, <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M8 12h8" /></>)
export const EditIcon = (p: IconProps) =>
  base(p, <><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="m13.5 6.5 3 3" /></>)
export const CalendarIcon = (p: IconProps) =>
  base(p, <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 9h18" /></>)
export const UsersIcon = (p: IconProps) =>
  base(p, <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3 3.5-5 6.5-5s5.7 2 6.5 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 15.5c2 .7 3.5 2.2 4 4.5" /></>)
export const TagIcon = (p: IconProps) =>
  base(p, <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" /><circle cx="7.5" cy="7.5" r="1" fill="currentColor" /></>)
export const ChartIcon = (p: IconProps) =>
  base(p, <><path d="M4 19V5M4 19h16" /><path d="M8 16v-5M12 16V8M16 16v-3M20 16v-6" /></>)
export const LogoutIcon = (p: IconProps) =>
  base(p, <><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" /><path d="M15 8l4 4-4 4M19 12H9" /></>)
export const HelpIcon = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.8.4-1.2 1-1.2 1.8v.5M12 17h.01" /></>)
export const ShieldIcon = (p: IconProps) =>
  base(p, <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" /></>)
export const BackIcon = (p: IconProps) => base(p, <path d="M19 12H5M11 18l-6-6 6-6" />)
export const InboxIcon = (p: IconProps) =>
  base(p, <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>)
export const BoardIcon = (p: IconProps) =>
  base(p, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /><path d="M3 9h6M3 14h6M15 9h6M15 14h6" /></>)
export const UserIcon = (p: IconProps) =>
  base(p, <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.2-3.5 4.3-6 8-6s6.8 2.5 8 6" /></>)
export const BoltIcon = (p: IconProps) => base(p, <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8z" />)
export const PaperAirplaneIcon = (p: IconProps) => base(p, <path d="m22 2-7 20-4-9-9-4 20-7z" />)
export const SettingsIcon = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14 3h-4l-.5 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2L10 21h4l.5-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1.2z" /></>)
export const EyeIcon = (p: IconProps) =>
  base(p, <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>)