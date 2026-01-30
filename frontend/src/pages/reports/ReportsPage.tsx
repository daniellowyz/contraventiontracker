import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/reports.api';
import { Header } from '@/components/layout/Header';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, getLevelName, getLevelColor } from '@/lib/utils';
import { Download, Tag, Users, ArrowUp, ArrowDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TeamBreakdown } from '@/api/reports.api';

type TeamSortKey = 'name' | 'employeeCount' | 'contraventionCount' | 'totalPoints';

function sortTeamData(data: TeamBreakdown[], sortKey: TeamSortKey, sortDir: 'asc' | 'desc'): TeamBreakdown[] {
  return [...data].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') {
      cmp = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    } else {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      cmp = av === bv ? 0 : av < bv ? -1 : 1;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

export function ReportsPage() {
  const [teamSortKey, setTeamSortKey] = useState<TeamSortKey>('name');
  const [teamSortDir, setTeamSortDir] = useState<'asc' | 'desc'>('asc');

  const { data: teamData } = useQuery({
    queryKey: ['reports-team'],
    queryFn: reportsApi.getByTeam,
  });

  const sortedTeamData = useMemo(() => {
    if (!teamData || teamData.length === 0) return [];
    return sortTeamData(teamData, teamSortKey, teamSortDir);
  }, [teamData, teamSortKey, teamSortDir]);

  const handleTeamSort = (key: TeamSortKey) => {
    if (teamSortKey === key) {
      setTeamSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setTeamSortKey(key);
      setTeamSortDir('asc');
    }
  };

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
        {/* Team Breakdown */}
        <Card>
          <CardTitle className="flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-blue-500" />
            By Team
          </CardTitle>
          {teamData && teamData.length > 0 ? (
            <>
              <div className="h-64 mb-6 w-full min-h-[256px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sortedTeamData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 60 }}
                    layout="horizontal"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      angle={-35}
                      textAnchor="end"
                      height={56}
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 12 }} width={32} domain={[0, 'auto']} allowDecimals={false} />
                    <Tooltip formatter={(value: number) => [value, 'Contraventions']} />
                    <Bar dataKey="contraventionCount" name="Contraventions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        <button type="button" onClick={() => handleTeamSort('name')} className="flex items-center gap-1 hover:text-gray-700">
                          Team
                          {teamSortKey === 'name' && (teamSortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        <button type="button" onClick={() => handleTeamSort('employeeCount')} className="flex items-center gap-1 hover:text-gray-700">
                          Employees
                          {teamSortKey === 'employeeCount' && (teamSortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        <button type="button" onClick={() => handleTeamSort('contraventionCount')} className="flex items-center gap-1 hover:text-gray-700">
                          Contraventions
                          {teamSortKey === 'contraventionCount' && (teamSortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        <button type="button" onClick={() => handleTeamSort('totalPoints')} className="flex items-center gap-1 hover:text-gray-700">
                          Total Points
                          {teamSortKey === 'totalPoints' && (teamSortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedTeamData.map((team) => (
                      <tr key={team.id}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{team.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{team.employeeCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{team.contraventionCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{team.totalPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm">No team data available</p>
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
