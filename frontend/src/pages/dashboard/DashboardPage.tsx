import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportsApi } from '@/api/reports.api';
import { Header } from '@/components/layout/Header';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, getLevelName, getLevelColor } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, Clock, FileWarning, DollarSign } from 'lucide-react';

const POINTS_COLORS = {
  '1-2': '#22c55e',
  '3-5': '#eab308',
  '6-10': '#f97316',
  '11+': '#ef4444',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: reportsApi.getDashboard,
  });

  // Handle bar chart click - navigate to contraventions filtered by month
  const handleBarClick = (data: { month: string; count: number }) => {
    if (data.count === 0) return;

    // month is in format "YYYY-MM", convert to date range
    const [year, monthStr] = data.month.split('-');
    const monthNum = parseInt(monthStr, 10);
    const dateFrom = `${year}-${monthStr}-01`;
    // Get last day of month: new Date(year, month, 0) gives last day of previous month
    // So we use monthNum (1-12) directly since JS months are 0-indexed
    const lastDay = new Date(parseInt(year), monthNum, 0).getDate();
    const dateTo = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    navigate(`/contraventions?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  };

  // Handle pie chart click - navigate to contraventions filtered by points
  const handlePointsClick = (data: { name: string; value: number }) => {
    if (data.value === 0) return;
    // Points filtering would need to be implemented in the contraventions list page
    // For now, just navigate to the contraventions page
    navigate('/contraventions');
  };

  if (isLoading) {
    return (
      <div>
        <Header title="Dashboard" subtitle="Overview of procurement contraventions" />
        <div className="p-8 space-y-6">
          {/* Skeleton stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-100/80">
                <div className="flex items-center gap-4">
                  <div className="skeleton w-12 h-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-24" />
                    <div className="skeleton h-7 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Skeleton charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-100/80">
              <div className="skeleton h-5 w-32 mb-6" />
              <div className="skeleton h-64 w-full" />
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-100/80">
              <div className="skeleton h-5 w-24 mb-6" />
              <div className="skeleton h-64 w-full rounded-full mx-auto" style={{ maxWidth: '180px' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Convert points data to chart format
  const pointsData = stats.byPoints ? Object.entries(stats.byPoints).map(([range, value]) => ({
    name: `${range} pts`,
    value,
    color: POINTS_COLORS[range as keyof typeof POINTS_COLORS] || '#6b7280',
  })) : [];

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
              <p className="text-sm text-gray-500">High Points Issues</p>
              <p className="text-2xl font-bold text-gray-900">{stats.summary.highPointsIssues}</p>
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
                <BarChart data={stats.monthlyTrend} style={{ cursor: 'pointer' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(val) => val.split('-')[1]}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [value, 'Contraventions']}
                    labelFormatter={(label) => `Month: ${label}`}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#4338ca"
                    radius={[6, 6, 0, 0]}
                    onClick={(data) => handleBarClick(data)}
                    style={{ cursor: 'pointer' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* By Points */}
          <Card>
            <CardTitle className="mb-6">By Points</CardTitle>
            <div className="h-64">
              {pointsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pointsData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, value }) => `${name}: ${value}`}
                      onClick={(data) => handlePointsClick(data)}
                      style={{ cursor: 'pointer' }}
                    >
                      {pointsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} style={{ cursor: 'pointer' }} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  No data available
                </div>
              )}
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
