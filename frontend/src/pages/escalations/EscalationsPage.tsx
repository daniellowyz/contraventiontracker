import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import client from '@/api/client';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  FileWarning,
  Shield,
  RefreshCw,
} from 'lucide-react';

interface Escalation {
  id: string;
  employeeId: string;
  level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | 'LEVEL_4' | 'LEVEL_5';
  triggeredAt: string;
  triggerPoints: number;
  actionsRequired: string[];
  actionsCompleted: string[];
  dueDate: string;
  completedAt: string | null;
  notes: string | null;
  employee: {
    id: string;
    name: string;
    department?: { name: string };
  };
}

const LEVEL_OPTIONS = [
  { value: '', label: 'All Levels' },
  { value: 'LEVEL_1', label: 'Level 1 - Verbal Advisory (1-2 pts)' },
  { value: 'LEVEL_2', label: 'Level 2 - Mandatory Training (3+ pts)' },
  { value: 'LEVEL_3', label: 'Level 3 - Performance Impact' },
];

const COMPLETION_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
];

const getLevelConfig = (level: string) => {
  const configs: Record<string, { name: string; color: string; bgColor: string; icon: React.ReactNode; description: string }> = {
    LEVEL_1: {
      name: 'Level 1 - Verbal Advisory',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-100',
      icon: <Clock className="w-5 h-5 text-yellow-600" />,
      description: '1-2 points: Finance verbal advisory on prevention',
    },
    LEVEL_2: {
      name: 'Level 2 - Mandatory Training',
      color: 'text-orange-700',
      bgColor: 'bg-orange-100',
      icon: <FileWarning className="w-5 h-5 text-orange-600" />,
      description: '3+ points: Complete training within 30 days',
    },
    LEVEL_3: {
      name: 'Level 3 - Performance Impact',
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
      description: 'Post-training offense or >3pt single offense',
    },
  };
  return configs[level] || configs.LEVEL_1;
};

