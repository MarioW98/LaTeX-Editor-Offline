/** Icone inline originali (SVG, stroke currentColor) — nessun asset esterno. */
import type { JSX } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className,
    'aria-hidden': true,
    focusable: false as const,
  };
}

/** Cartella. */
export function FolderIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6.5z" strokeLinejoin="round" />
    </svg>
  );
}

/** Pagina generica. */
export function PageIcon({ size = 16, className, label }: IconProps & { label?: string }): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6.5 3.5h7L18 8v11.5a1 1 0 0 1-1 1H7.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      {label ? (
        <text x="12" y="16" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">
          {label}
        </text>
      ) : (
        <path d="M9 12h6M9 15h6M9 9h3" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Icona per estensione: colore/classe gestito dal CSS (.ft-ic-*). */
export function FileIconByExt({ ext, size = 16 }: { ext: string; size?: number }): JSX.Element {
  const cls = `ft-ic ft-ic-${ext || 'gen'}`;
  const label = extLabel(ext);
  return <PageIcon size={size} className={cls} label={label} />;
}

function extLabel(ext: string): string | undefined {
  switch (ext) {
    case 'tex':
      return 'TX';
    case 'bib':
      return 'B';
    case 'sty':
      return 'S';
    case 'cls':
      return 'C';
    case 'md':
      return 'M';
    case 'txt':
      return 'T';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'eps':
    case 'bmp':
      return 'Im';
    case 'pdf':
      return 'P';
    case 'json':
      return '{ }';
    default:
      return undefined;
  }
}

/** Icone UI generiche. */
export function PlayIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="currentColor" stroke="none">
      <path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11-7.2a1 1 0 0 0 0-1.8l-11-7.2c-.7-.4-1.6.1-1.6.9z" />
    </svg>
  );
}

export function StopIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="currentColor" stroke="none">
      <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
    </svg>
  );
}

export function SaveIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      <path d="M8 4v5h6V4M8 20v-6h8v6" strokeLinejoin="round" />
    </svg>
  );
}

export function NewDocIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 3.5h7L18 8v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      <path d="M9 13h6M12 10v6" strokeLinecap="round" />
    </svg>
  );
}

export function OpenIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4h4l2 2.5h8A1.5 1.5 0 0 1 20 8v1" strokeLinejoin="round" />
      <path d="M3.5 9h17l-2 9.5a1.5 1.5 0 0 1-1.5 1.2H5.5a1.5 1.5 0 0 1-1.5-1.2L3 8.5" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" strokeLinecap="round" />
    </svg>
  );
}

export function TerminalIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 9l3 3-3 3M12.5 15h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DocIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M7 13h6" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M20 12a8 8 0 1 1-2.5-5.8" strokeLinecap="round" />
      <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4.5 6.5h15M9.5 6V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V6" strokeLinejoin="round" />
      <path d="M6.5 6.5l.8 13a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-13" strokeLinejoin="round" />
      <path d="M10 10.5v6M14 10.5v6" strokeLinecap="round" />
    </svg>
  );
}

export function PencilIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function SunIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronIcon({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
