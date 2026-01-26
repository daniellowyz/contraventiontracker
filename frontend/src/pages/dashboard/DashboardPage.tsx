import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportsApi } from '@/api/reports.api';
import { Header } from '@/components/layout/Header';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, getLevelName, getLevelColor } from '@/lib/utils';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Users } from 'lucide-react';

// Colors for pie chart - Browserbase style (keys match backend: 1-2, 3-4, 5+)
const POINTS_COLORS: Record<string, string> = {
  '1-2': '#ea580c',  // orange-600
  '3-4': '#f59e0b',  // amber-500
  '5+': '#a855f7',   // purple-500
};

// Stat card styles - Browserbase style with top borders
const STAT_CARD_STYLES = {
  total: {
    card: 'stat-card-orange card-interactive',
    icon: 'text-orange-600',
  },
  pending: {
    card: 'stat-card-amber card-interactive',
    icon: 'text-amber-500',
  },
  highPoints: {
    card: 'stat-card-purple card-interactive',
    icon: 'text-purple-500',
  },
  value: {
    card: 'stat-card-teal card-interactive',
    icon: 'text-teal-500',
  },
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: reportsApi.getDashboard,
  });

  const handleChartClick = (data: { activePayload?: Array<{ payload: { month: string } }> }) => {
    if (data.activePayload && data.activePayload.length > 0) {
      const month = data.activePayload[0].payload.month; // format: "2024-01"
      const [year, monthNum] = month.split('-');
      const dateFrom = `${year}-${monthNum}-01`;
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      const dateTo = `${year}-${monthNum}-${lastDay.toString().padStart(2, '0')}`;
      navigate(`/contraventions?dateFrom=${dateFrom}&dateTo=${dateTo}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Header title="Dashboard" subtitle="Overview of procurement contraventions" />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <div className="flex items-center gap-4">
                  <div className="skeleton w-10 h-10" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3 w-20" />
                    <div className="skeleton h-6 w-16" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <div className="skeleton h-4 w-28 mb-6" />
              <div className="skeleton h-64 w-full" />
            </Card>
            <Card>
              <div className="skeleton h-4 w-20 mb-6" />
              <div className="skeleton h-64 w-full" />
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const pointsData = stats.byPoints ? Object.entries(stats.byPoints)
    .filter(([, value]) => value > 0)
    .map(([range, value]) => ({
      name: `${range} pts`,
      value,
      color: POINTS_COLORS[range] || '#52525b',
    })) : [];

  const statCards = [
    {
      label: 'Total Contraventions',
      value: stats.summary.totalContraventions ?? 0,
      colorKey: 'total' as const,
    },
    {
      label: 'Pending Acknowledgment',
      value: stats.summary.pendingAcknowledgment ?? 0,
      colorKey: 'pending' as const,
    },
    {
      label: 'High Points Issues',
      value: stats.summary.highPointsIssues ?? 0,
      colorKey: 'highPoints' as const,
    },
    {
      label: 'Total Value Affected',
      value: formatCurrency(stats.summary.totalValueAffected ?? 0),
      colorKey: 'value' as const,
    },
  ];

  return (
    <div className="min-h-screen">
      <Header title="Dashboard" subtitle="Overview of procurement contraventions" />

      <div className="p-6 sm:p-8 lg:p-12 xl:p-16 relative z-10">
        <div className="max-w-6xl mx-auto space-y-8 lg:space-y-12">
        {/* Summary Cards - Browserbase big number style */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border-2 border-neutral-300 bg-white relative z-10">
          {statCards.map((stat, idx) => {
            const styles = STAT_CARD_STYLES[stat.colorKey];
            return (
              <div key={idx} className={`p-4 sm:p-6 ${styles.card} ${idx % 2 === 0 ? 'border-r-2 border-neutral-300' : ''} ${idx < 2 ? 'lg:border-r-2 border-b-2 lg:border-b-0' : 'lg:border-r-2'} ${idx === 3 ? 'lg:border-r-0' : ''}`}>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 tracking-tight truncate">{stat.value}</p>
                <p className="text-[10px] sm:text-[11px] lg:text-[12px] text-neutral-500 mt-1 sm:mt-2 font-medium">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Monthly Trend */}
          <Card className="lg:col-span-2 chart-card card-hover" padding="md">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 bg-orange-600 border-2 border-orange-700"></div>
              <CardTitle>Monthly Trend</CardTitle>
            </div>
            <div className="h-48 sm:h-56 lg:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.monthlyTrend} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ea580c" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(val) => val.split('-')[1]}
                    tick={{ fontSize: 11, fill: '#78716c' }}
                    axisLine={{ stroke: '#e7e5e4' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#78716c' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [value, 'Contraventions']}
                    labelFormatter={(label) => `Month: ${label}`}
                    contentStyle={{
                      borderRadius: '0',
                      border: '1px solid #e7e5e4',
                      backgroundColor: '#ffffff',
                      color: '#57534e',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#1c1917' }}
                    labelStyle={{ color: '#78716c' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#ea580c"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                    activeDot={{
                      r: 5,
                      stroke: '#c2410c',
                      strokeWidth: 2,
                      fill: '#ffffff',
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* By Points */}
          <Card className="chart-card card-hover" padding="md">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 bg-purple-500 border-2 border-purple-600"></div>
              <CardTitle>By Points</CardTitle>
            </div>
            <div className="h-48 sm:h-56 lg:h-64">
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
                      innerRadius={45}
                      label={({ name, value }) => `${name}: ${value}`}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {pointsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '0',
                        border: '1px solid #e7e5e4',
                        backgroundColor: '#ffffff',
                        color: '#57534e',
                        fontSize: '12px',
                      }}
                      itemStyle={{ color: '#1c1917' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-stone-400 text-[12px]">
                  No data available
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Employees at Risk */}
        <Card className="card-hover" padding="md">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 bg-amber-500 border-2 border-amber-600"></div>
            <CardTitle>Employees at Risk</CardTitle>
          </div>
          {stats.employeesAtRisk.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 bg-stone-100 flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-stone-400" />
              </div>
              <p className="text-stone-600 text-[13px] font-normal">No employees currently at risk</p>
              <p className="text-stone-400 text-[11px] mt-1">All employees are within acceptable thresholds</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.employeesAtRisk.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between p-4 bg-stone-50/80 border border-stone-200 hover:border-stone-300 hover:bg-stone-100/80 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-stone-200/80 flex items-center justify-center rounded-full">
                      <span className="text-sm font-semibold text-stone-600">
                        {emp.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-stone-900">{emp.name}</p>
                      <p className="text-[11px] text-stone-500">{emp.points} points</p>
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
    </div>
  );
}
