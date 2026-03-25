import { Component, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DeviceDetailPage from './pages/DeviceDetailPage'
import EditorPage from './pages/EditorPage'
import DeviceBuilderPage from './pages/DeviceBuilderPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-950 text-white p-8">
          <div className="max-w-lg text-center">
            <div className="text-red-400 text-4xl mb-4">⚠</div>
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-slate-400 text-sm mb-4">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.history.back() }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
            >
              Go back
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/devices/:id" element={<RequireAuth><ErrorBoundary><DeviceDetailPage /></ErrorBoundary></RequireAuth>} />
          <Route path="/editor" element={<RequireAuth><ErrorBoundary><EditorPage /></ErrorBoundary></RequireAuth>} />
          <Route path="/devices/:id/builder" element={<RequireAuth><ErrorBoundary><DeviceBuilderPage /></ErrorBoundary></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
