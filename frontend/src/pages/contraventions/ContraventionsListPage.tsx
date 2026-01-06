import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { contraventionsApi, ContraventionFilters } from '@/api/contraventions.api';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { formatDate, formatCurrency, getSeverityColor, getStatusColor } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Plus, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ESCALATED', label: 'Escalated' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severity' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

// Generate fiscal year period options (Apr-Apr)
// Current fiscal year: if we're in Jan-Apr, we're in the previous fiscal year
const generateFiscalYearOptions = () => {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed (0 = Jan, 3 = Apr)
  const currentYear = now.getFullYear();

  // Determine current fiscal year
  // If Jan-Apr (months 0-3), we're in fiscal year that started previous April
  // If May-Dec (months 4-11), we're in fiscal year that started this April
  const currentFiscalStartYear = currentMonth < 4 ? currentYear - 1 : currentYear;

  // Generate options for current and previous fiscal years
  const options = [
    { value: '', label: 'All Periods' },
  ];

  // Add fiscal years (going back 2 years from current fiscal year)
  for (let i = 0; i <= 2; i++) {
    const startYear = currentFiscalStartYear - i;
    const endYear = startYear + 1;
    options.push({
      value: `${startYear}-05-01_${endYear}-04-30`,
      label: `May ${startYear} - Apr ${endYear}`,
    });
  }

  return options;
};

const PERIOD_OPTIONS = generateFiscalYearOptions();

export function ContraventionsListPage() {
  const { isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ContraventionFilters>({
    page: 1,
    limit: 20,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['contraventions', filters],
    queryFn: () => contraventionsApi.getAll(filters),
  });

  const handleFilterChange = (key: keyof ContraventionFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  return (
    <div>
      <Header
        title="Contraventions"
        subtitle="Manage procurement contraventions"
        actions={
          isAdmin && (
            <Link to="/contraventions/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Contravention
              </Button>
            </Link>
          )
        }
      />

      <div className="p-8">
        {/* Filters */}
        <Card className="mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="w-52">
              <Select
                options={PERIOD_OPTIONS}
                value={filters.period || ''}
                onChange={(e) => handleFilterChange('period', e.target.value)}
              />
            </div>
            <div className="w-48">
              <Select
                options={STATUS_OPTIONS}
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              />
            </div>
            <div className="w-48">
              <Select
                options={SEVERITY_OPTIONS}
                value={filters.severity || ''}
                onChange={(e) => handleFilterChange('severity', e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Input
                placeholder="Search by reference, description, or employee..."
                value={filters.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card padding="none">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : !data?.data.length ? (
            <div className="p-8 text-center text-gray-500">No contraventions found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.data.map((contravention) => (
                      <tr
                        key={contravention.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate(`/contraventions/${contravention.id}`)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {contravention.referenceNo}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{contravention.employee.name}</div>
                          <div className="text-xs text-gray-500">{contravention.employee.department?.name}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {contravention.type.name}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={getSeverityColor(contravention.severity)}>
                            {contravention.severity}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                          {contravention.points}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {formatCurrency(contravention.valueSgd)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={getStatusColor(contravention.status)}>
                            {contravention.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {formatDate(contravention.incidentDate)}
                        </td>
                        <td className="px-6 py-4">
                          <Link to={`/contraventions/${contravention.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.pagination && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to{' '}
                    {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
                    {data.pagination.total} results
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={data.pagination.page === 1}
                      onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! - 1 }))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {data.pagination.page} of {data.pagination.totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={data.pagination.page === data.pagination.totalPages}
                      onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! + 1 }))}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
