import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { router } from './router'

if (import.meta.env.DEV) {
  const { start } = await import('react-scan')
  start()
}

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
