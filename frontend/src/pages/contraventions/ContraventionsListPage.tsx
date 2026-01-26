import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { contraventionsApi, ContraventionFilters } from '@/api/contraventions.api';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { MonthYearPicker } from '@/components/ui/MonthYearPicker';
import { formatDate, formatCurrency, getStatusColor } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Plus, ChevronLeft, ChevronRight, Eye, Trash2, FileWarning } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'PENDING_UPLOAD', label: 'Pending Approval' },
  { value: 'PENDING_REVIEW', label: 'Admin Review' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'COMPLETED', label: 'Completed' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING_UPLOAD: 'Pending Approval',
  PENDING_REVIEW: 'Admin Review',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
};

export function ContraventionsListPage() {
  const { isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize filters from URL search params
  const getInitialFilters = (): ContraventionFilters => {
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);

    return {
      dateFrom,
      dateTo,
      status,
      search,
      page,
      limit: 20,
    };
  };

  const [filters, setFilters] = useState<ContraventionFilters>(getInitialFilters);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string>('');

  // Sync URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.status) params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    if (filters.page && filters.page > 1) params.set('page', filters.page.toString());

    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

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
    <div className="min-h-screen">
      <Header
        title="Contraventions"
        subtitle="Manage procurement contraventions"
        actions={
          <Link to="/contraventions/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Contravention
            </Button>
          </Link>
        }
      />

      <div className="p-6 sm:p-8 lg:p-12 xl:p-16 relative z-10">
        <div className="max-w-6xl mx-auto">
        {/* Filters + Table Container */}
        <Card padding="none">
          {/* Filters */}
          <div className="p-5 border-b border-stone-200">
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
              <div className="flex-1">
                <Input
                  placeholder="Search by reference, description, or employee..."
                  value={filters.search || ''}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div>
          {isLoading ? (
            <div className="p-6">
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <div className="skeleton h-4 w-24" />
                    <div className="skeleton h-4 w-32" />
                    <div className="skeleton h-4 w-28" />
                    <div className="skeleton h-5 w-16" />
                    <div className="skeleton h-4 w-12" />
                    <div className="skeleton h-4 w-20" />
                    <div className="skeleton h-5 w-20" />
                    <div className="skeleton h-4 w-24" />
                  </div>
                ))}
              </div>
            </div>
          ) : !data?.data.length ? (
            <div className="p-12 text-center">
              <div className="text-stone-400 mb-2">
                <FileWarning className="w-10 h-10 mx-auto" />
              </div>
              <p className="text-stone-600 text-[13px]">No contraventions found</p>
              <p className="text-[11px] text-stone-400 mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto max-h-[600px] sticky-header">
                <table className="w-full">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-stone-600 uppercase tracking-wider">Reference</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-stone-600 uppercase tracking-wider">Employee</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-stone-600 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-stone-600 uppercase tracking-wider">Points</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-stone-600 uppercase tracking-wider">Value</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-stone-600 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-stone-600 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-stone-600 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {data.data.map((contravention) => (
                      <tr
                        key={contravention.id}
                        className="hover:bg-orange-50/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/contraventions/${contravention.id}`)}
                      >
                        <td className="px-6 py-4 text-[13px] font-medium text-stone-900">
                          {contravention.referenceNo}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[13px] text-stone-900">{contravention.employee.name}</div>
                          <div className="text-[11px] text-stone-500">{contravention.employee.department?.name}</div>
                        </td>
                        <td className="px-6 py-4 text-[13px] text-stone-600">
                          {contravention.type.name}
                        </td>
                        <td className="px-6 py-4 text-[13px] text-stone-700 font-medium">
                          {contravention.points}
                        </td>
                        <td className="px-6 py-4 text-[13px] text-stone-600">
                          {formatCurrency(contravention.valueSgd)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={getStatusColor(contravention.status)}>
                            {STATUS_LABELS[contravention.status] || contravention.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-[13px] text-stone-600">
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
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
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
                <div className="px-6 py-4 border-t border-stone-200 flex items-center justify-between">
                  <p className="text-[12px] text-stone-500">
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
                    <span className="text-[12px] text-stone-600">
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
          </div>
        </Card>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 max-w-md w-full mx-4 border border-stone-200 shadow-lg">
            <h3 className="text-[15px] font-semibold text-stone-900 mb-2">Delete Contravention</h3>
            <p className="text-stone-600 text-[13px] mb-6">
              Are you sure you want to delete this contravention? This action cannot be undone and will also reverse any points assigned.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
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
