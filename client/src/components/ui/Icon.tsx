const ICONS = {
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>\n  <circle cx="12" cy="12" r="3"></circle>',
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>',
  clock: '<circle cx="12" cy="12" r="10"></circle>\n  <polyline points="12 6 12 12 16 14"></polyline>',
  fuel: '<line x1="3" x2="15" y1="22" y2="22"></line>\n  <line x1="4" x2="14" y1="9" y2="9"></line>\n  <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"></path>\n  <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"></path>',
  percent: '<line x1="19" x2="5" y1="5" y2="19"></line>\n  <circle cx="6.5" cy="6.5" r="2.5"></circle>\n  <circle cx="17.5" cy="17.5" r="2.5"></circle>',
  'badge-percent': '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"></path>\n  <path d="m15 9-6 6"></path>\n  <path d="M9 9h.01"></path>\n  <path d="M15 15h.01"></path>',
  'chevron-down': '<path d="m6 9 6 6 6-6"></path>',
  'chevron-right': '<path d="m9 18 6-6-6-6"></path>',
  'chevron-left': '<path d="m15 18-6-6 6-6"></path>',
  x: '<path d="M18 6 6 18"></path>\n  <path d="m6 6 12 12"></path>',
  check: '<path d="M20 6 9 17l-5-5"></path>',
  'circle-alert': '<circle cx="12" cy="12" r="10"></circle>\n  <line x1="12" x2="12" y1="8" y2="12"></line>\n  <line x1="12" x2="12.01" y1="16" y2="16"></line>',
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path>\n  <path d="M12 9v4"></path>\n  <path d="M12 17h.01"></path>',
  info: '<circle cx="12" cy="12" r="10"></circle>\n  <path d="M12 16v-4"></path>\n  <path d="M12 8h.01"></path>',
  'arrow-right': '<path d="M5 12h14"></path>\n  <path d="m12 5 7 7-7 7"></path>',
  'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path>\n  <circle cx="12" cy="10" r="3"></circle>',
  search: '<circle cx="11" cy="11" r="8"></circle>\n  <path d="m21 21-4.3-4.3"></path>',
  'sliders-horizontal': '<line x1="21" x2="14" y1="4" y2="4"></line>\n  <line x1="10" x2="3" y1="4" y2="4"></line>\n  <line x1="21" x2="12" y1="12" y2="12"></line>\n  <line x1="8" x2="3" y1="12" y2="12"></line>\n  <line x1="21" x2="16" y1="20" y2="20"></line>\n  <line x1="12" x2="3" y1="20" y2="20"></line>\n  <line x1="14" x2="14" y1="2" y2="6"></line>\n  <line x1="8" x2="8" y1="10" y2="14"></line>\n  <line x1="16" x2="16" y1="18" y2="22"></line>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>\n  <circle cx="7" cy="17" r="2"></circle>\n  <path d="M9 17h6"></path>\n  <circle cx="17" cy="17" r="2"></circle>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>\n  <path d="m9 12 2 2 4-4"></path>',
} as const

export type IconName = keyof typeof ICONS

export interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}

export function Icon({ name, size = 20, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}
