import Sidebar from '../components/layout/Sidebar'
import DeviceList from '../components/DeviceList'

export default function DashboardPage() {
  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <DeviceList />
      </main>
    </div>
  )
}
