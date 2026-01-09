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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full px-3 py-2 border rounded-lg text-sm bg-white text-left',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
          error ? 'border-red-300' : 'border-gray-300',
          !displayValue && 'text-gray-400'
        )}
      >
        {displayValue || placeholder}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-64">
          {/* Year Selector */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => handleYearChange('prev')}
              disabled={displayYear <= 2025}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900">{displayYear}</h3>
            <button
              type="button"
              onClick={() => handleYearChange('next')}
              disabled={displayYear >= new Date().getFullYear() + 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
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
                    'px-3 py-2 rounded text-sm font-medium transition-colors',
                    !isAvailable && 'text-gray-300 cursor-not-allowed',
                    isAvailable && !isSelected && 'text-gray-700 hover:bg-gray-100',
                    isSelected && 'bg-gray-900 text-white',
                    isCurrentMonth && !isSelected && 'bg-gray-100 text-gray-900'
                  )}
                >
                  {MONTHS[index]}
                </button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