export function EscalationsPage() {
  const { isAdmin } = useAuthStore();
  const queryClient = useQueryClient();
  const [levelFilter, setLevelFilter] = useState('');
  const [completionFilter, setCompletionFilter] = useState('');

  // Fetch escalations
  const { data: escalations, isLoading } = useQuery({
    queryKey: ['escalations', levelFilter, completionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (levelFilter) params.append('level', levelFilter);
      if (completionFilter) params.append('completed', completionFilter === 'completed' ? 'true' : 'false');
      const queryString = params.toString();
      const response = await client.get(`/admin/escalations${queryString ? `?${queryString}` : ''}`);
      return response.data.data as Escalation[];
    },
  });

  // Complete action mutation
  const completeActionMutation = useMutation({
    mutationFn: async ({ escalationId, action }: { escalationId: string; action: string }) => {
      const response = await client.patch(`/admin/escalations/${escalationId}/complete-action`, { action });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalations'] });
    },
  });

  // Recalculate all escalations mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const response = await client.post('/admin/escalations/recalculate');
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['escalations'] });
      alert(`Recalculation complete!\n\nEmployees updated: ${data.data.employeesUpdated}\nOld escalations archived: ${data.data.escalationsArchived}\nNew escalations created: ${data.data.newEscalationsCreated}`);
    },
    onError: (error: Error) => {
      alert(`Error recalculating: ${error.message}`);
    },
  });

  // Calculate stats
  const stats = {
    total: escalations?.length || 0,
    pending: escalations?.filter((e) => !e.completedAt).length || 0,
    completed: escalations?.filter((e) => e.completedAt).length || 0,
    level1: escalations?.filter((e) => e.level === 'LEVEL_1').length || 0,
    level2: escalations?.filter((e) => e.level === 'LEVEL_2').length || 0,
    level3: escalations?.filter((e) => e.level === 'LEVEL_3').length || 0,
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-500">You need admin access to view this page.</p>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Escalations Management"
        subtitle="Track and manage employee escalation levels based on contravention points"
      />

      <div className="p-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Users className="w-8 h-8 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-500">Total Escalations</div>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.pending}</div>
            <div className="text-sm text-gray-500">Pending</div>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.completed}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.level1}</div>
            <div className="text-sm text-gray-500">Level 1</div>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <FileWarning className="w-8 h-8 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.level2}</div>
            <div className="text-sm text-gray-500">Level 2</div>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.level3}</div>
            <div className="text-sm text-gray-500">Level 3</div>
          </Card>
        </div>

        {/* Escalation Levels Reference */}
        <Card className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            Escalation Levels Reference
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {['LEVEL_1', 'LEVEL_2', 'LEVEL_3'].map((level) => {
              const config = getLevelConfig(level);
              return (
                <div key={level} className={`${config.bgColor} rounded-lg p-3`}>
                  <div className="flex items-center gap-2 mb-1">
                    {config.icon}
                    <span className={`text-sm font-medium ${config.color}`}>
                      {config.name.split(' - ')[0]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{config.description}</p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Filters */}
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-64">
                <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                <Select
                  options={LEVEL_OPTIONS}
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                />
              </div>
              <div className="w-48">
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select
                  options={COMPLETION_OPTIONS}
                  value={completionFilter}
                  onChange={(e) => setCompletionFilter(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={() => {
                if (confirm('This will recalculate all employee escalation levels based on the current 3-level system. Continue?')) {
                  recalculateMutation.mutate();
                }
              }}
              disabled={recalculateMutation.isPending}
              variant="secondary"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
              {recalculateMutation.isPending ? 'Recalculating...' : 'Recalculate All'}
            </Button>
          </div>
        </Card>

        {/* Escalations List */}
        <div className="space-y-4">
          {isLoading ? (
            <Card>
              <div className="p-8 text-center text-gray-500">Loading escalations...</div>
            </Card>
          ) : !escalations?.length ? (
            <Card>
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-gray-500">No escalations found</p>
                <p className="text-sm text-gray-400 mt-2">
                  Escalations are triggered when employees accumulate contravention points
                </p>
              </div>
            </Card>
          ) : (
            escalations.map((escalation) => {
              const levelConfig = getLevelConfig(escalation.level);
              const isComplete = !!escalation.completedAt;
              const progress = escalation.actionsRequired.length > 0
                ? Math.round((escalation.actionsCompleted.length / escalation.actionsRequired.length) * 100)
                : 0;

              return (
                <Card key={escalation.id} className={isComplete ? 'opacity-75' : ''}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${levelConfig.bgColor}`}>
                        {levelConfig.icon}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{escalation.employee.name}</h4>
                        <p className="text-sm text-gray-500">
                          {escalation.employee.department?.name || 'No Department'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={`${levelConfig.bgColor} ${levelConfig.color}`}>
                        {levelConfig.name}
                      </Badge>
                      <p className="text-sm text-gray-500 mt-1">
                        {escalation.triggerPoints} points at trigger
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-gray-500">Triggered:</span>{' '}
                      <span className="font-medium">{formatDate(escalation.triggeredAt)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Due Date:</span>{' '}
                      <span className={`font-medium ${new Date(escalation.dueDate) < new Date() && !isComplete ? 'text-red-600' : ''}`}>
                        {formatDate(escalation.dueDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>{' '}
                      {isComplete ? (
                        <Badge className="bg-green-100 text-green-800">Completed</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800">In Progress</Badge>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Actions Progress</span>
                      <span className="text-gray-600">
                        {escalation.actionsCompleted.length} / {escalation.actionsRequired.length} completed
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Required Actions:</p>
                    {escalation.actionsRequired.map((action, idx) => {
                      const isActionComplete = escalation.actionsCompleted.includes(action);
                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            isActionComplete ? 'bg-green-50' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isActionComplete ? (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : (
                              <Clock className="w-5 h-5 text-gray-400" />
                            )}
                            <span className={isActionComplete ? 'text-gray-500 line-through' : 'text-gray-900'}>
                              {action}
                            </span>
                          </div>
                          {!isActionComplete && (
                            <Button
                              size="sm"
                              onClick={() => completeActionMutation.mutate({
                                escalationId: escalation.id,
                                action,
                              })}
                              disabled={completeActionMutation.isPending}
                            >
                              Mark Complete
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {escalation.notes && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Notes:</span> {escalation.notes}
                      </p>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
