import React, { useEffect } from 'react'
import { Portal } from '@headlessui/react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import MainPageComponent from './components/MainPage'
import { ThemeProvider } from './contexts/ThemeContext'

// El vault y el embedding model están pre-configurados en el main process (index.ts)
// No hay onboarding — la app abre directo en MainPage

const App: React.FC = () => {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  useEffect(() => {
    window.ipcRenderer.receive('error-to-display-in-window', (error: string) => {
      toast.error(error, { className: 'mt-5', autoClose: false, closeOnClick: false, draggable: false })
    })
  }, [])

  return (
    <ThemeProvider>
      <div className="max-h-screen font-sans">
        <Portal>
          <ToastContainer
            theme="dark"
            position="bottom-right"
            autoClose={3000}
            hideProgressBar={false}
            closeOnClick
            pauseOnHover
            toastClassName="text-xs"
          />
        </Portal>
        <MainPageComponent />
      </div>
    </ThemeProvider>
  )
}

export default App
