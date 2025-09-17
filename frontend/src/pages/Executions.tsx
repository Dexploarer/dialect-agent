import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CopyButton from '@/components/CopyButton';

interface ExecutionRecord {
  id: string;
  agent_id: string;
  trigger_id: string;
  event_id: string;
  success: number;
  execution_time: number;
  result: string;
  error?: string;
  created_at: string;
}

export default function Executions() {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/executions?limit=${limit}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setExecutions(data.executions || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Executions</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Recent agent executions across all agents</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
          >
            <option value={25}>Last 25</option>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
          </select>
          <button
            onClick={fetchExecutions}
            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-red-600 dark:text-red-400 text-sm">{error}</div>
      )}

      <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm table-fixed">
          <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300">
            <tr>
              <th className="text-left p-3 w-40">Time</th>
              <th className="text-left p-3 w-64">Agent</th>
              <th className="text-left p-3 w-44">Trigger</th>
              <th className="text-left p-3 w-24">Success</th>
              <th className="text-left p-3 w-32">Duration</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td className="p-4" colSpan={6}>Loading...</td>
              </tr>
            ) : executions.length === 0 ? (
              <tr>
                <td className="p-4" colSpan={6}>No executions yet.</td>
              </tr>
            ) : (
              executions.map((ex) => {
                let actions: any[] = [];
                try { actions = JSON.parse(ex.result); } catch {}
                return (
                  <tr key={ex.id}>
                    <td className="p-3 whitespace-nowrap" title={new Date(ex.created_at).toLocaleString()}>{formatTime(ex.created_at)}</td>
                    <td className="p-3 truncate align-middle">
                      <Link to={`/agents`} className="text-primary-600 dark:text-primary-400 hover:underline">
                        {ex.agent_id}
                      </Link>
                      <CopyButton value={ex.agent_id} className="ml-2" />
                    </td>
                    <td className="p-3 truncate align-middle">
                      {ex.trigger_id?.slice(0,8)}...
                      <CopyButton value={ex.trigger_id} className="ml-2" />
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${ex.success ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                        {ex.success ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="p-3">{ex.execution_time}</td>
                    <td className="p-3">
                      <details>
                        <summary className="cursor-pointer text-primary-600 dark:text-primary-400">View</summary>
                        <pre className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded overflow-auto max-h-48 text-xs break-all whitespace-pre-wrap">{JSON.stringify(actions, null, 2)}</pre>
                        {ex.error && (
                          <div className="mt-2 text-red-600 dark:text-red-400">{ex.error}</div>
                        )}
                      </details>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
