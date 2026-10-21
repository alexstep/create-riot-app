import { component, register, type RiotComponent, type RiotComponentWrapper } from 'riot'
import { applyStoredTheme } from './theme'
import './styles/reset.css'
import './styles/theme.css'
import './styles/ripple.css'
import './styles/base.css'
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
import Dashboard from './components/screens/dashboard.riot'
import Groups from './components/screens/groups.riot'
import Settings from './components/screens/settings.riot'

applyStoredTheme()

function install(name: string, wrapper: RiotComponentWrapper<RiotComponent>): void {
  register(name, wrapper)
}

install('topbar', Topbar)
install('drawer', Drawer)
install('icon', Icon)
install('spinner', Spinner)
install('dashboard', Dashboard)
install('groups', Groups)
install('settings', Settings)

const root = document.getElementById('root')
if (!root) {
  throw new Error('Mount point #root is missing')
}

component(App)(root, {})
