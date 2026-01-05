import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/reports.api';
import { Header } from '@/components/layout/Header';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, getLevelName, getLevelColor } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, Clock, FileWarning, DollarSign } from 'lucide-react';

const SEVERITY_COLORS = {
  LOW: '#22c55e',
  MEDIUM: '#eab308',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

export function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: reportsApi.getDashboard,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const severityData = Object.entries(stats.bySeverity).map(([name, value]) => ({
    name,
    value,
    color: SEVERITY_COLORS[name as keyof typeof SEVERITY_COLORS],
  }));

  return (
    <div>
      <Header title="Dashboard" subtitle="Overview of procurement contraventions" />

      <div className="p-8 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FileWarning className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Contraventions</p>
              <p className="text-2xl font-bold text-gray-900">{stats.summary.totalContraventions}</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Acknowledgment</p>
              <p className="text-2xl font-bold text-gray-900">{stats.summary.pendingAcknowledgment}</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Critical Issues</p>
              <p className="text-2xl font-bold text-gray-900">{stats.summary.criticalIssues}</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Value Affected</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.summary.totalValueAffected)}</p>
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Trend */}
          <Card className="lg:col-span-2">
            <CardTitle className="mb-6">Monthly Trend</CardTitle>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(val) => val.split('-')[1]}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [value, 'Contraventions']}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* By Severity */}
          <Card>
            <CardTitle className="mb-6">By Severity</CardTitle>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {severityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Employees at Risk */}
        <Card>
          <CardTitle className="mb-4">Employees at Risk</CardTitle>
          {stats.employeesAtRisk.length === 0 ? (
            <p className="text-gray-500 text-sm">No employees currently at risk</p>
          ) : (
            <div className="space-y-3">
              {stats.employeesAtRisk.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {emp.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{emp.name}</p>
                      <p className="text-sm text-gray-500">{emp.points} points</p>
                    </div>
                  </div>
                  <Badge className={getLevelColor(emp.level)}>
                    {getLevelName(emp.level)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
