import { inject } from '@vercel/analytics'
import { Outlet } from 'react-router'

import { RootProviders } from './providers/root-providers'

inject()

function App() {
  return (
    <RootProviders>
      <div className="h-svh">
        <Outlet />
      </div>
    </RootProviders>
  )
}

export default App
