import { component, register, type RiotComponent, type RiotComponentWrapper } from 'riot'
import './styles/app.less'
import App from './components/app.riot'
import Topbar from './components/topbar.riot'
import Drawer from './components/drawer.riot'
import Icon from './components/icon.riot'
import Spinner from './components/spinner.riot'
import Dashboard from './components/screens/dashboard.riot'
import Groups from './components/screens/groups.riot'
import Settings from './components/screens/settings.riot'

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
