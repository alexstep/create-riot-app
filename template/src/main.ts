import { component, register } from 'riot'
import { screens } from './router'
import { applyStoredTheme, watchSystemTheme } from './theme'
import './styles/reset.css'
import './styles/theme.css'
import './styles/ripple.css'
import './styles/app.css'
import './styles/components/topbar.css'
import './styles/components/drawer.css'
import './styles/components/groups.css'
import './styles/components/spinner.css'
import './styles/components/screens.css'
import App from './components/app.riot'
import Topbar from './components/topbar.riot'
import Drawer from './components/drawer.riot'
import Icon from './components/icon.riot'
import Spinner from './components/spinner.riot'
applyStoredTheme()
watchSystemTheme()

register('topbar', Topbar)
register('drawer', Drawer)
register('icon', Icon)
register('spinner', Spinner)
for (const screen of screens) register(screen.name, screen.component)

const root = document.getElementById('root')
if (!root) {
  throw new Error('Mount point #root is missing')
}

component(App)(root, {})
