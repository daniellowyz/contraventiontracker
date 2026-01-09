import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { contraventionsApi, ContraventionFilters } from '@/api/contraventions.api';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { MonthYearPicker } from '@/components/ui/MonthYearPicker';
import { formatDate, formatCurrency, getSeverityColor, getStatusColor } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Plus, ChevronLeft, ChevronRight, Eye, Trash2 } from 'lucide-react';

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


export function ContraventionsListPage() {
  const { isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ContraventionFilters>({
    page: 1,
    limit: 20,
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['contraventions', filters],
    queryFn: () => contraventionsApi.getAll(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: contraventionsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contraventions'] });
      setDeleteId(null);
    },
  });

  const handleFilterChange = (key: keyof ContraventionFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  // Convert first day of month to last day of month for dateTo
  const getLastDayOfMonth = (dateString: string): string => {
    const date = new Date(dateString);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return lastDay.toISOString().split('T')[0];
  };

  const handleDateFromChange = (value: string | undefined) => {
    const dateFrom = value || undefined;
    setFilters((prev) => {
      let dateTo = prev.dateTo;
      let error = '';
      
      // Validate date range
      if (dateFrom && dateTo) {
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        if (fromDate > toDate) {
          error = 'To date must be after From date';
          // Clear dateTo if invalid
          dateTo = undefined;
        }
      }
      
      setDateError(error);
      return { ...prev, dateFrom, dateTo, page: 1 };
    });
  };

  const handleDateToChange = (value: string | undefined) => {
    // Convert to last day of selected month
    const dateTo = value ? getLastDayOfMonth(value) : undefined;
    setFilters((prev) => {
      let error = '';
      let finalDateTo = dateTo;
      
      // Validate date range
      if (prev.dateFrom && dateTo) {
        const fromDate = new Date(prev.dateFrom);
        const toDate = new Date(dateTo);
        if (fromDate > toDate) {
          error = 'To date must be after From date';
          // Don't update dateTo if invalid
          finalDateTo = prev.dateTo;
        }
      }
      
      setDateError(error);
      return { ...prev, dateTo: finalDateTo, page: 1 };
    });
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
    }
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
            <div className="w-38">
              <MonthYearPicker
                value={filters.dateFrom}
                onChange={handleDateFromChange}
                placeholder="From MMM YYYY"
                error={dateError && filters.dateFrom ? dateError : undefined}
              />
            </div>
            <div className="w-38">
              <MonthYearPicker
                value={filters.dateTo ? (() => {
                  // Convert last day back to first day for display
                  const date = new Date(filters.dateTo);
                  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
                })() : undefined}
                onChange={handleDateToChange}
                placeholder="To MMM YYYY"
                error={dateError && filters.dateTo ? dateError : undefined}
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
                          <div className="flex items-center gap-1">
                            <Link to={`/contraventions/${contravention.id}`}>
                              <Button variant="ghost" size="sm">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleDelete(e, contravention.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
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

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Contravention</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this contravention? This action cannot be undone and will also reverse any points assigned.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
