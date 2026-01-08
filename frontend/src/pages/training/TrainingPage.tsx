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
import { GraduationCap, AlertTriangle, CheckCircle, Clock, Users, UserPlus } from 'lucide-react';

interface TrainingRecord {
  id: string;
  employeeId: string;
  courseId: string;
  assignedDate: string;
  dueDate: string;
  completedDate: string | null;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'WAIVED';
  pointsCredited: boolean;
  employee: {
    id: string;
    name: string;
    email: string;
    employeeId: string;
    department?: { name: string };
    pointsRecord?: { totalPoints: number };
  };
  course: {
    id: string;
    name: string;
    description: string | null;
    durationHours: number;
    provider: string;
  };
}

interface EmployeeNeedingTraining {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  department?: { name: string };
  pointsRecord?: { totalPoints: number; currentLevel: string | null };
  trainingRecords: { completedDate: string }[];
}

interface Course {
  id: string;
  name: string;
  description: string | null;
  durationHours: number;
  provider: string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'WAIVED', label: 'Waived' },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800';
    case 'ASSIGNED':
      return 'bg-yellow-100 text-yellow-800';
    case 'OVERDUE':
      return 'bg-red-100 text-red-800';
    case 'WAIVED':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export function TrainingPage() {
  const { isAdmin } = useAuthStore();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'records' | 'needs-training'>('records');
  const [assignModal, setAssignModal] = useState<{ open: boolean; employeeId: string; employeeName: string } | null>(null);
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());

  // Fetch all training records (without filter) for stats
  const { data: allTrainingRecords } = useQuery({
    queryKey: ['training-records-all'],
    queryFn: async () => {
      const response = await client.get('/admin/training');
      return response.data.data as TrainingRecord[];
    },
  });

  // Fetch training records with filter for display
  const { data: trainingRecords, isLoading: recordsLoading } = useQuery({
    queryKey: ['training-records', statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const response = await client.get(`/admin/training${params}`);
      return response.data.data as TrainingRecord[];
    },
    enabled: activeTab === 'records',
  });

  // Fetch employees needing training (>3 points) - always fetch for stats
  const { data: employeesNeedingTraining, isLoading: needsTrainingLoading, error: needsTrainingError } = useQuery({
    queryKey: ['needs-training'],
    queryFn: async () => {
      const response = await client.get('/admin/training/needs-training');
      return response.data.data as EmployeeNeedingTraining[];
    },
    retry: 1,
  });

  // Log error for debugging
  if (needsTrainingError) {
    console.error('Error fetching employees needing training:', needsTrainingError);
  }

  // Fetch courses for assignment
  const { data: courses } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const response = await client.get('/admin/courses');
      return response.data.data as Course[];
    },
  });

  // Assign training mutation
  const assignTrainingMutation = useMutation({
    mutationFn: async ({ employeeId, courseId }: { employeeId: string; courseId: string }) => {
      const response = await client.post('/admin/training/assign', { employeeId, courseId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-records'] });
      queryClient.invalidateQueries({ queryKey: ['training-records-all'] });
      queryClient.invalidateQueries({ queryKey: ['needs-training'] });
      setAssignModal(null);
      setSelectedCourse('');
    },
  });

  // Bulk assign training mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async ({ employeeIds, courseId }: { employeeIds: string[]; courseId: string }) => {
      const results = await Promise.allSettled(
        employeeIds.map((employeeId) =>
          client.post('/admin/training/assign', { employeeId, courseId })
        )
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-records'] });
      queryClient.invalidateQueries({ queryKey: ['training-records-all'] });
      queryClient.invalidateQueries({ queryKey: ['needs-training'] });
      setBulkAssignModal(false);
      setSelectedCourse('');
      setSelectedEmployees(new Set());
    },
  });

  // Update training status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await client.patch(`/admin/training/${id}/status`, { status });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-records'] });
      queryClient.invalidateQueries({ queryKey: ['training-records-all'] });
      queryClient.invalidateQueries({ queryKey: ['needs-training'] });
    },
  });

  const handleAssignTraining = () => {
    if (assignModal && selectedCourse) {
      assignTrainingMutation.mutate({
        employeeId: assignModal.employeeId,
        courseId: selectedCourse,
      });
    }
  };

  const handleBulkAssign = () => {
    if (selectedEmployees.size > 0 && selectedCourse) {
      bulkAssignMutation.mutate({
        employeeIds: Array.from(selectedEmployees),
        courseId: selectedCourse,
      });
    }
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployees((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (!employeesNeedingTraining) return;
    if (selectedEmployees.size === employeesNeedingTraining.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(employeesNeedingTraining.map((e) => e.id)));
    }
  };

  // Calculate stats from all training records (not filtered)
  const stats = {
    total: allTrainingRecords?.length || 0,
    assigned: allTrainingRecords?.filter((r) => r.status === 'ASSIGNED').length || 0,
    inProgress: allTrainingRecords?.filter((r) => r.status === 'IN_PROGRESS').length || 0,
    completed: allTrainingRecords?.filter((r) => r.status === 'COMPLETED').length || 0,
    overdue: allTrainingRecords?.filter((r) => r.status === 'OVERDUE').length || 0,
    needsTraining: employeesNeedingTraining?.length || 0,
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
        title="Training Management"
        subtitle="Manage employee training assignments and track completion"
      />

      <div className="p-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Users className="w-8 h-8 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.needsTraining}</div>
            <div className="text-sm text-gray-500">Needs Training (&gt;3 pts)</div>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.assigned}</div>
            <div className="text-sm text-gray-500">Assigned</div>
          </Card>
          <Card className="text-center">
            <div className="flex items-center justify-center mb-2">
              <GraduationCap className="w-8 h-8 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.inProgress}</div>
            <div className="text-sm text-gray-500">In Progress</div>
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
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.overdue}</div>
            <div className="text-sm text-gray-500">Overdue</div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'records'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('records')}
          >
            Training Records
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'needs-training'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('needs-training')}
          >
            Employees Needing Training
            {stats.needsTraining > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                {stats.needsTraining}
              </span>
            )}
          </button>
        </div>

        {/* Training Records Tab */}
        {activeTab === 'records' && (
          <>
            {/* Filter */}
            <Card className="mb-6">
              <div className="flex items-center gap-4">
                <div className="w-48">
                  <Select
                    options={STATUS_OPTIONS}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Records Table */}
            <Card padding="none">
              {recordsLoading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : !trainingRecords?.length ? (
                <div className="p-8 text-center text-gray-500">No training records found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {trainingRecords.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{record.employee.name}</div>
                            <div className="text-xs text-gray-500">{record.employee.department?.name || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{record.course.name}</div>
                            <div className="text-xs text-gray-500">{record.course.provider}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium text-gray-900">
                              {record.employee.pointsRecord?.totalPoints || 0} pts
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {formatDate(record.assignedDate)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {formatDate(record.dueDate)}
                          </td>
                          <td className="px-6 py-4">
                            <Badge className={getStatusColor(record.status)}>
                              {record.status.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            {record.status !== 'COMPLETED' && record.status !== 'WAIVED' && (
                              <div className="flex gap-2">
                                {record.status === 'ASSIGNED' && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => updateStatusMutation.mutate({ id: record.id, status: 'IN_PROGRESS' })}
                                    disabled={updateStatusMutation.isPending}
                                  >
                                    Start
                                  </Button>
                                )}
                                {(record.status === 'ASSIGNED' || record.status === 'IN_PROGRESS') && (
                                  <Button
                                    size="sm"
                                    onClick={() => updateStatusMutation.mutate({ id: record.id, status: 'COMPLETED' })}
                                    disabled={updateStatusMutation.isPending}
                                  >
                                    Complete
                                  </Button>
                                )}
                              </div>
                            )}
                            {record.status === 'COMPLETED' && (
                              <span className="text-xs text-green-600">
                                {record.pointsCredited ? '(1 pt credited)' : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {/* Employees Needing Training Tab */}
        {activeTab === 'needs-training' && (
          <>
            {/* Bulk Actions */}
            {employeesNeedingTraining && employeesNeedingTraining.length > 0 && (
              <Card className="mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.size === employeesNeedingTraining.length && employeesNeedingTraining.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">
                      {selectedEmployees.size > 0
                        ? `${selectedEmployees.size} employee${selectedEmployees.size > 1 ? 's' : ''} selected`
                        : 'Select employees for bulk assignment'}
                    </span>
                  </div>
                  {selectedEmployees.size > 0 && (
                    <Button onClick={() => setBulkAssignModal(true)}>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Assign Training to {selectedEmployees.size} Employee{selectedEmployees.size > 1 ? 's' : ''}
                    </Button>
                  )}
                </div>
              </Card>
            )}

            <Card padding="none">
              {needsTrainingLoading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : !employeesNeedingTraining?.length ? (
                <div className="p-8 text-center text-gray-500">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p>No employees currently need training</p>
                  <p className="text-sm mt-2">Employees with more than 3 points will appear here</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                          <input
                            type="checkbox"
                            checked={selectedEmployees.size === employeesNeedingTraining.length}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Training</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {employeesNeedingTraining.map((employee) => (
                        <tr
                          key={employee.id}
                          className={`hover:bg-gray-50 ${selectedEmployees.has(employee.id) ? 'bg-blue-50' : ''}`}
                        >
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedEmployees.has(employee.id)}
                              onChange={() => toggleEmployeeSelection(employee.id)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                            <div className="text-xs text-gray-500">{employee.email}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {employee.department?.name || 'N/A'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-bold ${
                              (employee.pointsRecord?.totalPoints || 0) >= 5
                                ? 'text-red-600'
                                : 'text-orange-600'
                            }`}>
                              {employee.pointsRecord?.totalPoints || 0} pts
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {employee.pointsRecord?.currentLevel ? (
                              <Badge className="bg-purple-100 text-purple-800">
                                {employee.pointsRecord.currentLevel.replace('_', ' ')}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {employee.trainingRecords.length > 0
                              ? formatDate(employee.trainingRecords[0].completedDate)
                              : 'Never'}
                          </td>
                          <td className="px-6 py-4">
                            <Button
                              size="sm"
                              onClick={() => setAssignModal({
                                open: true,
                                employeeId: employee.id,
                                employeeName: employee.name,
                              })}
                            >
                              Assign Training
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Assign Training Modal (Single) */}
      {assignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Assign Training to {assignModal.employeeName}
            </h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Course
              </label>
              <Select
                options={[
                  { value: '', label: 'Select a course...' },
                  ...(courses?.map((c) => ({ value: c.id, label: c.name })) || []),
                ]}
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
              />
              {selectedCourse && courses && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md text-sm">
                  {(() => {
                    const course = courses.find((c) => c.id === selectedCourse);
                    return course ? (
                      <>
                        <p className="text-gray-600">{course.description || 'No description'}</p>
                        <p className="text-gray-500 mt-1">
                          Duration: {course.durationHours} hours | Provider: {course.provider}
                        </p>
                      </>
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => {
                setAssignModal(null);
                setSelectedCourse('');
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleAssignTraining}
                disabled={!selectedCourse || assignTrainingMutation.isPending}
              >
                {assignTrainingMutation.isPending ? 'Assigning...' : 'Assign Training'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Training Modal */}
      {bulkAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Bulk Assign Training
            </h3>

            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>{selectedEmployees.size}</strong> employee{selectedEmployees.size > 1 ? 's' : ''} selected
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Training will be assigned to all selected employees
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Course
              </label>
              <Select
                options={[
                  { value: '', label: 'Select a course...' },
                  ...(courses?.map((c) => ({ value: c.id, label: c.name })) || []),
                ]}
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
              />
              {selectedCourse && courses && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md text-sm">
                  {(() => {
                    const course = courses.find((c) => c.id === selectedCourse);
                    return course ? (
                      <>
                        <p className="text-gray-600">{course.description || 'No description'}</p>
                        <p className="text-gray-500 mt-1">
                          Duration: {course.durationHours} hours | Provider: {course.provider}
                        </p>
                      </>
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => {
                setBulkAssignModal(false);
                setSelectedCourse('');
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleBulkAssign}
                disabled={!selectedCourse || bulkAssignMutation.isPending}
              >
                {bulkAssignMutation.isPending
                  ? 'Assigning...'
                  : `Assign to ${selectedEmployees.size} Employee${selectedEmployees.size > 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
