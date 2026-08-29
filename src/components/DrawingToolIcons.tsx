import type { ReactElement, ReactNode, SVGProps } from 'react';
import type { DrawingToolGroupId } from '../lib/drawings';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({
  size = 16,
  children,
  viewBox = '0 0 16 16',
  strokeWidth = 1.5,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconTrendLine(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 13.5 L13.5 2.5" />
      <circle cx="2.5" cy="13.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="2.5" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconHorizontal(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.5 8 H14.5" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconVertical(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 1.5 V14.5" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconFib(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2 13.5 H14" />
      <path d="M2 9.5 H14" opacity={0.85} />
      <path d="M2 6.5 H14" opacity={0.7} />
      <path d="M2 2.5 H14" />
      <path d="M3 13.5 L12 2.5" opacity={0.5} />
    </Svg>
  );
}

export function IconAnnotate(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12.5 L3 4.5 L9 4.5 L13 8.5 L13 12.5 Z" />
      <path d="M9 4.5 V8.5 H13" />
      <path d="M5.5 9.5 H10.5" />
      <path d="M5.5 11.5 H8.5" />
    </Svg>
  );
}

export function IconChevron(p: IconProps) {
  return (
    <Svg {...p} size={p.size ?? 8} viewBox="0 0 8 8" strokeWidth={1.4}>
      <path d="M2.5 1.5 L5.5 4 L2.5 6.5" />
    </Svg>
  );
}

export function IconPalette(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2.5 A5.5 5.5 0 1 0 11.5 11.5" />
      <circle cx="5.5" cy="6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconMagnet(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 2.5 V7.5 A3.5 3.5 0 0 0 11.5 7.5 V2.5" />
      <path d="M4.5 2.5 H6.5 V7.5 A1.5 1.5 0 0 0 9.5 7.5 V2.5 H11.5" />
    </Svg>
  );
}

export function IconEye(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.5 8 C3.5 4.5 5.5 3 8 3 C10.5 3 12.5 4.5 14.5 8 C12.5 11.5 10.5 13 8 13 C5.5 13 3.5 11.5 1.5 8 Z" />
      <circle cx="8" cy="8" r="2" />
    </Svg>
  );
}

export function IconEyeOff(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.5 8 C3.5 4.5 5.5 3 8 3 C10.5 3 12.5 4.5 14.5 8 C12.5 11.5 10.5 13 8 13 C5.5 13 3.5 11.5 1.5 8 Z" />
      <circle cx="8" cy="8" r="2" />
      <path d="M3 13 L13 3" />
    </Svg>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 5.5 H12.5" />
      <path d="M6 5.5 V3.5 H10 V5.5" />
      <path d="M5 5.5 L5.5 13 H10.5 L11 5.5" />
    </Svg>
  );
}

export function IconStar(p: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = p;
  return (
    <Svg {...rest}>
      <path
        d="M8 2.2 L9.7 5.8 L13.7 6.2 L10.7 8.9 L11.6 12.8 L8 10.8 L4.4 12.8 L5.3 8.9 L2.3 6.2 L6.3 5.8 Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Svg>
  );
}

export const GROUP_TOOL_ICONS: Record<DrawingToolGroupId, (p: IconProps) => ReactElement> = {
  singleLine: IconTrendLine,
  horizontal: IconHorizontal,
  vertical: IconVertical,
  multi: IconFib,
  annotate: IconAnnotate,
};
