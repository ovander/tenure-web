import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import Aura from '@primeuix/themes/aura'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { router } from './app/router'
import { cspNonce } from './app/csp'
import './main.css'
import 'primeicons/primeicons.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: { darkModeSelector: false, cssLayer: { name: 'primevue', order: 'theme, base, primevue' } },
  },
  // PrimeVue writes its theme into <style> elements: they carry the nonce that
  // tenure's CSP allows (Q-W1).
  csp: { nonce: cspNonce() },
  ripple: false,
})
app.use(ToastService)
app.mount('#app')

if (import.meta.env.PROD) registerSW({ immediate: true })
