// Test dashboard component

export default function TestDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-red-500">Test Dashboard</h1>
      <p className="text-gray-600">This is a simple test to see if components are rendering.</p>
      <div className="bg-blue-500 text-white p-4 rounded mt-4">
        If you can see this, React is working!
      </div>
    </div>
  );
}
