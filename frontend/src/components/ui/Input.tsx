import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-[13px] font-medium text-stone-700 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full px-3 py-2 text-[13px] font-normal',
            'bg-white border border-stone-300 text-stone-900',
            'placeholder:text-stone-400',
            'focus:outline-none focus:border-stone-900',
            'disabled:bg-stone-50 disabled:text-stone-500 disabled:cursor-not-allowed',
            'transition-colors',
            error && 'border-red-500 focus:border-red-500',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
