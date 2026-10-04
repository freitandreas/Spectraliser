export interface BadgeInfo {
  label: string
  title: string
  action?: () => void
  /** Short visible text of the action button; defaults to a reset arrow. */
  actionLabel?: string
}
