import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">PDC Enterprise</h1>
        <p className="text-slate-600">Enterprise Project Delivery Dashboard</p>
        <div className="flex gap-3 justify-center">
          <Link href="/login" className="px-4 py-2 bg-slate-900 text-white rounded">Login</Link>
          <Link href="/dashboard" className="px-4 py-2 border border-slate-300 rounded">Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
