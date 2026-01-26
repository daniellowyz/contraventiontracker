import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { employeesApi } from '@/api/employees.api';
import { Header } from '@/components/layout/Header';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate, getStatusColor, getLevelName, getLevelColor } from '@/lib/utils';
import { User, AlertTriangle, GraduationCap, ArrowLeft } from 'lucide-react';

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();

  const { data: pointsSummary, isLoading: pointsLoading } = useQuery({
    queryKey: ['employee-points', id],
    queryFn: () => employeesApi.getPoints(id!),
    enabled: !!id,
  });

  const { data: contraventions, isLoading: contraventionsLoading } = useQuery({
    queryKey: ['employee-contraventions', id],
    queryFn: () => employeesApi.getContraventions(id!),
    enabled: !!id,
  });

  const { data: escalations } = useQuery({
    queryKey: ['employee-escalations', id],
    queryFn: () => employeesApi.getEscalations(id!),
    enabled: !!id,
  });

  const isLoading = pointsLoading || contraventionsLoading;

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!pointsSummary) {
    return (
      <div className="p-8 text-center text-gray-500">Employee not found</div>
    );
  }

  const progressPercentage = pointsSummary.nextLevelThreshold
    ? (pointsSummary.totalPoints / pointsSummary.nextLevelThreshold) * 100
    : 100;

  return (
    <div className="min-h-screen bg-white">
      <Header
        title={pointsSummary.employeeName}
        subtitle="Employee Profile"
        actions={
          <Link to="/employees">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Points Summary */}
          <Card>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{pointsSummary.employeeName}</h2>
                <p className="text-sm text-gray-500">{pointsSummary.contraventionCount} contraventions</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Total Points</span>
                  <span className="font-bold text-gray-900">{pointsSummary.totalPoints}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${
                      pointsSummary.totalPoints >= 8 ? 'bg-red-500' :
                      pointsSummary.totalPoints >= 5 ? 'bg-orange-500' :
                      pointsSummary.totalPoints >= 3 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                  />
                </div>
                {pointsSummary.pointsToNextLevel && (
                  <p className="text-xs text-gray-500 mt-1">
                    {pointsSummary.pointsToNextLevel} points to next stage
                  </p>
                )}
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-gray-600 mb-2">Current Stage</p>
                {pointsSummary.currentLevel ? (
                  <Badge className={getLevelColor(pointsSummary.currentLevel)}>
                    {getLevelName(pointsSummary.currentLevel)}
                  </Badge>
                ) : (
                  <Badge variant="success">No Escalation</Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Escalation Status */}
          <Card>
            <CardTitle className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Escalation Status
            </CardTitle>
            {escalations && escalations.length > 0 ? (
              <div className="space-y-4">
                {escalations.slice(0, 3).map((esc) => (
                  <div key={esc.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <Badge className={getLevelColor(esc.level)}>
                        {getLevelName(esc.level)}
                      </Badge>
                      <span className="text-xs text-gray-500">{formatDate(esc.triggeredAt)}</span>
                    </div>
                    <div className="space-y-1">
                      {esc.actionsRequired.map((action, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className={esc.actionsCompleted.includes(action) ? 'text-green-600' : 'text-gray-600'}>
                            {esc.actionsCompleted.includes(action) ? '✓' : '○'}
                          </span>
                          <span className={esc.actionsCompleted.includes(action) ? 'line-through text-gray-400' : ''}>
                            {action}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No escalations</p>
            )}
          </Card>

          {/* Training Status */}
          <Card>
            <CardTitle className="flex items-center gap-2 mb-4">
              <GraduationCap className="w-5 h-5 text-blue-500" />
              Training Status
            </CardTitle>
            {pointsSummary.pendingTraining.length > 0 ? (
              <div className="space-y-3">
                {pointsSummary.pendingTraining.map((training) => (
                  <div key={training.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900">{training.courseName}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500">Due: {formatDate(training.dueDate)}</span>
                      <Badge variant={
                        training.status === 'COMPLETED' ? 'success' :
                        training.status === 'OVERDUE' ? 'danger' :
                        training.status === 'IN_PROGRESS' ? 'info' : 'warning'
                      }>
                        {training.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No pending training</p>
            )}
          </Card>
        </div>

        {/* Contravention History */}
        <Card>
          <CardTitle className="mb-4">Contravention History</CardTitle>
          {contraventions && contraventions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {contraventions.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <Link to={`/contraventions/${c.id}`} className="hover:text-primary-600">
                          {c.referenceNo}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{c.type.name}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">+{c.points}</td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(c.status)}>{c.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.incidentDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No contraventions recorded</p>
          )}
        </Card>

        {/* Points History */}
        <Card>
          <CardTitle className="mb-4">Points History</CardTitle>
          {pointsSummary.pointsHistory.length > 0 ? (
            <div className="space-y-2">
              {pointsSummary.pointsHistory.slice().reverse().map((entry, idx) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm text-gray-900">{entry.reason}</p>
                    <p className="text-xs text-gray-500">{formatDate(entry.date)}</p>
                  </div>
                  <span className={`text-sm font-medium ${
                    entry.type === 'add' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {entry.type === 'add' ? '+' : ''}{entry.points} pts
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No points history</p>
          )}
        </Card>
      </div>
    </div>
  );
}
