import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthYearPickerProps {
  value?: string; // YYYY-MM-DD format (first day of month)
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  label?: string;
  error?: string;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Generate available months from April 2025 onwards
const getAvailableMonths = () => {
  const months: Array<{ year: number; month: number; label: string; value: string }> = [];
  const now = new Date();
  const startYear = 2025;
  const startMonth = 3; // April (0-indexed: 3)
  const endYear = now.getFullYear() + 1; // Current year + 1
  const endMonth = now.getMonth(); // Current month

  for (let year = startYear; year <= endYear; year++) {
    const startM = year === startYear ? startMonth : 0;
    const endM = year === endYear ? endMonth : 11;

    for (let month = startM; month <= endM; month++) {
      const value = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      months.push({
        year,
        month,
        label: `${MONTHS[month]} ${year}`,
        value,
      });
    }
  }

  return months;
};

export function MonthYearPicker({ value, onChange, placeholder = 'Select month', label, error }: MonthYearPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(() => {
    if (value) {
      const date = new Date(value);
      return date.getFullYear();
    }
    return new Date().getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState<number | null>(() => {
    if (value) {
      const date = new Date(value);
      return date.getMonth();
    }
    return null;
  });
  const [selectedYear, setSelectedYear] = useState<number | null>(() => {
    if (value) {
      const date = new Date(value);
      return date.getFullYear();
    }
    return null;
  });

  const pickerRef = useRef<HTMLDivElement>(null);
  const availableMonths = getAvailableMonths();

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Update display year when value changes
  useEffect(() => {
    if (value) {
      const date = new Date(value);
      setDisplayYear(date.getFullYear());
      setSelectedMonth(date.getMonth());
      setSelectedYear(date.getFullYear());
    } else {
      setSelectedMonth(null);
      setSelectedYear(null);
    }
  }, [value]);

  const handleMonthClick = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  const handleDone = () => {
    if (selectedMonth !== null && selectedYear !== null) {
      const dateValue = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      onChange(dateValue);
    }
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedMonth(null);
    setSelectedYear(null);
    onChange(undefined);
    setIsOpen(false);
  };

  const handleYearChange = (direction: 'prev' | 'next') => {
    const minYear = 2025;
    const maxYear = new Date().getFullYear() + 1;

    if (direction === 'prev') {
      setDisplayYear(Math.max(minYear, displayYear - 1));
    } else {
      setDisplayYear(Math.min(maxYear, displayYear + 1));
    }
  };

  // Get months for the current display year
  const monthsForYear = availableMonths.filter(m => m.year === displayYear);
  const allMonthsInYear = Array.from({ length: 12 }, (_, i) => {
    const monthData = monthsForYear.find(m => m.month === i);
    return monthData || null;
  });

  const displayValue = value
    ? (() => {
        const date = new Date(value);
        return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
      })()
    : '';

  return (
    <div className="w-full relative" ref={pickerRef}>
      {label && (
        <label className="block text-[13px] font-medium text-stone-700 mb-1.5">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full px-3 py-2 text-[13px] font-normal text-left',
          'bg-white border border-stone-300',
          'focus:outline-none focus:border-stone-900',
          'transition-colors',
          error && 'border-red-500',
          displayValue ? 'text-stone-900' : 'text-stone-400'
        )}
      >
        {displayValue || placeholder}
      </button>
      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}

      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white shadow-lg border border-stone-200 p-4 w-64">
          {/* Year Selector */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => handleYearChange('prev')}
              disabled={displayYear <= 2025}
              className="p-1 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-stone-500" />
            </button>
            <h3 className="text-[15px] font-semibold text-stone-900">{displayYear}</h3>
            <button
              type="button"
              onClick={() => handleYearChange('next')}
              disabled={displayYear >= new Date().getFullYear() + 1}
              className="p-1 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-stone-500" />
            </button>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {allMonthsInYear.map((monthData, index) => {
              const isAvailable = monthData !== null;
              const isSelected = isAvailable &&
                selectedMonth === monthData.month &&
                selectedYear === monthData.year;
              const isCurrentMonth = isAvailable &&
                monthData.year === new Date().getFullYear() &&
                monthData.month === new Date().getMonth();

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => isAvailable && handleMonthClick(monthData.month, monthData.year)}
                  disabled={!isAvailable}
                  className={cn(
                    'px-2 py-1.5 text-[12px] font-normal transition-colors',
                    !isAvailable && 'text-stone-300 cursor-not-allowed',
                    isAvailable && !isSelected && 'text-stone-700 hover:bg-stone-100',
                    isSelected && 'bg-stone-900 text-white',
                    isCurrentMonth && !isSelected && 'bg-stone-100 text-stone-900'
                  )}
                >
                  {MONTHS[index]}
                </button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between gap-2 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-[12px] font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="px-3 py-1.5 text-[12px] font-medium text-white bg-stone-900 hover:bg-stone-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
