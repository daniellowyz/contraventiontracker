import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { employeesApi } from '@/api/employees.api';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getLevelName, getLevelColor } from '@/lib/utils';
import { Eye, User, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

type SortField = 'points' | 'contraventions' | 'stage' | null;
type SortDirection = 'asc' | 'desc';

// Stage order for sorting (higher stage = more severe)
const STAGE_ORDER: Record<string, number> = {
  'LEVEL_0': 0,
  'LEVEL_1': 1,
  'LEVEL_2': 2,
  'LEVEL_3': 3,
};

export function EmployeesListPage() {
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: employeesApi.getAll,
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction or clear sort
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedEmployees = useMemo(() => {
    if (!employees || !sortField) return employees;

    return [...employees].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'points':
          comparison = a.points - b.points;
          break;
        case 'contraventions':
          comparison = a.contraventionCount - b.contraventionCount;
          break;
        case 'stage':
          const stageA = STAGE_ORDER[a.currentLevel || 'LEVEL_0'] || 0;
          const stageB = STAGE_ORDER[b.currentLevel || 'LEVEL_0'] || 0;
          comparison = stageA - stageB;
          break;
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [employees, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortDirection === 'desc'
      ? <ChevronDown className="w-4 h-4 text-blue-600" />
      : <ChevronUp className="w-4 h-4 text-blue-600" />;
  };

  return (
    <div className="min-h-screen">
      <Header title="Employees" subtitle="View employee contravention records" />

      <div className="p-6 sm:p-8 lg:p-12 xl:p-16 relative z-10">
        <div className="max-w-6xl mx-auto">
        <Card padding="none">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : !sortedEmployees?.length ? (
            <div className="p-8 text-center text-gray-500">No employees found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('points')}
                    >
                      <div className="flex items-center gap-1">
                        Points
                        <SortIcon field="points" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('stage')}
                    >
                      <div className="flex items-center gap-1">
                        Stage
                        <SortIcon field="stage" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleSort('contraventions')}
                    >
                      <div className="flex items-center gap-1">
                        Contraventions
                        <SortIcon field="contraventions" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {sortedEmployees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-orange-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-gray-500" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                            <div className="text-xs text-gray-500">{employee.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {employee.department?.name || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-medium ${employee.points >= 5 ? 'text-red-600' : 'text-gray-900'}`}>
                          {employee.points}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {employee.currentLevel ? (
                          <Badge className={getLevelColor(employee.currentLevel)}>
                            {getLevelName(employee.currentLevel)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {employee.contraventionCount}
                      </td>
                      <td className="px-6 py-4">
                        <Link to={`/employees/${employee.id}`}>
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
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}
