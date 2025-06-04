import * as React from 'react'

import { clsxm } from '~/lib/cn'

export interface CheckboxProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}

export const Checkbox = ({
  ref,
  checked = false,
  onCheckedChange,
  disabled = false,
  className,
  children,
  ...props
}: CheckboxProps & { ref?: React.RefObject<HTMLButtonElement | null> }) => {
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={clsxm(
        'inline-flex items-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <div
        className={clsxm(
          'flex h-4 w-4 items-center justify-center rounded border transition-colors',
          checked
            ? 'bg-accent border-accent text-white'
            : 'border-border bg-background hover:border-accent/50',
        )}
      >
        {checked && <i className="i-mingcute-check-line size-3" />}
      </div>
      {children}
    </button>
  )
}

Checkbox.displayName = 'Checkbox'
