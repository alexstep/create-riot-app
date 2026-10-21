import dashboard from './icons/dashboard.svg?raw'
import done from './icons/done.svg?raw'
import group from './icons/group.svg?raw'
import logout from './icons/logout.svg?raw'
import pay from './icons/pay.svg?raw'
import plugin from './icons/plugin.svg?raw'
import settings from './icons/settings.svg?raw'
import tasks from './icons/tasks.svg?raw'
import tasksOk from './icons/tasks_ok.svg?raw'

const icons: Record<string, string> = {
  'dashboard.svg': dashboard,
  'done.svg': done,
  'group.svg': group,
  'logout.svg': logout,
  'pay.svg': pay,
  'plugin.svg': plugin,
  'settings.svg': settings,
  'tasks.svg': tasks,
  'tasks_ok.svg': tasksOk,
}

export function iconSvg(name: string): string {
  return icons[name] ?? ''
}
