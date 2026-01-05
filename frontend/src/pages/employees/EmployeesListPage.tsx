import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { employeesApi } from '@/api/employees.api';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getLevelName, getLevelColor } from '@/lib/utils';
import { Eye, User } from 'lucide-react';

export function EmployeesListPage() {
  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: employeesApi.getAll,
  });

  return (
    <div>
      <Header title="Employees" subtitle="View employee contravention records" />

      <div className="p-8">
        <Card padding="none">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : !employees?.length ? (
            <div className="p-8 text-center text-gray-500">No employees found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contraventions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {employees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-gray-50">
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
                        <Badge variant={employee.role === 'ADMIN' ? 'info' : 'default'}>
                          {employee.role}
                        </Badge>
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
  );
}
