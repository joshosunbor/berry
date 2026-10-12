/** The Berry mark: a cyan berry with a green leaf. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 22 22">
      <circle cx="11" cy="13" r="8" fill="#09A5DB" />
      <path d="M11 5 C11 2.5 13 1 16 1 C16 3.5 14 5 11 5 Z" fill="#3BB75E" />
    </svg>
  )
}
