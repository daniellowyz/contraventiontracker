import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/reports.api';
import { Header } from '@/components/layout/Header';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, getLevelName, getLevelColor } from '@/lib/utils';
import { Download, Building2, Tag, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function ReportsPage() {
  const { data: departmentData } = useQuery({
    queryKey: ['reports-department'],
    queryFn: reportsApi.getByDepartment,
  });

  const { data: typeData } = useQuery({
    queryKey: ['reports-type'],
    queryFn: reportsApi.getByType,
  });

  const { data: repeatOffenders } = useQuery({
    queryKey: ['reports-repeat-offenders'],
    queryFn: reportsApi.getRepeatOffenders,
  });

  const handleExport = async () => {
    try {
      await reportsApi.exportExcel();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Header
        title="Reports"
        subtitle="Analytics and export"
        actions={
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
        }
      />

      <div className="p-6 sm:p-8 lg:p-12 xl:p-16 relative z-10">
        <div className="max-w-6xl mx-auto space-y-6">
        {/* Department Breakdown */}
        <Card>
          <CardTitle className="flex items-center gap-2 mb-6">
            <Building2 className="w-5 h-5 text-blue-500" />
            By Department
          </CardTitle>
          {departmentData && departmentData.length > 0 ? (
            <>
              <div className="h-64 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentData.filter(d => d.contraventionCount > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="contraventionCount" name="Contraventions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employees</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contraventions</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Points</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {departmentData.map((dept) => (
                      <tr key={dept.id}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{dept.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{dept.employeeCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{dept.contraventionCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{dept.totalPoints}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {dept.byPoints && Object.entries(dept.byPoints).map(([pointRange, count]) => (
                              count > 0 && (
                                <Badge key={pointRange} variant="default">{count} ({pointRange}pts)</Badge>
                              )
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm">No department data available</p>
          )}
        </Card>

        {/* Type Breakdown */}
        <Card>
          <CardTitle className="flex items-center gap-2 mb-6">
            <Tag className="w-5 h-5 text-green-500" />
            By Contravention Type
          </CardTitle>
          {typeData && typeData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {typeData.filter(t => t.count > 0).map((type) => (
                    <tr key={type.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{type.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{type.category}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{type.count}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(type.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No type data available</p>
          )}
        </Card>

        {/* Repeat Offenders */}
        <Card>
          <CardTitle className="flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-red-500" />
            Repeat Offenders
          </CardTitle>
          {repeatOffenders && repeatOffenders.length > 0 ? (
            <div className="space-y-4">
              {repeatOffenders.map((offender) => (
                <div key={offender.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">{offender.name}</h4>
                      <p className="text-sm text-gray-500">{offender.department}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">{offender.contraventionCount} contraventions</p>
                      <Badge className={getLevelColor(offender.currentLevel)}>
                        {offender.totalPoints} pts - {getLevelName(offender.currentLevel)}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    Recent: {offender.recentContraventions.map(c => c.type.name).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No repeat offenders</p>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}
